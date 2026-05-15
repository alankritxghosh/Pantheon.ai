import fs from "fs/promises";
import path from "path";
import { normalizeArtifactContent, parseArtifactBlocks, recoverSingleArtifactContent } from "./artifact-blocks.js";
import { postOllamaJsonStream, type OllamaTransportError } from "./ollama/http-client.js";
import { SINGLE_ARTIFACT_SYSTEM_PROMPT, SYSTEM_PROMPT } from "./prompt.js";
import type { ToolContext } from "./tools.js";
import { isFlatMarkdownFilename } from "./validator.js";

interface OllamaContext extends ToolContext {
  model: string;
}

export interface OllamaRunResult {
  invalidArtifactNames: string[];
}

export interface OllamaArtifactResult {
  saved: boolean;
  invalidArtifactNames: string[];
  extraArtifactNames: string[];
}

export async function runOllamaAgent(brief: string, ctx: OllamaContext): Promise<OllamaRunResult> {
  const output = await runOllama(buildOllamaPrompt(brief), ctx);
  const artifacts = parseArtifactBlocks(output);
  if (artifacts.length === 0) {
    await preserveRawOutput(ctx.workdir, output);
    console.error(`[pantheon] no artifact blocks found; saved raw Ollama output to ${path.join(ctx.workdir, "raw-output.md")}`);
    return { invalidArtifactNames: [] };
  }

  const invalidArtifactNames: string[] = [];
  for (const artifact of artifacts) {
    const filename = safeFilename(artifact.filename);
    if (!filename) {
      invalidArtifactNames.push(artifact.filename);
      console.error(`[pantheon] rejected invalid artifact filename: ${artifact.filename}`);
      continue;
    }
    await fs.writeFile(path.join(ctx.workdir, filename), normalizeArtifactContent(artifact.content), "utf8");
    console.error(`[pantheon] saved ${filename}`);
  }

  return { invalidArtifactNames };
}

export async function runOllamaArtifact(
  prompt: string,
  expectedFilename: string,
  ctx: OllamaContext,
): Promise<OllamaArtifactResult> {
  const output = await runOllama(buildSingleArtifactOllamaPrompt(prompt, expectedFilename), ctx);
  const artifacts = parseArtifactBlocks(output);
  if (artifacts.length === 0) {
    const recovered = recoverSingleArtifactContent(output);
    if (recovered) {
      await fs.writeFile(path.join(ctx.workdir, expectedFilename), recovered, "utf8");
      console.error(`[pantheon] recovered ${expectedFilename} from raw Ollama output`);
      return { saved: true, invalidArtifactNames: [], extraArtifactNames: [] };
    }
    await preserveRawOutput(ctx.workdir, output, `raw-output-${expectedFilename}`);
    console.error(`[pantheon] no artifact block found for ${expectedFilename}; saved raw Ollama output`);
    return { saved: false, invalidArtifactNames: [], extraArtifactNames: [] };
  }

  const invalidArtifactNames: string[] = [];
  const extraArtifactNames: string[] = [];
  let saved = false;
  for (const artifact of artifacts) {
    if (artifact.filename !== expectedFilename) {
      const safe = safeFilename(artifact.filename);
      if (!safe) invalidArtifactNames.push(artifact.filename);
      else extraArtifactNames.push(artifact.filename);
      console.error(`[pantheon] rejected unexpected artifact filename for ${expectedFilename}: ${artifact.filename}`);
      continue;
    }

    const filename = safeFilename(artifact.filename);
    if (!filename) {
      invalidArtifactNames.push(artifact.filename);
      console.error(`[pantheon] rejected invalid artifact filename: ${artifact.filename}`);
      continue;
    }

    await fs.writeFile(path.join(ctx.workdir, filename), normalizeArtifactContent(artifact.content), "utf8");
    console.error(`[pantheon] saved ${filename}`);
    saved = true;
  }

  return { saved, invalidArtifactNames, extraArtifactNames };
}

