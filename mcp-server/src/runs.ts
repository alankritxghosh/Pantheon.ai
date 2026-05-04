import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import type { RunMode, RunState } from "./types.js";

const runs = new Map<string, RunState>();

export function createRun(mode: RunMode, workspace: string): RunState {
  const runId = randomUUID();
  const state: RunState = {
    runId,
    mode,
    status: "pending",
    startedAt: Date.now(),
    workspace: path.resolve(workspace),
    logFile: path.join(os.tmpdir(), `pantheon-mcp-${runId}.log`),
    recentProgress: [],
  };
  runs.set(runId, state);
  return state;
}

export function getRun(runId: string): RunState | undefined {
  return runs.get(runId);
}

export function listRuns(): RunState[] {
  return [...runs.values()].sort((a, b) => b.startedAt - a.startedAt);
}

export function updateRun(runId: string, patch: Partial<RunState>): RunState | undefined {
  const state = runs.get(runId);
  if (!state) return undefined;
  Object.assign(state, patch);
  return state;
}

export function appendProgress(runId: string, line: string, maxLines = 5): void {
  const state = runs.get(runId);
  if (!state) return;
  state.recentProgress.push(line);
  if (state.recentProgress.length > maxLines) {
    state.recentProgress.splice(0, state.recentProgress.length - maxLines);
  }
}
