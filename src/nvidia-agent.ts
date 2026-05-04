import fs from "fs/promises";
import path from "path";
import { parseArtifactBlocks } from "./artifact-blocks.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import type { ToolContext } from "./tools.js";
import { isFlatMarkdownFilename } from "./validator.js";

interface NvidiaContext extends ToolContext {
  model: string;
}

export interface NvidiaRunResult {
  invalidArtifactNames: string[];
}

export interface NvidiaArtifactResult {
  saved: boolean;
  invalidArtifactNames: string[];
  extraArtifactNames: string[];
}

interface NvidiaResponse {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
  error?: {
    message?: string;
    code?: number | string;
  };
}

export async function runNvidiaAgent(brief: string, ctx: NvidiaContext): Promise<NvidiaRunResult> {
  const output = await runNvidia(buildNvidiaPrompt(brief), ctx);
  const artifacts = parseArtifactBlocks(output);
  if (artifacts.length === 0) {
    await preserveRawOutput(ctx.workdir, output);
    console.error(`[pantheon] no artifact blocks found; saved raw NVIDIA output to ${path.join(ctx.workdir, "raw-output.md")}`);
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
    await fs.writeFile(path.join(ctx.workdir, filename), artifact.content.trimStart(), "utf8");
    console.error(`[pantheon] saved ${filename}`);
  }

  return { invalidArtifactNames };
}

export async function runNvidiaArtifact(
  prompt: string,
  expectedFilename: string,
  ctx: NvidiaContext,
): Promise<NvidiaArtifactResult> {
  const output = await runNvidia(buildSingleArtifactNvidiaPrompt(prompt, expectedFilename), ctx);
  const artifacts = parseArtifactBlocks(output);
  if (artifacts.length === 0) {
    await preserveRawOutput(ctx.workdir, output, `raw-output-${expectedFilename}`);
    console.error(`[pantheon] no artifact block found for ${expectedFilename}; saved raw NVIDIA output`);
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

    await fs.writeFile(path.join(ctx.workdir, filename), artifact.content.trimStart(), "utf8");
    console.error(`[pantheon] saved ${filename}`);
    saved = true;
  }

  return { saved, invalidArtifactNames, extraArtifactNames };
}

async function runNvidia(prompt: string, ctx: NvidiaContext): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY not set. Add it to .env or choose another provider.");
  }

  const baseUrl = (process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
  const maxTokens = Number(process.env.NVIDIA_MAX_TOKENS ?? 32768);
  const temperature = Number(process.env.NVIDIA_TEMPERATURE ?? 0.3);
  const enableThinking = process.env.NVIDIA_ENABLE_THINKING === "1";

  console.error(`[pantheon] nvidia model: ${ctx.model} (${baseUrl})`);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: ctx.model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        max_tokens: maxTokens,
        temperature,
        chat_template_kwargs: { enable_thinking: enableThinking },
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await preserveRawOutput(ctx.workdir, "", "raw-output-nvidia-error", message);
    throw new Error(`NVIDIA request failed: ${message}`);
  }

  const text = await response.text();
  if (!response.ok) {
    await preserveRawOutput(ctx.workdir, text, "raw-output-nvidia-error");
    throw new Error(`NVIDIA request failed with HTTP ${response.status}: ${text.slice(0, 1000)}`);
  }

  let json: NvidiaResponse;
  try {
    json = JSON.parse(text) as NvidiaResponse;
  } catch {
    await preserveRawOutput(ctx.workdir, text, "raw-output-nvidia-error");
    throw new Error("NVIDIA returned non-JSON output.");
  }

  if (json.error) {
    await preserveRawOutput(ctx.workdir, text, "raw-output-nvidia-error");
    const code = json.error.code === undefined ? "" : ` code=${json.error.code}`;
    throw new Error(`NVIDIA model error: ${json.error.message ?? "unknown error"}${code}`);
  }

  return json.choices?.[0]?.message?.content ?? "";
}

function buildNvidiaPrompt(brief: string): string {
  const runDate = new Date().toISOString().slice(0, 10);
  return `${SYSTEM_PROMPT}

# NVIDIA GLM adapter instructions

You are running GLM 4.7 through NVIDIA's OpenAI-compatible chat completions API. Produce the same Pantheon-quality work, but emit each Markdown artifact using this exact delimiter format:

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

function buildSingleArtifactNvidiaPrompt(prompt: string, expectedFilename: string): string {
  const runDate = new Date().toISOString().slice(0, 10);
  return `${SYSTEM_PROMPT}

# NVIDIA GLM single-artifact adapter instructions

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
    `# Raw NVIDIA Output

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
