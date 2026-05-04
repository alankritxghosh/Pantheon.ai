import fs from "fs/promises";
import path from "path";
import { runAgent } from "./agent.js";
import { ARTIFACT_SPECS, type ArtifactSpec } from "./artifacts.js";
import { runCliArtifact, type CliProvider } from "./cli-agent.js";
import type { Provider } from "./models.js";
import { runNvidiaArtifact } from "./nvidia-agent.js";
import { runOllamaArtifact } from "./ollama-agent.js";
import {
  DECISION_PACKET_WORD_LIMIT,
  MIN_HEADINGS,
  MIN_NON_EMPTY_LINES,
  type ArtifactCheck,
  validateArtifactFile,
} from "./validator.js";

export interface PipelineContext {
  provider: Provider;
  model: string;
  workdir: string;
  workspaceBrief: string;
}

export interface PipelineResult {
  invalidArtifactNames: string[];
  checks: ArtifactCheck[];
}

interface PipelineArtifactState {
  spec: ArtifactSpec;
  check: ArtifactCheck;
  repaired: boolean;
}

const TARGET_NON_EMPTY_LINES = 45;
const TARGET_HEADINGS = 5;
const MAX_FINAL_RESCUE_ARTIFACTS = 3;

export async function runArtifactPipeline(ctx: PipelineContext): Promise<PipelineResult> {
  const invalidArtifactNames: string[] = [];
  const states: PipelineArtifactState[] = [];

  for (const spec of ARTIFACT_SPECS) {
    console.error(`[pantheon] pipeline: generating ${spec.filename}`);
    const generationPrompt = await buildArtifactPrompt(ctx, spec, states);
    invalidArtifactNames.push(...(await executeArtifactPrompt(ctx, spec.filename, generationPrompt)));
    let check = await validateArtifactFile(ctx.workdir, spec.filename);
    let repaired = false;

    if (check.failures.length > 0) {
      repaired = true;
      console.error(`[pantheon] pipeline: repairing ${spec.filename}: ${check.failures.join("; ")}`);
      const repairPrompt = await buildRepairPrompt(ctx, spec, check, states);
      invalidArtifactNames.push(...(await executeArtifactPrompt(ctx, spec.filename, repairPrompt)));
      check = await validateArtifactFile(ctx.workdir, spec.filename);
    }

    if (check.failures.length > 0) {
      console.error(`[pantheon] pipeline: ${spec.filename} still failing: ${check.failures.join("; ")}`);
    } else {
      console.error(`[pantheon] pipeline: ${spec.filename} passed`);
    }

    states.push({ spec, check, repaired });
  }

  return { invalidArtifactNames: [...new Set(invalidArtifactNames)], checks: states.map((state) => state.check) };
}

export async function rescueFailedArtifacts(
  ctx: PipelineContext,
  failedChecks: ArtifactCheck[],
): Promise<PipelineResult> {
  const rescueCandidates = failedChecks
    .map((check) => {
      const spec = ARTIFACT_SPECS.find((candidate) => candidate.filename === check.filename);
      return spec ? { spec, check } : null;
    })
    .filter((candidate): candidate is { spec: ArtifactSpec; check: ArtifactCheck } => candidate !== null);

  if (rescueCandidates.length === 0) {
    return { invalidArtifactNames: [], checks: [] };
  }

  if (rescueCandidates.length > MAX_FINAL_RESCUE_ARTIFACTS) {
    console.error(
      `[pantheon] rescue: skipped because ${rescueCandidates.length} artifacts failed; max final rescue is ${MAX_FINAL_RESCUE_ARTIFACTS}`,
    );
    return { invalidArtifactNames: [], checks: rescueCandidates.map((candidate) => candidate.check) };
  }

  const invalidArtifactNames: string[] = [];
  const states: PipelineArtifactState[] = rescueCandidates.map((candidate) => ({
    spec: candidate.spec,
    check: candidate.check,
    repaired: false,
  }));
  const rescuedChecks: ArtifactCheck[] = [];

  for (const candidate of rescueCandidates) {
    console.error(`[pantheon] rescue: regenerating ${candidate.spec.filename}: ${candidate.check.failures.join("; ")}`);
    const prompt = await buildFinalRescuePrompt(ctx, candidate.spec, candidate.check, states);
    invalidArtifactNames.push(...(await executeArtifactPrompt(ctx, candidate.spec.filename, prompt)));
    const check = await validateArtifactFile(ctx.workdir, candidate.spec.filename);
    rescuedChecks.push(check);
    const state = states.find((item) => item.spec.filename === candidate.spec.filename);
    if (state) {
      state.check = check;
      state.repaired = true;
    }

    if (check.failures.length > 0) {
      console.error(`[pantheon] rescue: ${candidate.spec.filename} still failing: ${check.failures.join("; ")}`);
    } else {
      console.error(`[pantheon] rescue: ${candidate.spec.filename} passed`);
    }
  }

  return { invalidArtifactNames: [...new Set(invalidArtifactNames)], checks: rescuedChecks };
}

