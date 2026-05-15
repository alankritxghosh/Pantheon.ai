import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseOpportunityScorecard } from "./synthesize-summary.js";

const DEFAULT_TIMEOUT_MS = Number(process.env.PANTHEON_SYNTHESIZE_TIMEOUT_MS ?? 5 * 60 * 1000);

const EVIDENCE_NAME_RE = /^[A-Za-z0-9._\- ]{1,120}$/;

export const PantheonSynthesizeInput = z.object({
  evidence: z
    .array(
      z.object({
        name: z
          .string()
          .min(1)
          .max(120)
          .describe(
            "Human-readable identifier for this piece of evidence. Shown in citations. Examples: 'granola-call-2026-05-12', 'linear-PROD-412', 'slack-thread-billing-pain'.",
          ),
        content: z
          .string()
          .min(1)
          .max(200_000)
          .describe("Raw text content. Can be a meeting transcript, ticket body, customer quote, doc, anything textual."),
        source_type: z
          .string()
          .max(40)
          .optional()
          .describe("Optional tag describing where the content came from. Examples: granola, gong, slack, linear, notion, manual."),
      }),
    )
    .min(1)
    .max(200)
    .describe("Array of raw evidence blobs. The agent typically gathers these from other MCP servers (Linear, Slack, Granola, Gong, Notion, etc.)."),
  top_n: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(3)
    .describe("How many ranked opportunities to return in the structured response."),
  workspace_id: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe("Stable identifier for persistent memory across calls. Reserved for a later phase; safely ignored today."),
});

export type PantheonSynthesizeArgs = z.infer<typeof PantheonSynthesizeInput>;

export interface RankedOpportunity {
  rank: number;
  name: string;
  score: number | null;
  rationale: string;
  citation: string | null;
}

export interface PantheonSynthesizeResult {
  run_id: string;
  workspace_dir: string;
  ranked_opportunities: RankedOpportunity[];
  evidence_ledger_markdown: string;
  opportunity_scorecard_markdown: string;
  duration_seconds: number;
  validation_passed: boolean;
  validation_report_path: string | null;
  log_file: string;
}

export interface EvidenceMapping {
  blobName: string;
  safeFilename: string;
  sourceType: string | undefined;
}

export async function handlePantheonSynthesize(args: PantheonSynthesizeArgs): Promise<PantheonSynthesizeResult> {
  const runId = randomUUID();
  const root = path.join(os.homedir(), ".pantheon", "mcp-runs", runId);
  await fsp.mkdir(root, { recursive: true });

  const mappings = await writeEvidenceBlobs(root, args.evidence);

  const logFile = path.join(os.tmpdir(), `pantheon-mcp-synthesize-${runId}.log`);
  const started = Date.now();
  const exitCode = await spawnSynthesize(root, args.top_n, logFile);
  const durationSeconds = Math.round((Date.now() - started) / 1000);

  const latestDir = path.join(root, "pantheon-output", "latest");
  const scorecardPath = path.join(latestDir, "opportunity-scorecard.md");
  const evidencePath = path.join(latestDir, "evidence-ledger.md");
  const validationPath = path.join(latestDir, "validation-report.md");

  const [scorecardRaw, evidenceRaw, validationRaw] = await Promise.all([
    fsp.readFile(scorecardPath, "utf8").catch(() => ""),
    fsp.readFile(evidencePath, "utf8").catch(() => ""),
    fsp.readFile(validationPath, "utf8").catch(() => ""),
  ]);

  if (!scorecardRaw && exitCode !== 0) {
    throw new Error(
      `pantheon synthesize failed with exit code ${exitCode}. See log at ${logFile} for details.`,
    );
  }

  const scorecard = roundTripCitations(scorecardRaw, mappings);
  const evidenceLedger = roundTripCitations(evidenceRaw, mappings);
  const validationPassed = /Status:\s*Pass/i.test(validationRaw);
  const ranked = parseTopN(scorecard, args.top_n);

  return {
    run_id: runId,
    workspace_dir: root,
    ranked_opportunities: ranked,
    evidence_ledger_markdown: evidenceLedger,
    opportunity_scorecard_markdown: scorecard,
    duration_seconds: durationSeconds,
    validation_passed: validationPassed,
    validation_report_path: validationRaw ? validationPath : null,
    log_file: logFile,
  };
}