async function runOllama(prompt: string, ctx: OllamaContext): Promise<string> {
  const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  const model = ctx.model;
  const numCtx = ollamaNumCtx();
  const callTimeoutMs = ollamaCallTimeoutMs();
  const firstTokenTimeoutMs = ollamaFirstTokenTimeoutMs();

  await ensureOllamaReachable(baseUrl);
  await ensureOllamaModel(baseUrl, model);

  console.error(
    `[pantheon] ollama model: ${model} (${baseUrl}, num_ctx=${numCtx}, timeout_ms=${callTimeoutMs}, first_token_timeout_ms=${firstTokenTimeoutMs})`,
  );

  try {
    const result = await postOllamaJsonStreamWithRetry(
      baseUrl,
      "/api/chat",
      {
        model,
        stream: true,
        options: { num_ctx: numCtx },
        messages: [{ role: "user", content: prompt }],
      },
      { timeoutMs: callTimeoutMs, firstTokenTimeoutMs },
    );
    return result.content;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const raw = isOllamaTransportError(error) ? error.raw : "";
    await preserveRawOutput(ctx.workdir, raw, "raw-output-ollama-error", message);
    throw new Error(
      `Ollama request failed. Make sure Ollama is running and the model is available: ${message}`,
    );
  }
}

function ollamaNumCtx(): number {
  const raw = process.env.PANTHEON_OLLAMA_NUM_CTX ?? process.env.OLLAMA_NUM_CTX ?? "";
  const parsed = raw ? Number(raw) : 16_384;
  if (Number.isFinite(parsed) && parsed >= 4_096) {
    return Math.floor(parsed);
  }
  return 16_384;
}

function ollamaCallTimeoutMs(): number {
  const raw = process.env.PANTHEON_OLLAMA_CALL_TIMEOUT_MS ?? "";
  const parsed = raw ? Number(raw) : 900_000;
  if (Number.isFinite(parsed) && parsed >= 30_000) {
    return Math.floor(parsed);
  }
  return 900_000;
}

function ollamaFirstTokenTimeoutMs(): number {
  const raw = process.env.PANTHEON_OLLAMA_FIRST_TOKEN_TIMEOUT_MS ?? "";
  const parsed = raw ? Number(raw) : 360_000;
  if (Number.isFinite(parsed) && parsed >= 10_000) {
    return Math.floor(parsed);
  }
  return 360_000;
}

async function postOllamaJsonStreamWithRetry(
  baseUrl: string,
  pathName: string,
  payload: unknown,
  options: { timeoutMs: number; firstTokenTimeoutMs: number },
): Promise<{ content: string; raw: string }> {
  const attempts = 2;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await postOllamaJsonStream(baseUrl, pathName, payload, {
        ...options,
        onLog: (message) => console.error(`[pantheon] ${message}`),
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts && shouldRetryOllamaTransport(error)) {
        console.error(`[pantheon] ollama chat request failed; retrying (${attempt + 1}/${attempts}): ${error instanceof Error ? error.message : String(error)}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function shouldRetryOllamaTransport(error: unknown): boolean {
  if (!isOllamaTransportError(error)) return true;
  return error.code === "connection" && !error.raw;
}

function isOllamaTransportError(error: unknown): error is OllamaTransportError {
  return error instanceof Error && error.name === "OllamaTransportError";
}

async function ensureOllamaReachable(baseUrl: string): Promise<void> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Ollama is not reachable at ${baseUrl} (${message}).\n\n` +
        `Pantheon runs entirely on local Ollama. To get started:\n` +
        `  macOS:  brew install ollama  &&  ollama serve\n` +
        `  Linux:  curl -fsSL https://ollama.com/install.sh | sh  &&  ollama serve\n` +
        `  Windows: download installer from https://ollama.com/download\n\n` +
        `Then re-run this command.`,
    );
  }
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string; model?: string }>;
}

