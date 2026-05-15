export type RunStatus = "pending" | "running" | "completed" | "failed";

export type RunMode = "run" | "packet" | "critique" | "synthesize";

export interface RunState {
  runId: string;
  mode: RunMode;
  status: RunStatus;
  startedAt: number;        // epoch ms
  completedAt?: number;     // epoch ms
  workspace: string;        // absolute path to the directory pantheon was invoked in
  outputDir?: string;       // absolute path to pantheon-output/runs/<timestamp>/, populated when known
  logFile: string;          // absolute path to /tmp/pantheon-mcp-<runId>.log
  pid?: number;
  exitCode?: number;
  errorMessage?: string;
  // last 5 stderr lines, useful for status reporting
  recentProgress: string[];
}

export interface ArtifactSummary {
  filename: string;
  exists: boolean;
  size: number;             // bytes
  passed: boolean;          // from validation-report.md if available
}

export interface ValidationSummary {
  passed: boolean;
  demoReady: boolean;
  artifactsTotal: number;
  artifactsPassed: number;
  artifactsFailed: number;
  failureNotes: string[];   // concise list, one line per failed artifact
}
