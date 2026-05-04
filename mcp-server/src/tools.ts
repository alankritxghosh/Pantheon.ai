import path from "node:path";
import { z } from "zod";
import { createRun, getRun, listRuns } from "./runs.js";
import {
  readArtifactContent,
  startPantheonRun,
  summarizeArtifacts,
  summarizeValidation,
} from "./pantheon.js";

export const PantheonRunInput = z.object({
  directory: z
    .string()
    .describe(
      "Absolute path to the directory Pantheon should run on. Must exist. Pantheon will recursively scan supported text files (.md, .txt, .csv, .tsv, .json) and write outputs to <directory>/pantheon-output/.",
    ),
});

export const PantheonPacketInput = z.object({
  topic: z
    .string()
    .min(3)
    .describe("Free-text topic for Pantheon's standard packet mode, e.g. 'AI-native CRM for SMB sales teams'."),
  out: z
    .string()
    .optional()
    .describe(
      "Absolute path to write the packet into. Defaults to ./runs/<timestamp>/ relative to the current MCP server cwd. Provide an absolute path for deterministic placement.",
    ),
});

export const PantheonCritiqueInput = z.object({
  runFolder: z
    .string()
    .describe("Absolute path to a previously generated Pantheon run folder to critique."),
});

export const PantheonStatusInput = z.object({
  runId: z.string().uuid().describe("Run identifier returned by pantheon_run / pantheon_packet / pantheon_critique."),
});

export const PantheonReadArtifactInput = z.object({
  runId: z.string().uuid().describe("Run identifier."),
  filename: z
    .string()
    .describe(
      "Artifact filename, e.g. 'decision-packet.md'. Must be one of the standard 13 Pantheon artifact filenames. Path separators are rejected.",
    ),
});

export const PantheonListRunsInput = z.object({});

export async function handlePantheonRun(args: z.infer<typeof PantheonRunInput>) {
  const dir = path.resolve(args.directory);
  // Validate dir exists and is a directory; throw on failure
  const fs = await import("node:fs/promises");
  const stat = await fs.stat(dir);
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${dir}`);

  const state = createRun("run", dir);
  startPantheonRun(state, ["run"]);
  return {
    runId: state.runId,
    status: state.status,
    workspace: state.workspace,
    logFile: state.logFile,
    note: "Pantheon run started in background. Poll pantheon_status for progress. Typical duration: 25-35 minutes on default model.",
  };
}

export async function handlePantheonPacket(args: z.infer<typeof PantheonPacketInput>) {
  const cwd = process.cwd();
  const state = createRun("packet", cwd);
  const cliArgs = ["packet", args.topic];
  if (args.out) cliArgs.push("--out", path.resolve(args.out));
  startPantheonRun(state, cliArgs);
  return {
    runId: state.runId,
    status: state.status,
    note: "Pantheon packet started in background. Poll pantheon_status for progress.",
  };
}

export async function handlePantheonCritique(args: z.infer<typeof PantheonCritiqueInput>) {
  const folder = path.resolve(args.runFolder);
  const state = createRun("critique", folder);
  startPantheonRun(state, ["critique", folder]);
  return {
    runId: state.runId,
    status: state.status,
    note: "Pantheon critique started in background. Poll pantheon_status for progress.",
  };
}

export async function handlePantheonStatus(args: z.infer<typeof PantheonStatusInput>) {
  const state = getRun(args.runId);
  if (!state) throw new Error(`Unknown runId: ${args.runId}`);

  const elapsedMs = (state.completedAt ?? Date.now()) - state.startedAt;
  const base = {
    runId: state.runId,
    mode: state.mode,
    status: state.status,
    elapsedSeconds: Math.round(elapsedMs / 1000),
    workspace: state.workspace,
    outputDir: state.outputDir ?? null,
    recentProgress: state.recentProgress,
    logFile: state.logFile,
    exitCode: state.exitCode ?? null,
    errorMessage: state.errorMessage ?? null,
  };

  if (state.status !== "completed" || !state.outputDir) return base;

  const [artifacts, validation] = await Promise.all([
    summarizeArtifacts(state.outputDir),
    summarizeValidation(state.outputDir),
  ]);
  return { ...base, artifacts, validation };
}

export async function handlePantheonReadArtifact(args: z.infer<typeof PantheonReadArtifactInput>) {
  const state = getRun(args.runId);
  if (!state) throw new Error(`Unknown runId: ${args.runId}`);
  if (state.status !== "completed") throw new Error(`Run is not completed: ${state.status}`);
  if (!state.outputDir) throw new Error("Run has no output directory yet");
  const content = await readArtifactContent(state.outputDir, args.filename);
  return { runId: state.runId, filename: args.filename, content };
}

export async function handlePantheonListRuns(_args: z.infer<typeof PantheonListRunsInput>) {
  return {
    runs: listRuns().map((s) => ({
      runId: s.runId,
      mode: s.mode,
      status: s.status,
      startedAt: new Date(s.startedAt).toISOString(),
      completedAt: s.completedAt ? new Date(s.completedAt).toISOString() : null,
      workspace: s.workspace,
    })),
  };
}