async function ensureOllamaModel(baseUrl: string, model: string): Promise<void> {
  let tags: OllamaTagsResponse;
  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    tags = (await response.json()) as OllamaTagsResponse;
  } catch {
    tags = {};
  }

  const installed = (tags.models ?? []).some((entry) => {
    const name = entry.name ?? entry.model ?? "";
    return name === model || name === `${model}:latest`;
  });
  if (installed) return;

  console.error(`[pantheon] model "${model}" not found locally. Pulling via Ollama (one-time download)...`);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: true }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to start model pull for "${model}": ${message}`);
  }

  if (!response.ok || !response.body) {
    const text = response.body ? await response.text() : "";
    throw new Error(
      `Ollama pull failed for "${model}" (HTTP ${response.status}). ${text.slice(0, 500)}`.trim(),
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastStatus = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as { status?: string; error?: string; completed?: number; total?: number };
        if (event.error) {
          throw new Error(`Ollama pull error: ${event.error}`);
        }
        const status = event.status ?? "";
        if (status && status !== lastStatus) {
          if (event.total && event.completed !== undefined) {
            const pct = Math.floor((event.completed / event.total) * 100);
            console.error(`[pantheon] pull: ${status} ${pct}%`);
          } else {
            console.error(`[pantheon] pull: ${status}`);
          }
          lastStatus = status;
        }
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message.startsWith("Ollama pull error")) {
          throw parseError;
        }
      }
    }
  }
  console.error(`[pantheon] model "${model}" ready.`);
}

function buildOllamaPrompt(brief: string): string {
  const runDate = new Date().toISOString().slice(0, 10);
  return `${SYSTEM_PROMPT}

# Ollama adapter instructions

You are running through Ollama. Produce the same Pantheon-quality work, but emit each Markdown artifact using this exact delimiter format:

<<<PANTHEON_ARTIFACT filename="evidence-ledger.md">>>
...markdown...
<<<END_PANTHEON_ARTIFACT>>>

Rules:
- Emit one or more artifact blocks. Do not rely on chat text as the deliverable.
- Use kebab-case Markdown filenames only. Do not include folders, slashes, or backslashes in artifact filenames.
- If evidence is missing, label it Assumption, Inference, Evidence gap, or Data needed.
- Current run date: ${runDate}. Model/provider claims are time-sensitive; use current runtime/user-provided models or capability tiers.

# User brief

${brief}`;
}

function buildSingleArtifactOllamaPrompt(prompt: string, expectedFilename: string): string {
  const runDate = new Date().toISOString().slice(0, 10);
  return `${SINGLE_ARTIFACT_SYSTEM_PROMPT}

# Ollama single-artifact adapter instructions

Produce exactly one Markdown artifact using this exact delimiter format and filename:

<<<PANTHEON_ARTIFACT filename="${expectedFilename}">>>
...markdown...
<<<END_PANTHEON_ARTIFACT>>>

Rules:
- Emit exactly one artifact block.
- The filename must be exactly \`${expectedFilename}\`.
- Do not emit \`context-summary.md\`, \`validation-report.md\`, \`raw-output.md\`, nested paths, or any extra artifact.
- Do not rely on chat text as the deliverable.
- Current run date: ${runDate}. Model/provider claims are time-sensitive; use current runtime/user-provided models or capability tiers.
- If evidence is missing, label it Assumption, Inference, Evidence gap, or Data needed.

# Artifact task

${prompt}`;
}

function safeFilename(name: string): string | null {
  if (!isFlatMarkdownFilename(name)) return null;
  if (name === "validation-report.md" || name === "raw-output.md" || name === "context-summary.md") return null;
  return name;
}

async function preserveRawOutput(
  workdir: string,
  stdout: string,
  basename = "raw-output",
  stderr = "",
): Promise<void> {
  const safeBase = basename.replace(/\.md$/i, "").replace(/[^a-z0-9._-]/gi, "-");
  await fs.writeFile(
    path.join(workdir, `${safeBase}.md`),
    `# Raw Ollama Output

## stdout

\`\`\`text
${stdout}
\`\`\`

## stderr

\`\`\`text
${stderr}
\`\`\`
`,
    "utf8",
  );
}