async function executeArtifactPrompt(
  ctx: PipelineContext,
  expectedFilename: string,
  prompt: string,
): Promise<string[]> {
  if (ctx.provider === "anthropic") {
    await runAgent(prompt, { workdir: ctx.workdir });
    return [];
  }

  if (ctx.provider === "ollama") {
    const result = await runOllamaArtifact(prompt, expectedFilename, {
      workdir: ctx.workdir,
      model: ctx.model,
    });
    return [...result.invalidArtifactNames, ...result.extraArtifactNames];
  }

  if (ctx.provider === "nvidia") {
    const result = await runNvidiaArtifact(prompt, expectedFilename, {
      workdir: ctx.workdir,
      model: ctx.model,
    });
    return [...result.invalidArtifactNames, ...result.extraArtifactNames];
  }

  const result = await runCliArtifact(prompt, expectedFilename, {
    workdir: ctx.workdir,
    provider: ctx.provider as CliProvider,
    model: ctx.model,
  });
  return [...result.invalidArtifactNames, ...result.extraArtifactNames];
}

async function buildArtifactPrompt(
  ctx: PipelineContext,
  spec: ArtifactSpec,
  states: PipelineArtifactState[],
): Promise<string> {
  if (spec.filename === "quality-report.md") {
    return buildQualityReportPrompt(ctx, states);
  }

  const dependencies = await renderDependencies(ctx.workdir, spec.dependencies);
  return `Generate exactly one Pantheon artifact: \`${spec.filename}\`.

Purpose: ${spec.purpose}

Required sections:
${spec.requiredSections.map((section) => `- ${section}`).join("\n")}

Validation floor:
- Every standard artifact except \`decision-packet.md\` must have at least ${MIN_NON_EMPTY_LINES} non-empty lines and ${MIN_HEADINGS} Markdown headings.
- \`decision-packet.md\` must be under ${DECISION_PACKET_WORD_LIMIT} words.
- To avoid near-misses, target ${TARGET_NON_EMPTY_LINES}+ non-empty lines and ${TARGET_HEADINGS}+ Markdown headings for every standard artifact except \`decision-packet.md\`.

Important content rules:
- Use the workspace files as the evidence base.
- Label inferred claims as Inference or Assumption.
- Label missing source support as Evidence gap or Data needed.
- Do not claim user stories are validated unless directly grounded in source files.
- Do not use stale model names as current recommendations.
- Do not emit any artifact except \`${spec.filename}\`.
- Write a complete artifact, not an outline.

# Workspace Brief And Context

${ctx.workspaceBrief}

# Dependency Artifacts

${dependencies}`;
}

async function buildRepairPrompt(
  ctx: PipelineContext,
  spec: ArtifactSpec,
  failedCheck: ArtifactCheck,
  states: PipelineArtifactState[],
): Promise<string> {
  const current = await readIfExists(path.join(ctx.workdir, spec.filename));
  const dependencies = await renderDependencies(ctx.workdir, spec.dependencies);
  return `Repair exactly one Pantheon artifact: \`${spec.filename}\`.

The previous version failed deterministic validation:
${renderCheck(failedCheck)}

Rewrite the full artifact. Do not provide a patch or commentary.

Required sections:
${spec.requiredSections.map((section) => `- ${section}`).join("\n")}

Validation floor:
- Every standard artifact except \`decision-packet.md\` must have at least ${MIN_NON_EMPTY_LINES} non-empty lines and ${MIN_HEADINGS} Markdown headings.
- \`decision-packet.md\` must be under ${DECISION_PACKET_WORD_LIMIT} words.
- To avoid near-misses, target ${TARGET_NON_EMPTY_LINES}+ non-empty lines and ${TARGET_HEADINGS}+ Markdown headings for every standard artifact except \`decision-packet.md\`.

Repair rules:
- Add concrete details, metrics, tradeoffs, evidence labels, source-file references, edge cases, and decisions.
- Preserve truthfulness. Do not pad with generic filler.
- If the failure is content-signal related, add the missing real section or table rather than keyword stuffing.
- Do not emit any artifact except \`${spec.filename}\`.

# Workspace Brief And Context

${ctx.workspaceBrief}

# Dependency Artifacts

${dependencies}

# Previous Failed Artifact

\`\`\`markdown
${current}
\`\`\`

# Prior Pipeline Status

${renderPipelineStatus(states)}`;
}

