import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { appendProgress, updateRun } from "./runs.js";
import type { ArtifactSummary, RunState, ValidationSummary } from "./types.js";

const STANDARD_ARTIFACTS = [
  "evidence-ledger.md",
  "product-vision.md",
  "user-personas-jtbd.md",
  "competitive-deconstruction.md",
  "opportunity-scorecard.md",
  "prd-v1.md",
  "system-design.md",
  "evals.md",
  "roadmap.md",
  "launch-plan.md",
  "risk-review.md",
  "decision-packet.md",
  "quality-report.md",
];

function resolvePantheonBinary(): { command: string; args: string[] } {
  // PANTHEON_MCP_BIN env var wins if set (absolute path to dist/index.js)
  const envBin = process.env.PANTHEON_MCP_BIN;
  if (envBin) {
    return { command: process.execPath, args: [envBin] };
  }
  // Fall back to `pantheon` on PATH (requires `npm link` from main package)
  return { command: "pantheon", args: [] };
}

export function startPantheonRun(state: RunState, extraArgs: string[]): void {
  const { command, args: binArgs } = resolvePantheonBinary();
  const args = [...binArgs, ...extraArgs];

  const logStream = fs.createWriteStream(state.logFile, { flags: "w" });
  const child = spawn(command, args, {
    cwd: state.workspace,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  state.pid = child.pid;
  state.status = "running";

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream, { end: false });

  // Tail stderr for progress events
  let stderrBuffer = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderrBuffer += chunk.toString("utf8");
    const lines = stderrBuffer.split("\n");
    stderrBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      // Capture only meaningful pantheon log lines
      if (
        line.includes("[pantheon] pipeline:") ||
        line.includes("[pantheon] rescue:") ||
        line.includes("[pantheon] validation:") ||
        line.includes("[pantheon] artifacts in:") ||
        line.startsWith("FATAL")
      ) {
        appendProgress(state.runId, line.trim());
      }
      // Capture the output dir as soon as pantheon prints it
      const match = line.match(/\[pantheon\] (?:workdir|artifacts in): (.+)/);
      if (match && !state.outputDir) {
        updateRun(state.runId, { outputDir: match[1].trim() });
      }
    }
  });

  child.on("exit", (code) => {
    logStream.end();
    updateRun(state.runId, {
      status: code === 0 ? "completed" : "failed",
      completedAt: Date.now(),
      exitCode: code ?? -1,
    });
  });

  child.on("error", (err) => {
    logStream.end();
    updateRun(state.runId, {
      status: "failed",
      completedAt: Date.now(),
      errorMessage: err.message,
    });
  });
}

export async function summarizeArtifacts(outputDir: string): Promise<ArtifactSummary[]> {
  const summaries: ArtifactSummary[] = [];
  const validationFailed = new Set<string>();
  try {
    const validationReport = await fsp.readFile(
      path.join(outputDir, "validation-report.md"),
      "utf8",
    );
    // Parse the artifact table - failed rows have "| Fail |" in them
    for (const line of validationReport.split("\n")) {
      const match = line.match(/^\|\s*(\S+\.md)\s*\|\s*Fail\s*\|/);
      if (match) validationFailed.add(match[1]);
    }
  } catch {
    // No validation report - leave failed set empty
  }

  for (const filename of STANDARD_ARTIFACTS) {
    const filepath = path.join(outputDir, filename);
    try {
      const stat = await fsp.stat(filepath);
      summaries.push({
        filename,
        exists: true,
        size: stat.size,
        passed: !validationFailed.has(filename),
      });
    } catch {
      summaries.push({ filename, exists: false, size: 0, passed: false });
    }
  }
  return summaries;
}

export async function summarizeValidation(outputDir: string): Promise<ValidationSummary | null> {
  try {
    const report = await fsp.readFile(path.join(outputDir, "validation-report.md"), "utf8");
    const passed = /Status:\s*Pass/i.test(report);
    const demoReady = /Demo readiness:\s*Demo-ready/i.test(report);
    const failureNotes: string[] = [];
    let total = 0;
    let failed = 0;
    for (const line of report.split("\n")) {
      const match = line.match(/^\|\s*(\S+\.md)\s*\|\s*(Pass|Fail)\s*\|.*\|.*\|.*\|\s*(.+?)\s*\|$/);
      if (match) {
        total++;
        if (match[2] === "Fail") {
          failed++;
          failureNotes.push(`${match[1]}: ${match[3]}`);
        }
      }
    }
    return {
      passed,
      demoReady,
      artifactsTotal: total,
      artifactsPassed: total - failed,
      artifactsFailed: failed,
      failureNotes,
    };
  } catch {
    return null;
  }
}

export async function readArtifactContent(outputDir: string, filename: string): Promise<string> {
  // Reject anything that looks like a path traversal attempt
  if (filename.includes("/") || filename.includes("\\") || filename.startsWith(".")) {
    throw new Error(`Invalid artifact filename: ${filename}`);
  }
  if (!filename.endsWith(".md")) {
    throw new Error(`Artifact filename must end with .md: ${filename}`);
  }
  return fsp.readFile(path.join(outputDir, filename), "utf8");
}
