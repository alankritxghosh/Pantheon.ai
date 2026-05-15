import { discoverWorkspaceFiles } from "../workspace.js";

export type CheckResult = {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
  fix?: string;
};

export type DoctorReport = {
  results: CheckResult[];
  allPass: boolean;
};

export interface DoctorOptions {
  provider?: string;
  model?: string;
  embedProvider?: string;
  workspaceDir?: string;
}

const CHECK_TIMEOUT_MS = 5_000;
const DEFAULT_OLLAMA_HOST = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "qwen3:14b";
const DEFAULT_EMBED_MODEL = "nomic-embed-text";

function ollamaHost(): string {
  const raw = process.env.OLLAMA_HOST ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_HOST;
  return raw.replace(/\/$/, "");
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isTimeoutError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { name?: string; code?: string };
  return e.name === "AbortError" || e.code === "ABORT_ERR";
}

function checkNode(): CheckResult {
  const version = process.version;
  const major = Number(version.replace(/^v/, "").split(".")[0] ?? "0");
  if (major >= 20) {
    return { name: "Node version", status: "pass", detail: `Node ${version}` };
  }
  return {
    name: "Node version",
    status: "fail",
    detail: `Node 20+ required, found ${version}`,
    fix: "Install Node 20+ from https://nodejs.org",
  };
}

async function checkOllamaReachable(host: string): Promise<CheckResult> {
  try {
    const res = await fetchWithTimeout(`${host}/api/version`);
    if (!res.ok) {
      return {
        name: "Generation provider",
        status: "fail",
        detail: `Ollama at ${host} returned HTTP ${res.status}`,
        fix: "Start Ollama: ollama serve",
      };
    }
    return { name: "Generation provider", status: "pass", detail: `Ollama reachable at ${host}` };
  } catch (err) {
    const timedOut = isTimeoutError(err);
    const reason = timedOut
      ? `timed out after ${CHECK_TIMEOUT_MS}ms`
      : err instanceof Error
        ? err.message
        : String(err);
    return {
      name: "Generation provider",
      status: "fail",
      detail: `Ollama unreachable at ${host} (${reason})`,
      fix: "Start Ollama: ollama serve",
    };
  }
}

function checkEnvVar(name: string, label: string, fixHint: string): CheckResult {
  const value = process.env[name];
  if (value && value.trim().length > 0) {
    return { name: label, status: "pass", detail: `${name} is set` };
  }
  return {
    name: label,
    status: "fail",
    detail: `${name} is not set`,
    fix: fixHint,
  };
}

async function fetchOllamaTags(host: string): Promise<string[] | { error: string; timedOut: boolean }> {
  try {
    const res = await fetchWithTimeout(`${host}/api/tags`);
    if (!res.ok) {
      return { error: `HTTP ${res.status}`, timedOut: false };
    }
    const body = (await res.json()) as { models?: Array<{ name?: string }> };
    return (body.models ?? []).map((m) => m.name ?? "").filter(Boolean);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
      timedOut: isTimeoutError(err),
    };
  }
}

function tagsHasModel(tags: string[], model: string): boolean {
  if (tags.includes(model)) return true;
  // Ollama tags include the `:tag` portion; allow bare-name matching when user omitted the tag.
  if (!model.includes(":")) {
    return tags.some((t) => t.split(":")[0] === model);
  }
  return false;
}

async function checkOllamaModel(host: string, model: string): Promise<CheckResult> {
  const tags = await fetchOllamaTags(host);
  if (!Array.isArray(tags)) {
    const reason = tags.timedOut ? `timed out after ${CHECK_TIMEOUT_MS}ms` : tags.error;
    return {
      name: `Generation model (${model})`,
      status: "fail",
      detail: `Could not query Ollama tags (${reason})`,
      fix: "Start Ollama: ollama serve",
    };
  }
  if (tagsHasModel(tags, model)) {
    return {
      name: `Generation model (${model})`,
      status: "pass",
      detail: `Model ${model} is available locally`,
    };
  }
  return {
    name: `Generation model (${model})`,
    status: "fail",
    detail: `Model ${model} not pulled`,
    fix: `ollama pull ${model}`,
  };
}

async function checkEmbeddingModel(host: string, ollamaGenerationOk: boolean): Promise<CheckResult> {
  if (!ollamaGenerationOk) {
    return {
      name: `Embedding model (${DEFAULT_EMBED_MODEL})`,
      status: "warn",
      detail: `Cannot verify ${DEFAULT_EMBED_MODEL} until Ollama is reachable`,
      fix: `ollama pull ${DEFAULT_EMBED_MODEL}`,
    };
  }
  const tags = await fetchOllamaTags(host);
  if (!Array.isArray(tags)) {
    return {
      name: `Embedding model (${DEFAULT_EMBED_MODEL})`,
      status: "warn",
      detail: `Could not query Ollama tags to verify ${DEFAULT_EMBED_MODEL}`,
      fix: `ollama pull ${DEFAULT_EMBED_MODEL}`,
    };
  }
  if (tagsHasModel(tags, DEFAULT_EMBED_MODEL)) {
    return {
      name: `Embedding model (${DEFAULT_EMBED_MODEL})`,
      status: "pass",
      detail: `Embedding model ${DEFAULT_EMBED_MODEL} is available locally`,
    };
  }
  return {
    name: `Embedding model (${DEFAULT_EMBED_MODEL})`,
    status: "warn",
    detail: `Embedding model ${DEFAULT_EMBED_MODEL} not pulled (required only for styled runs)`,
    fix: `ollama pull ${DEFAULT_EMBED_MODEL}`,
  };
}

