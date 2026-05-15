import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { normalizeArtifactContent, parseArtifactBlocks, recoverSingleArtifactContent } from "./artifact-blocks.js";
import { SINGLE_ARTIFACT_SYSTEM_PROMPT, SYSTEM_PROMPT } from "./prompt.js";
import type { ToolContext } from "./tools.js";
import { isFlatMarkdownFilename } from "./validator.js";

export type CliProvider = "claude-cli" | "openai-cli" | "gemini-cli";

interface CliContext extends ToolContext {
  provider: CliProvider;
  model?: string;
}

export interface CliRunResult {
  invalidArtifactNames: string[];
}

export interface CliArtifactResult {
  saved: boolean;
  invalidArtifactNames: string[];
  extraArtifactNames: string[];
}

class CliCommandError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(message);
  }
}

const DEFAULT_COMMANDS: Record<CliProvider, string> = {
  "claude-cli": `claude -p "$(cat "{{prompt_file}}")"`,
  "openai-cli": `openai responses create -m "{{model}}" -i "$(cat "{{prompt_file}}")"`,
  "gemini-cli": `gemini --model "{{model}}" -p "$(cat "{{prompt_file}}")"`,
};

const COMMAND_ENV: Record<CliProvider, string> = {
  "claude-cli": "PANTHEON_CLAUDE_CLI_COMMAND",
  "openai-cli": "PANTHEON_OPENAI_CLI_COMMAND",
  "gemini-cli": "PANTHEON_GEMINI_CLI_COMMAND",
};

export async function runCliAgent(brief: string, ctx: CliContext): Promise<CliRunResult> {
  const prompt = buildCliPrompt(brief);
  const promptFile = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "pantheon-")),
    "prompt.md",
  );
  await fs.writeFile(promptFile, prompt, "utf8");

  const model = ctx.model ?? modelForProvider(ctx.provider);
  const command = commandForProvider(ctx.provider)
    .replaceAll("{{prompt_file}}", shellEscape(promptFile))
    .replaceAll("{{model}}", shellEscape(model))
    .replaceAll("{{out}}", shellEscape(ctx.workdir));

  console.error(`[pantheon] cli command: ${redactCommand(command)}`);
  let output: { stdout: string; stderr: string };
  try {
    output = await runShell(command);
  } catch (error) {
    if (error instanceof CliCommandError) {
      await preserveRawOutput(ctx.workdir, error.stdout, error.stderr);
      if (isProviderCapacityError(`${error.message}\n${error.stdout}\n${error.stderr}`)) {
        console.error(
          "[pantheon] Provider/model capacity or rate limit failure. Pantheon launched correctly, but the selected model provider could not serve the request right now. Try another model/provider or retry later.",
        );
      }
    }
    throw error;
  }

  const artifacts = parseArtifactBlocks(output.stdout);
  if (artifacts.length === 0) {
    await preserveRawOutput(ctx.workdir, output.stdout, output.stderr);
    console.error(
      `[pantheon] no artifact blocks found; saved raw CLI output to ${path.join(ctx.workdir, "raw-output.md")}`,
    );
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
    const filepath = path.join(ctx.workdir, filename);
    await fs.writeFile(filepath, normalizeArtifactContent(artifact.content), "utf8");
    console.error(`[pantheon] saved ${filename}`);
  }

  return { invalidArtifactNames };
}