async function writeEvidenceBlobs(
  root: string,
  evidence: PantheonSynthesizeArgs["evidence"],
): Promise<EvidenceMapping[]> {
  const mappings: EvidenceMapping[] = [];
  const seenSafe = new Set<string>();

  for (let i = 0; i < evidence.length; i += 1) {
    const blob = evidence[i];
    const ordinal = String(i + 1).padStart(3, "0");
    if (!EVIDENCE_NAME_RE.test(blob.name)) {
      throw new Error(
        `Evidence name "${blob.name}" contains unsupported characters. Allowed: letters, digits, spaces, dot, underscore, hyphen. Max 120 chars.`,
      );
    }
    const slug = slugify(blob.name);
    let safeFilename = `evidence-${ordinal}-${slug}.md`;
    while (seenSafe.has(safeFilename)) {
      safeFilename = `evidence-${ordinal}-${slug}-${randomUUID().slice(0, 4)}.md`;
    }
    seenSafe.add(safeFilename);

    const frontmatter = renderFrontmatter(blob.name, blob.source_type);
    await fsp.writeFile(path.join(root, safeFilename), `${frontmatter}${blob.content.trim()}\n`, "utf8");
    mappings.push({ blobName: blob.name, safeFilename, sourceType: blob.source_type });
  }

  return mappings;
}

function renderFrontmatter(name: string, sourceType: string | undefined): string {
  const lines = ["---", `name: ${escapeYaml(name)}`];
  if (sourceType) lines.push(`source: ${escapeYaml(sourceType)}`);
  lines.push("---", "");
  return lines.join("\n");
}

function escapeYaml(value: string): string {
  if (/^[A-Za-z0-9._\- ]+$/.test(value)) return value;
  const escaped = value.replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "blob";
}

async function spawnSynthesize(workspace: string, topN: number, logFile: string): Promise<number> {
  const { command, args } = resolveBinary();
  const fullArgs = [...args, "synthesize", workspace, "--top", String(topN)];

  return new Promise((resolve, reject) => {
    const logStream = fs.createWriteStream(logFile, { flags: "w" });
    const child = spawn(command, fullArgs, {
      cwd: workspace,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream, { end: false });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      logStream.end();
      reject(
        new Error(
          `pantheon synthesize exceeded ${Math.round(DEFAULT_TIMEOUT_MS / 1000)}s timeout. Increase PANTHEON_SYNTHESIZE_TIMEOUT_MS or switch to a faster model.`,
        ),
      );
    }, DEFAULT_TIMEOUT_MS);

    child.on("exit", (code) => {
      clearTimeout(timer);
      logStream.end();
      resolve(code ?? -1);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      logStream.end();
      reject(err);
    });
  });
}

function resolveBinary(): { command: string; args: string[] } {
  const envBin = process.env.PANTHEON_MCP_BIN;
  if (envBin) return { command: process.execPath, args: [envBin] };
  return { command: "pantheon", args: [] };
}

/**
 * Replace temp-dir filenames with the human-readable evidence-blob names so the
 * PM never sees the synthetic safe-filename in citations. Order matters: longer
 * safe filenames first to prevent substring stomps.
 */
export function roundTripCitations(markdown: string, mappings: EvidenceMapping[]): string {
  if (!markdown) return markdown;
  const sorted = [...mappings].sort((a, b) => b.safeFilename.length - a.safeFilename.length);
  let result = markdown;
  for (const { blobName, safeFilename } of sorted) {
    const safeQuoted = escapeForRegex(safeFilename);
    result = result.replace(new RegExp(safeQuoted, "g"), blobName);
  }
  return result;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTopN(scorecard: string, topN: number): RankedOpportunity[] {
  if (!scorecard.trim()) return [];
  const ranked = parseOpportunityScorecard(scorecard);
  return ranked.slice(0, topN);
}