async function checkWorkspace(workspaceDir: string): Promise<CheckResult> {
  try {
    const discovery = await discoverWorkspaceFiles(workspaceDir);
    const count = discovery.supportedFiles.length;
    if (count > 0) {
      return {
        name: "Workspace",
        status: "pass",
        detail: `Workspace contains ${count} supported file${count === 1 ? "" : "s"}`,
      };
    }
    return {
      name: "Workspace",
      status: "fail",
      detail: "Workspace contains no ingestible files",
      fix: "Check that your folder has .md/.txt/.csv/.tsv/.json/.sql/.log/.yaml/.yml/.html/.xml files",
    };
  } catch (err) {
    return {
      name: "Workspace",
      status: "fail",
      detail: `Failed to scan workspace: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function normalizeProvider(provider?: string): string {
  if (!provider) return "ollama";
  return provider;
}

export async function runDoctor(opts: DoctorOptions = {}): Promise<DoctorReport> {
  const provider = normalizeProvider(opts.provider);
  const embedProvider = opts.embedProvider ?? "ollama";
  const results: CheckResult[] = [];

  results.push(checkNode());

  const host = ollamaHost();
  let generationOk = false;

  if (provider === "fixture") {
    results.push({
      name: "Generation provider (fixture)",
      status: "pass",
      detail: "Fixture provider replays canned artifacts from PANTHEON_FIXTURE_DIR; no external services required",
    });
    generationOk = true;
  } else if (provider === "ollama") {
    const reach = await checkOllamaReachable(host);
    results.push(reach);
    generationOk = reach.status === "pass";

    const modelName = opts.model || DEFAULT_OLLAMA_MODEL;
    if (generationOk) {
      results.push(await checkOllamaModel(host, modelName));
    } else {
      results.push({
        name: `Generation model (${modelName})`,
        status: "fail",
        detail: `Cannot verify model until Ollama is reachable`,
        fix: `ollama pull ${modelName} (after starting Ollama)`,
      });
    }
  } else if (provider === "anthropic") {
    results.push(
      checkEnvVar("ANTHROPIC_API_KEY", "Generation provider (anthropic)", "export ANTHROPIC_API_KEY=..."),
    );
  } else if (provider === "openai" || provider === "openai-cli") {
    results.push(
      checkEnvVar("OPENAI_API_KEY", `Generation provider (${provider})`, "export OPENAI_API_KEY=..."),
    );
  } else if (provider === "claude-cli" || provider === "gemini-cli" || provider === "cli") {
    results.push({
      name: `Generation provider (${provider})`,
      status: "warn",
      detail: `Readiness for ${provider} is verified at invocation time; ensure the underlying CLI is installed and authenticated`,
    });
  } else {
    results.push({
      name: `Generation provider (${provider})`,
      status: "warn",
      detail: `Unknown provider "${provider}"; skipping reachability check`,
    });
  }

  if (provider === "fixture") {
    results.push({
      name: "Embedding provider (skipped)",
      status: "pass",
      detail: "Fixture provider does not use embeddings",
    });
  } else if (embedProvider === "ollama") {
    // If Ollama is the generation provider too, generationOk reflects reachability.
    // If not, attempt an independent reachability via the tags check inside checkEmbeddingModel.
    const ollamaAlreadyChecked = provider === "ollama";
    const reachable = ollamaAlreadyChecked ? generationOk : true;
    results.push(await checkEmbeddingModel(host, reachable));
  } else if (embedProvider === "openai") {
    results.push(
      checkEnvVar("OPENAI_API_KEY", "Embedding provider (openai)", "export OPENAI_API_KEY=..."),
    );
  } else {
    results.push({
      name: `Embedding provider (${embedProvider})`,
      status: "warn",
      detail: `Unknown embed provider "${embedProvider}"; skipping`,
    });
  }

  if (opts.workspaceDir) {
    results.push(await checkWorkspace(opts.workspaceDir));
  }

  const allPass = results.every((r) => r.status !== "fail");
  return { results, allPass };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push("Pantheon readiness check:");
  lines.push("");
  for (const r of report.results) {
    const glyph = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "⚠";
    lines.push(`${glyph} ${r.detail}`);
    if (r.fix && r.status !== "pass") {
      lines.push(`    Fix: ${r.fix}`);
    }
  }
  const failures = report.results.filter((r) => r.status === "fail").length;
  const warnings = report.results.filter((r) => r.status === "warn").length;
  lines.push("");
  if (failures === 0 && warnings === 0) {
    lines.push("All checks passed.");
  } else {
    const parts: string[] = [];
    parts.push(`${failures} failure${failures === 1 ? "" : "s"}`);
    parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
    lines.push(`${parts.join(", ")}. Run \`pantheon doctor\` to re-check.`);
  }
  return lines.join("\n");
}