export async function runCliArtifact(
  prompt: string,
  expectedFilename: string,
  ctx: CliContext,
): Promise<CliArtifactResult> {
  const promptFile = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "pantheon-")),
    "prompt.md",
  );
  await fs.writeFile(promptFile, buildSingleArtifactCliPrompt(prompt, expectedFilename), "utf8");

  const model = ctx.model ?? modelForProvider(ctx.provider);
  const command = commandForProvider(ctx.provider)
    .replaceAll("{{prompt_file}}", shellEscape(promptFile))
    .replaceAll("{{model}}", shellEscape(model))
    .replaceAll("{{out}}", shellEscape(ctx.workdir));

  console.error(`[pantheon] artifact ${expectedFilename}: ${redactCommand(command)}`);
  let output: { stdout: string; stderr: string };
  try {
    output = await runShell(command);
  } catch (error) {
    if (error instanceof CliCommandError) {
      await preserveRawOutput(ctx.workdir, error.stdout, error.stderr, `raw-output-${expectedFilename}`);
      if (isProviderCapacityError(`${error.message}\n${error.stdout}\n${error.stderr}`)) {
        console.error(
          "[pantheon] Provider/model capacity or rate limit failure. Pantheon launched correctly, but the selected model provider could not serve the request right now. Try another model/provider or retry later.",
        );
      }
    }
    throw error;
  }

  const artifacts = parseArtifactBlocks(output.stdout);
  if (artifacts.length === 0) {
    const recovered = recoverSingleArtifactContent(output.stdout);
    if (recovered) {
      await fs.writeFile(path.join(ctx.workdir, expectedFilename), recovered, "utf8");
      console.error(`[pantheon] recovered ${expectedFilename} from raw CLI output`);
      return { saved: true, invalidArtifactNames: [], extraArtifactNames: [] };
    }
    await preserveRawOutput(ctx.workdir, output.stdout, output.stderr, `raw-output-${expectedFilename}`);
    console.error(
      `[pantheon] no artifact block found for ${expectedFilename}; saved raw CLI output`,
    );
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

function buildCliPrompt(brief: string): string {
  const runDate = new Date().toISOString().slice(0, 10);
  return `${SYSTEM_PROMPT}

# CLI adapter instructions

You are running through a generic terminal model CLI, so you may not have access to Pantheon's native save_artifact/read_artifact tools. Produce the same Pantheon-quality work, but emit each Markdown artifact using this exact delimiter format:

<<<PANTHEON_ARTIFACT filename="evidence-ledger.md">>>
...markdown...
<<<END_PANTHEON_ARTIFACT>>>

Rules:
- Emit one or more artifact blocks. Do not rely on chat text as the deliverable.
- Use kebab-case Markdown filenames only. Do not include folders, slashes, or backslashes in artifact filenames.
- Include citations as normal Markdown links when you use web or public evidence.
- If your CLI environment cannot browse the web, clearly label unsupported claims as assumptions and say what evidence would be needed.
- Do not compress multi-artifact product packets into shallow summaries. Follow the minimum artifact depth standard in the system prompt even if that requires a longer response.
- Current run date: ${runDate}. Model/provider claims are time-sensitive. Do not name old default examples as current. Use the selected runtime model and current official evidence where available; otherwise name capability tiers and mark exact model selection as an evidence gap.
- Keep the final response outside artifact blocks brief.

# User brief

${brief}`;
}

function buildSingleArtifactCliPrompt(prompt: string, expectedFilename: string): string {
  const runDate = new Date().toISOString().slice(0, 10);
  return `${SINGLE_ARTIFACT_SYSTEM_PROMPT}

# CLI single-artifact adapter instructions

You are running through a generic terminal model CLI. Produce exactly one Markdown artifact using this exact delimiter format and filename:

<<<PANTHEON_ARTIFACT filename="${expectedFilename}">>>
...markdown...
<<<END_PANTHEON_ARTIFACT>>>

Rules:
- Emit exactly one artifact block.
- The filename must be exactly \`${expectedFilename}\`.
- Do not emit \`context-summary.md\`, \`validation-report.md\`, \`raw-output.md\`, nested paths, or any extra artifact.
- Do not rely on chat text as the deliverable.
- Current run date: ${runDate}. Model/provider claims are time-sensitive; use current runtime/user-provided models or capability tiers.
- If evidence is missing, label it Assumption, Inference, Evidence gap, or Data needed. Do not fabricate validation.

# Artifact task

${prompt}`;
}

function commandForProvider(provider: CliProvider): string {
  return process.env[COMMAND_ENV[provider]] ?? DEFAULT_COMMANDS[provider];
}

function modelForProvider(provider: CliProvider): string {
  const providerEnv =
    provider === "claude-cli"
      ? process.env.CLAUDE_MODEL
      : provider === "openai-cli"
        ? process.env.OPENAI_MODEL
        : process.env.GEMINI_MODEL;
  const fallback =
    provider === "claude-cli"
      ? "claude-opus-4-7"
      : provider === "openai-cli"
        ? "gpt-5.5"
        : "gemini-3.1-pro-preview";
  return providerEnv ?? fallback;
}

function runShell(command: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new CliCommandError(`CLI command exited with code ${code}\n${stderr}`, code, stdout, stderr));
      }
    });
  });
}

function safeFilename(name: string): string | null {
  if (!isFlatMarkdownFilename(name)) return null;
  if (name === "validation-report.md" || name === "raw-output.md" || name === "context-summary.md") return null;
  return name;
}

function shellEscape(value: string): string {
  return value.replaceAll(`"`, `\\"`);
}

function redactCommand(command: string): string {
  return command.length > 220 ? `${command.slice(0, 220)}...` : command;
}

async function preserveRawOutput(
  workdir: string,
  stdout: string,
  stderr: string,
  basename = "raw-output",
): Promise<void> {
  const safeBase = basename.replace(/\.md$/i, "").replace(/[^a-z0-9._-]/gi, "-");
  const fallback = path.join(workdir, `${safeBase}.md`);
  await fs.writeFile(
    fallback,
    `# Raw Provider Output

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

function isProviderCapacityError(text: string): boolean {
  return /MODEL_CAPACITY_EXHAUSTED|RESOURCE_EXHAUSTED|rateLimitExceeded|Too Many Requests|\b429\b/i.test(text);
}