async function buildFinalRescuePrompt(
  ctx: PipelineContext,
  spec: ArtifactSpec,
  failedCheck: ArtifactCheck,
  states: PipelineArtifactState[],
): Promise<string> {
  const current = await readIfExists(path.join(ctx.workdir, spec.filename));
  const dependencies = await renderDependencies(ctx.workdir, spec.dependencies);
  return `Final rescue rewrite for exactly one Pantheon artifact: \`${spec.filename}\`.

The run is not demo-ready unless this artifact passes deterministic validation.

Exact validator failure:
${renderCheck(failedCheck)}

Rewrite the full artifact, not a patch. Emit exactly one artifact block named \`${spec.filename}\`.

Required sections:
${spec.requiredSections.map((section) => `- ${section}`).join("\n")}

Hard rescue requirements:
- Every standard artifact except \`decision-packet.md\` must clear ${MIN_NON_EMPTY_LINES}+ non-empty lines and ${MIN_HEADINGS}+ Markdown headings.
- Target ${TARGET_NON_EMPTY_LINES}+ non-empty lines and ${TARGET_HEADINGS}+ Markdown headings to avoid another near-miss.
- \`decision-packet.md\` must stay under ${DECISION_PACKET_WORD_LIMIT} words while including recommendation, risks, asks, and next decision.
- Add concrete evidence labels, decisions, metrics, risks, tradeoffs, acceptance criteria, or source-file references.
- Do not add generic filler. Every added line should improve the artifact.
- Do not use stale model names as current recommendations. Old model names may appear only when explicitly labeled legacy/rejected.

# Workspace Brief And Context

${ctx.workspaceBrief}

# Dependency Artifacts

${dependencies}

# Current Failed Artifact

\`\`\`markdown
${current}
\`\`\`

# Current Failure Context

${renderPipelineStatus(states)}`;
}

function buildQualityReportPrompt(ctx: PipelineContext, states: PipelineArtifactState[]): string {
  const anyFailed = states.some((state) => state.check.failures.length > 0);
  return `Generate exactly one Pantheon artifact: \`quality-report.md\`.

This artifact must agree with deterministic validation. The validation data below is the source of truth.

Overall deterministic status before quality-report:
${anyFailed ? "- Not demo-ready: one or more artifacts failed validation." : "- Provisionally passing: all prior artifacts passed validation."}

Artifact validation results:
${renderPipelineStatus(states)}

Rules:
- If any artifact failed above, the quality report MUST say Not demo-ready.
- Do not claim all artifacts pass unless all validation rows above pass.
- Include readiness verdict, scorecard, validation failures, evidence gaps, and top fixes.
- Do not emit any artifact except \`quality-report.md\`.
- The quality report itself must meet the depth floor: ${MIN_NON_EMPTY_LINES}+ non-empty lines and ${MIN_HEADINGS}+ headings.

# Workspace Brief And Context

${ctx.workspaceBrief}`;
}

async function renderDependencies(workdir: string, filenames: string[]): Promise<string> {
  if (filenames.length === 0) return "No prior artifact dependencies.";
  const rendered: string[] = [];
  for (const filename of filenames) {
    const content = await readIfExists(path.join(workdir, filename));
    rendered.push(`## ${filename}

\`\`\`markdown
${content || "[Missing dependency artifact.]"}
\`\`\``);
  }
  return rendered.join("\n\n");
}

function renderPipelineStatus(states: PipelineArtifactState[]): string {
  if (states.length === 0) return "- No prior artifacts generated.";
  return states
    .map((state) => {
      const status = state.check.failures.length === 0 ? "Pass" : "Fail";
      const notes = state.check.failures.length === 0 ? "-" : state.check.failures.join("; ");
      return `- ${state.spec.filename}: ${status}; lines=${state.check.nonEmptyLines ?? "-"}; headings=${state.check.headings ?? "-"}; words=${state.check.words ?? "-"}; repaired=${state.repaired ? "yes" : "no"}; notes=${notes}`;
    })
    .join("\n");
}

function renderCheck(check: ArtifactCheck): string {
  return `- ${check.filename}: ${check.failures.length === 0 ? "Pass" : "Fail"}
- non-empty lines: ${check.nonEmptyLines ?? "-"}
- headings: ${check.headings ?? "-"}
- words: ${check.words ?? "-"}
- failures: ${check.failures.length === 0 ? "-" : check.failures.join("; ")}`;
}

async function readIfExists(filepath: string): Promise<string> {
  try {
    return await fs.readFile(filepath, "utf8");
  } catch {
    return "";
  }
}
