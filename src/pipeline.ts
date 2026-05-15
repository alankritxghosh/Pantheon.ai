import fs from "fs/promises";
import path from "path";
import { runAgent } from "./agent.js";
import { parseArtifactBlocks, recoverSingleArtifactContent } from "./artifact-blocks.js";
import {
  ARTIFACT_SPECS,
  filterSpecsForMode,
  overrideRequiredSections,
  specForMode,
  type ArtifactSpec,
  type PipelineMode,
} from "./artifacts.js";
import {
  buildArtifactBrief,
  buildDeterministicFallbackArtifact,
  readArtifactBrief,
  renderArtifactBriefForPrompt,
  writeArtifactBrief,
  writeRunMetrics,
  type RunMetric,
} from "./briefs/briefs.js";
import { runCliArtifact, type CliProvider } from "./cli-agent.js";
import type { Provider } from "./models.js";
import { runOllamaArtifact } from "./ollama-agent.js";
import { buildStyleRequirementsBlock, CITATION_INSTRUCTION, type ArtifactStylePromptContext } from "./prompt.js";
import {
  buildDeterministicEvidenceLedger,
  buildEvidenceReport,
  extractEvidenceCards,
  renderEvidenceBrief,
  writeEvidenceCards,
  type EvidenceEnrichmentResult,
} from "./evidence/evidence.js";
import { embedTexts } from "./style/embeddings.js";
import { loadStyleIndex, retrieveStyleExamples, type StyleIndex } from "./style/retrieval.js";
import { formatStyleReport, scoreStyleFaithfulness } from "./style/style-validator.js";
import {
  loadStyleProfile,
  slugForFilename,
  type ArtifactStyle,
  type GlobalStyle,
  type StyleProfile,
} from "./style/style-profile.js";
import {
  DECISION_PACKET_WORD_LIMIT,
  MIN_HEADINGS,
  MIN_NON_EMPTY_LINES,
  type ArtifactCheck,
  validateArtifactFile,
} from "./validator.js";
import { PANTHEON_OUTPUT_DIR, type WorkspaceContext } from "./workspace.js";
import { formatDoctorReport, runDoctor } from "./health/doctor.js";

export interface PipelineContext {
  provider: Provider;
  model: string;
  workdir: string;
  workspaceBrief: string;
  workspaceContext?: WorkspaceContext;
  evidenceBrief?: string;
  styleProfile?: StyleProfile;
  styleIndex?: StyleIndex;
}

export interface PipelineResult {
  invalidArtifactNames: string[];
  checks: ArtifactCheck[];
  metrics: RunMetric[];
}

interface PipelineArtifactState {
  spec: ArtifactSpec;
  check: ArtifactCheck;
  repaired: boolean;
}

const TARGET_NON_EMPTY_LINES = 45;
const TARGET_HEADINGS = 5;
const MAX_FINAL_RESCUE_ARTIFACTS = 3;
const MAX_DEPENDENCY_CHARS = Number(process.env.PANTHEON_MAX_DEPENDENCY_CHARS ?? 12_000);
const EVIDENCE_CARD_CHUNK_CHARS = Number(process.env.PANTHEON_EVIDENCE_CARD_CHUNK_CHARS ?? 8_000);
const MAX_EVIDENCE_CARD_CHARS = Number(process.env.PANTHEON_MAX_EVIDENCE_CARD_CHARS ?? 60_000);
const MAX_EVIDENCE_CARD_FAILURE_RATIO = Number(process.env.PANTHEON_EVIDENCE_CARD_FAILURE_RATIO ?? 0.2);
const MAX_ARTIFACT_BRIEF_CHARS = Number(process.env.PANTHEON_MAX_ARTIFACT_BRIEF_CHARS ?? 20_000);
const FORCE_REGENERATE = process.env.PANTHEON_FORCE_REGENERATE === "1";
const ARTIFACT_MODEL_MODE = process.env.PANTHEON_ARTIFACT_MODEL_MODE === "off" ? "off" : "polish";

export async function runArtifactPipeline(
  ctx: PipelineContext,
  options: { mode?: PipelineMode } = {},
): Promise<PipelineResult> {
  const mode: PipelineMode = options.mode ?? "full";
  const metrics: RunMetric[] = [];
  const preflight = await runDoctor({ provider: ctx.provider, model: ctx.model });
  if (!preflight.allPass) {
    console.error(formatDoctorReport(preflight));
    console.error(
      "Cannot start pantheon run until the above failures are resolved. Run `pantheon doctor` anytime to re-check.",
    );
    throw new Error("Pantheon preflight failed; aborting before artifact generation.");
  }

  let pipelineCtx = await withStyleContext(ctx);
  if (pipelineCtx.workspaceContext) {
    const started = Date.now();
    pipelineCtx = await prepareEvidenceLayer(pipelineCtx);
    metrics.push(metric("evidence", undefined, started, "pass", "deterministic evidence layer ready"));
  }
  const invalidArtifactNames: string[] = [];
  const states: PipelineArtifactState[] = [];

  const specsToRun = filterSpecsForMode([...ARTIFACT_SPECS], mode);
  for (const spec of specsToRun) {
    const effectiveSpec = effectiveArtifactSpec(pipelineCtx, spec);
    const artifactStart = Date.now();
    if (await reusableArtifactExists(pipelineCtx, effectiveSpec)) {
      console.error(`[pantheon] pipeline: reusing ${effectiveSpec.filename}`);
      metrics.push(metric("reuse", effectiveSpec.filename, artifactStart, "pass"));
    } else {
      const briefStart = Date.now();
      const brief = await ensureArtifactBrief(pipelineCtx, effectiveSpec, states);
      metrics.push(metric("brief", effectiveSpec.filename, briefStart, "pass"));

      if (effectiveSpec.filename === "evidence-ledger.md" || ARTIFACT_MODEL_MODE === "off") {
        console.error(`[pantheon] pipeline: writing deterministic fallback ${effectiveSpec.filename}`);
        await writeFallbackArtifact(pipelineCtx, effectiveSpec, brief);
        metrics.push(metric("fallback", effectiveSpec.filename, artifactStart, "pass", ARTIFACT_MODEL_MODE));
      } else {
        console.error(`[pantheon] pipeline: generating ${effectiveSpec.filename}`);
        const generationPrompt = await buildArtifactPrompt(pipelineCtx, effectiveSpec, states, brief);
        const modelStart = Date.now();
        try {
          invalidArtifactNames.push(...(await executeArtifactPrompt(pipelineCtx, effectiveSpec.filename, generationPrompt)));
          metrics.push(metric("model", effectiveSpec.filename, modelStart, "pass"));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          metrics.push(metric("model", effectiveSpec.filename, modelStart, "fail", message));
          await writeFallbackArtifact(pipelineCtx, effectiveSpec, brief);
          metrics.push(metric("fallback", effectiveSpec.filename, Date.now(), "pass", "model call failed"));
        }
      }
    }
    let check = await validatePipelineArtifact(pipelineCtx, effectiveSpec);
    let repaired = false;

    if (check.failures.length > 0 && ARTIFACT_MODEL_MODE !== "off") {
      repaired = true;
      console.error(`[pantheon] pipeline: repairing ${effectiveSpec.filename}: ${check.failures.join("; ")}`);
      const brief = await ensureArtifactBrief(pipelineCtx, effectiveSpec, states);
      const repairPrompt = await buildRepairPrompt(pipelineCtx, effectiveSpec, check, states, brief);
      const repairStart = Date.now();
      invalidArtifactNames.push(...(await executeArtifactPrompt(pipelineCtx, effectiveSpec.filename, repairPrompt)));
      metrics.push(metric("repair", effectiveSpec.filename, repairStart, "pass"));
      check = await validatePipelineArtifact(pipelineCtx, effectiveSpec);
    }

    if (check.failures.length > 0 && effectiveSpec.filename !== "evidence-ledger.md") {
      const brief = await ensureArtifactBrief(pipelineCtx, effectiveSpec, states);
      await writeFallbackArtifact(pipelineCtx, effectiveSpec, brief, check);
      metrics.push(metric("fallback", effectiveSpec.filename, Date.now(), "pass", check.failures.join("; ")));
      check = await validatePipelineArtifact(pipelineCtx, effectiveSpec);
    }

    if (check.failures.length > 0) {
      console.error(`[pantheon] pipeline: ${effectiveSpec.filename} still failing: ${check.failures.join("; ")}`);
    } else {
      console.error(`[pantheon] pipeline: ${effectiveSpec.filename} passed`);
    }

    states.push({ spec: effectiveSpec, check, repaired });
  }

  await writeStyleReportIfPresent(pipelineCtx);
  await writeRunMetrics(pipelineCtx.workdir, metrics);
  return { invalidArtifactNames: [...new Set(invalidArtifactNames)], checks: states.map((state) => state.check), metrics };
}

export async function rescueFailedArtifacts(
  ctx: PipelineContext,
  failedChecks: ArtifactCheck[],
): Promise<PipelineResult> {
  const pipelineCtx = await ensureEvidenceBrief(await withStyleContext(ctx));
  const rescueCandidates = failedChecks
    .map((check) => {
      const spec = ARTIFACT_SPECS.find((candidate) => candidate.filename === check.filename);
      return spec ? { spec: effectiveArtifactSpec(pipelineCtx, spec), check } : null;
    })
    .filter((candidate): candidate is { spec: ArtifactSpec; check: ArtifactCheck } => candidate !== null);

  if (rescueCandidates.length === 0) {
    return { invalidArtifactNames: [], checks: [], metrics: [] };
  }

  if (rescueCandidates.length > MAX_FINAL_RESCUE_ARTIFACTS) {
    console.error(
      `[pantheon] rescue: skipped because ${rescueCandidates.length} artifacts failed; max final rescue is ${MAX_FINAL_RESCUE_ARTIFACTS}`,
    );
    return { invalidArtifactNames: [], checks: rescueCandidates.map((candidate) => candidate.check), metrics: [] };
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
    const prompt = await buildFinalRescuePrompt(pipelineCtx, candidate.spec, candidate.check, states);
    invalidArtifactNames.push(...(await executeArtifactPrompt(pipelineCtx, candidate.spec.filename, prompt)));
    const check = await validatePipelineArtifact(pipelineCtx, candidate.spec);
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

  await writeStyleReportIfPresent(pipelineCtx);
  return { invalidArtifactNames: [...new Set(invalidArtifactNames)], checks: rescuedChecks, metrics: [] };
}

/**
 * Prompt-scaffolding lines that must never appear in a generated artifact.
 * The Phase 2 style block previously instructed the model to add a
 * "Style source:" footer; that instruction is gone, but this is a defensive
 * net in case a model still echoes the style-block header or footer.
 */
const PROMPT_SCAFFOLDING_LINE_RE = /^\s*(style source\s*:|STYLE REQUIREMENTS\b|writing style to match\s*:)/i;

async function sanitizeArtifactFile(workdir: string, filename: string): Promise<void> {
  const filepath = path.join(workdir, filename);
  let content: string;
  try {
    content = await fs.readFile(filepath, "utf8");
  } catch {
    return;
  }

  const lines = content.split(/\r?\n/);
  const kept = lines.filter((line) => !PROMPT_SCAFFOLDING_LINE_RE.test(line));
  if (kept.length === lines.length) {
    return;
  }

  const cleaned = `${kept.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "")}\n`;
  await fs.writeFile(filepath, cleaned, "utf8");
  console.error(`[pantheon] pipeline: stripped prompt scaffolding from ${filename}`);
}

async function salvageArtifactFromRawOutput(workdir: string, expectedFilename: string): Promise<boolean> {
  const rawPath = path.join(workdir, `raw-output-${expectedFilename}`);
  let raw: string;
  try {
    raw = await fs.readFile(rawPath, "utf8");
  } catch {
    return false;
  }

  const matchingBlock = parseArtifactBlocks(raw).find((artifact) => artifact.filename === expectedFilename);
  const recovered = matchingBlock?.content ?? recoverSingleArtifactContent(raw);
  if (!recovered) {
    return false;
  }

  await fs.writeFile(path.join(workdir, expectedFilename), recovered, "utf8");
  await sanitizeArtifactFile(workdir, expectedFilename);
  console.error(`[pantheon] pipeline: recovered ${expectedFilename} from ${path.basename(rawPath)}`);
  return true;
}

async function executeArtifactPrompt(
  ctx: PipelineContext,
  expectedFilename: string,
  prompt: string,
): Promise<string[]> {
  let extras: string[] = [];

  if (ctx.provider === "fixture") {
    await writeFixtureArtifact(ctx, expectedFilename);
    return extras;
  }

  if (ctx.provider === "anthropic") {
    await runAgent(prompt, { workdir: ctx.workdir });
  } else if (ctx.provider === "ollama") {
    const result = await runOllamaArtifact(prompt, expectedFilename, {
      workdir: ctx.workdir,
      model: ctx.model,
    });
    if (!result.saved) {
      await salvageArtifactFromRawOutput(ctx.workdir, expectedFilename);
    }
    extras = [...result.invalidArtifactNames, ...result.extraArtifactNames];
  } else {
    const result = await runCliArtifact(prompt, expectedFilename, {
      workdir: ctx.workdir,
      provider: ctx.provider as CliProvider,
      model: ctx.model,
    });
    if (!result.saved) {
      await salvageArtifactFromRawOutput(ctx.workdir, expectedFilename);
    }
    extras = [...result.invalidArtifactNames, ...result.extraArtifactNames];
  }

  await sanitizeArtifactFile(ctx.workdir, expectedFilename);
  return extras;
}

async function prepareEvidenceLayer(ctx: PipelineContext): Promise<PipelineContext> {
  if (!ctx.workspaceContext) {
    return ctx;
  }
  console.error(`[pantheon] evidence: extracting deterministic cards from ${ctx.workspaceContext.supportedFiles.length} files`);
  const cards = extractEvidenceCards(ctx.workspaceContext);
  await writeEvidenceCards(ctx.workdir, cards);

  const enrichment = await maybeEnrichEvidence(ctx, renderEvidenceBrief(cards, MAX_EVIDENCE_CARD_CHARS));
  const clusters = enrichment.status === "success" ? await readIfExists(path.join(ctx.workdir, "evidence-clusters.md")) : "";
  await fs.writeFile(path.join(ctx.workdir, "evidence-ledger.md"), buildDeterministicEvidenceLedger(cards, ctx.workspaceContext, clusters), "utf8");
  await fs.writeFile(path.join(ctx.workdir, "evidence-report.md"), buildEvidenceReport(cards, enrichment, ctx.workspaceContext), "utf8");
  console.error("[pantheon] evidence: wrote evidence-cards, evidence-report.md, and deterministic evidence-ledger.md");

  return {
    ...ctx,
    evidenceBrief: renderEvidenceBrief(cards, MAX_EVIDENCE_CARD_CHARS),
  };
}

async function maybeEnrichEvidence(ctx: PipelineContext, evidenceBrief: string): Promise<EvidenceEnrichmentResult> {
  if (process.env.PANTHEON_EVIDENCE_ENRICHMENT !== "on") {
    return { enabled: false, status: "disabled", detail: "Set PANTHEON_EVIDENCE_ENRICHMENT=on to enable model clustering." };
  }

  const prompt = `Generate exactly one Pantheon artifact: \`evidence-clusters.md\`.

Cluster these deterministic evidence cards into themes for product planning. Preserve \`[source: <relative-path>]\` citations. Identify duplicated signals, tensions, and decision-relevant themes. Do not invent evidence.

# Evidence Brief

${evidenceBrief}`;
  try {
    await executeArtifactPrompt(ctx, "evidence-clusters.md", prompt);
    const clusters = await readIfExists(path.join(ctx.workdir, "evidence-clusters.md"));
    if (clusters.trim()) {
      return { enabled: true, status: "success", detail: "Model-generated evidence clusters were produced." };
    }
    return { enabled: true, status: "failed", detail: "Model enrichment returned no usable evidence-clusters.md." };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { enabled: true, status: "failed", detail: message };
  }
}

async function ensureEvidenceBrief(ctx: PipelineContext): Promise<PipelineContext> {
  if (ctx.evidenceBrief || !ctx.workspaceContext) {
    return ctx;
  }
  return prepareEvidenceLayer(ctx);
}

async function ensureArtifactBrief(
  ctx: PipelineContext,
  spec: ArtifactSpec,
  states: PipelineArtifactState[],
): Promise<string> {
  if (!FORCE_REGENERATE) {
    const existing = await readArtifactBrief(ctx.workdir, spec);
    if (existing.trim()) {
      return existing;
    }
  }

  const dependencyMarkdown = await renderDependencies(ctx.workdir, spec.dependencies);
  const brief = await buildArtifactBrief(spec, {
    workdir: ctx.workdir,
    evidenceBrief: ctx.evidenceBrief ?? buildEvidenceLedgerBrief(ctx),
    dependencyMarkdown,
    pipelineStatus: renderPipelineStatus(states),
  });
  await writeArtifactBrief(ctx.workdir, spec, brief);
  return brief;
}

async function writeFallbackArtifact(
  ctx: PipelineContext,
  spec: ArtifactSpec,
  brief: string,
  validationFailure?: ArtifactCheck,
): Promise<void> {
  await fs.writeFile(
    path.join(ctx.workdir, spec.filename),
    buildDeterministicFallbackArtifact(spec, brief, validationFailure),
    "utf8",
  );
}

function metric(
  phase: string,
  artifact: string | undefined,
  startedAt: number,
  status: string,
  detail?: string,
): RunMetric {
  return { phase, artifact, durationMs: Date.now() - startedAt, status, detail };
}

async function buildArtifactPrompt(
  ctx: PipelineContext,
  spec: ArtifactSpec,
  states: PipelineArtifactState[],
  artifactBrief?: string,
): Promise<string> {
  if (spec.filename === "quality-report.md") {
    return buildQualityReportPrompt(ctx, states);
  }

  const dependencies = await renderDependencies(ctx.workdir, spec.dependencies);
  const styleBlock = buildStyleRequirementsBlock(await buildArtifactStyleContext(ctx, spec));
  const brief = artifactBrief ?? await ensureArtifactBrief(ctx, spec, states);
  return `${styleBlock}Generate exactly one Pantheon artifact: \`${spec.filename}\`.

Purpose: ${spec.purpose}

Required sections:
${spec.requiredSections.map((section) => `- ${section}`).join("\n")}

Validation floor:
- Every standard artifact except \`decision-packet.md\` must have at least ${MIN_NON_EMPTY_LINES} non-empty lines and ${MIN_HEADINGS} Markdown headings.
- \`decision-packet.md\` must be under ${DECISION_PACKET_WORD_LIMIT} words.
- To avoid near-misses, target ${TARGET_NON_EMPTY_LINES}+ non-empty lines and ${TARGET_HEADINGS}+ Markdown headings for every standard artifact except \`decision-packet.md\`.

Important content rules:
- Use the workspace files as the evidence base.
- ${CITATION_INSTRUCTION}
- Label inferred claims as Inference or Assumption.
- Label missing source support as Evidence gap or Data needed.
- Do not claim user stories are validated unless directly grounded in source files.
- Do not use stale model names as current recommendations.
- Do not emit any artifact except \`${spec.filename}\`.
- Write a complete artifact, not an outline.

# Artifact Brief

${renderArtifactBriefForPrompt(brief, MAX_ARTIFACT_BRIEF_CHARS)}

# Dependency Artifacts

${dependencies}`;
}

async function buildRepairPrompt(
  ctx: PipelineContext,
  spec: ArtifactSpec,
  failedCheck: ArtifactCheck,
  states: PipelineArtifactState[],
  artifactBrief?: string,
): Promise<string> {
  const current = await readIfExists(path.join(ctx.workdir, spec.filename));
  const dependencies = await renderDependencies(ctx.workdir, spec.dependencies);
  const styleBlock = buildStyleRequirementsBlock(await buildArtifactStyleContext(ctx, spec));
  const brief = artifactBrief ?? await ensureArtifactBrief(ctx, spec, states);
  return `${styleBlock}Repair exactly one Pantheon artifact: \`${spec.filename}\`.

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
- ${CITATION_INSTRUCTION}
- Preserve truthfulness. Do not pad with generic filler.
- If the failure is content-signal related, add the missing real section or table rather than keyword stuffing.
- Do not emit any artifact except \`${spec.filename}\`.

# Artifact Brief

${renderArtifactBriefForPrompt(brief, MAX_ARTIFACT_BRIEF_CHARS)}

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
  const styleBlock = buildStyleRequirementsBlock(await buildArtifactStyleContext(ctx, spec));
  return `${styleBlock}Final rescue rewrite for exactly one Pantheon artifact: \`${spec.filename}\`.

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
- ${CITATION_INSTRUCTION}
- Do not add generic filler. Every added line should improve the artifact.
- Do not use stale model names as current recommendations. Old model names may appear only when explicitly labeled legacy/rejected.

# Workspace Brief And Context

${workspaceBriefForArtifact(ctx, spec)}

# Dependency Artifacts

${dependencies}

# Current Failed Artifact

\`\`\`markdown
${current}
\`\`\`

# Current Failure Context

${renderPipelineStatus(states)}`;
}

/**
 * Regenerate the model-written body of `quality-report.md` from FINAL
 * (post-rescue) artifact checks. The pipeline generates quality-report.md
 * before the final rescue pass runs, so after a rescue its embedded model
 * review is stale and can contradict the deterministic header. Calling this
 * after rescue makes both reflect the same post-rescue state.
 */
export async function regenerateQualityReport(
  ctx: PipelineContext,
  checks: ArtifactCheck[],
  repairedFilenames: Set<string> = new Set(),
): Promise<string[]> {
  const pipelineCtx = await ensureEvidenceBrief(ctx);
  const states: PipelineArtifactState[] = checks
    .filter((check) => check.filename !== "quality-report.md")
    .map((check) => {
      const spec = ARTIFACT_SPECS.find((candidate) => candidate.filename === check.filename);
      return spec ? { spec, check, repaired: repairedFilenames.has(check.filename) } : null;
    })
    .filter((state): state is PipelineArtifactState => state !== null);

  console.error("[pantheon] quality-report: regenerating model review with post-rescue state");
  const prompt = buildQualityReportPrompt(pipelineCtx, states);
  return executeArtifactPrompt(pipelineCtx, "quality-report.md", prompt);
}

function buildQualityReportPrompt(ctx: PipelineContext, states: PipelineArtifactState[]): string {
  const anyFailed = states.some((state) => state.check.failures.length > 0);
  const evidenceReportHint = "Use `evidence-report.md` as the source of truth for evidence coverage if it exists; cite citation-health limitations from `citations-report.md` only if that report already exists.";
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
- Include evidence coverage and citation-health notes. ${evidenceReportHint}
- Do not emit any artifact except \`quality-report.md\`.
- The quality report itself must meet the depth floor: ${MIN_NON_EMPTY_LINES}+ non-empty lines and ${MIN_HEADINGS}+ headings.

# Workspace Brief And Context

${compactWorkspaceBrief(ctx.workspaceBrief)}`;
}

async function renderDependencies(workdir: string, filenames: string[]): Promise<string> {
  if (filenames.length === 0) return "No prior artifact dependencies.";
  const rendered: string[] = [];
  for (const filename of filenames) {
    const content = await readIfExists(path.join(workdir, filename));
    rendered.push(`## ${filename}

\`\`\`markdown
${content ? truncateForPrompt(content, MAX_DEPENDENCY_CHARS) : "[Missing dependency artifact.]"}
\`\`\``);
  }
  return rendered.join("\n\n");
}

function workspaceBriefForArtifact(ctx: PipelineContext, spec: ArtifactSpec): string {
  if (spec.filename === "evidence-ledger.md") {
    return buildEvidenceLedgerBrief(ctx);
  }
  return compactWorkspaceBrief(ctx.workspaceBrief);
}

export function buildEvidenceLedgerBrief(ctx: PipelineContext): string {
  const inventory = compactWorkspaceBrief(ctx.workspaceBrief);
  const evidence = ctx.evidenceBrief ?? "No evidence cards were generated. Treat this as an Evidence gap.";
  return `${inventory}

# Extracted Evidence Cards

${evidence}

Use the extracted evidence cards above as the source of truth for \`evidence-ledger.md\`. Do not use raw workspace file contents directly in this step. Preserve \`[source: <relative-path>]\` citations from the cards.`;
}

function compactWorkspaceBrief(brief: string): string {
  const marker = "\n# Ingested File Contents\n";
  const markerIndex = brief.indexOf(marker);
  if (markerIndex === -1) {
    return brief;
  }

  return `${brief.slice(0, markerIndex).trimEnd()}

# Raw Workspace Contents

Raw file contents were provided to \`evidence-ledger.md\`. For this artifact, use the file inventory above plus dependency artifacts below as the synthesized evidence base. Cite only source paths listed in the inventory or already cited in dependency artifacts. If a needed detail is not present, mark it as an Evidence gap or Data needed rather than guessing.`;
}

function truncateForPrompt(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }
  return `${content.slice(0, maxChars).replace(/\s+$/, "")}\n\n[Truncated by Pantheon dependency prompt budget.]`;
}

function truncateWithVisibleNotice(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }
  const notice = "\n\n[Truncated by Pantheon dependency prompt budget.]";
  const available = Math.max(0, maxChars - notice.length);
  return `${content.slice(0, available).replace(/\s+$/, "")}${notice}`;
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

async function withStyleContext(ctx: PipelineContext): Promise<PipelineContext> {
  if (ctx.styleProfile && ctx.styleIndex) {
    return ctx;
  }

  const styleWorkdir = resolveStyleWorkdir(ctx.workdir);
  const [styleProfile, styleIndex] = await Promise.all([
    loadStyleProfile(styleWorkdir),
    loadStyleIndex(styleWorkdir),
  ]);

  if (!styleProfile && !styleIndex) {
    return ctx;
  }
  if (!styleProfile || !styleIndex) {
    console.error("[pantheon] style: .pantheon/style.json and .pantheon/style-index.json must both exist; continuing without style overrides");
    return ctx;
  }

  console.error(`[pantheon] style: loaded .pantheon/style.json with ${Object.keys(styleProfile.artifactStyles).length} artifact styles`);
  return { ...ctx, styleProfile, styleIndex };
}

function effectiveArtifactSpec(ctx: PipelineContext, spec: ArtifactSpec): ArtifactSpec {
  const slug = slugForFilename(spec.filename);
  const artifactStyle = slug ? ctx.styleProfile?.artifactStyles[slug] : undefined;
  if (!artifactStyle) {
    return spec;
  }
  return overrideRequiredSections(spec, artifactStyle.sections);
}

function isStyleAwareSpec(ctx: PipelineContext, spec: ArtifactSpec): boolean {
  const slug = slugForFilename(spec.filename);
  return Boolean(slug && ctx.styleProfile?.artifactStyles[slug]);
}

async function validatePipelineArtifact(ctx: PipelineContext, spec: ArtifactSpec): Promise<ArtifactCheck> {
  return validateArtifactFile(ctx.workdir, spec.filename, isStyleAwareSpec(ctx, spec), spec.requiredSections);
}

async function reusableArtifactExists(ctx: PipelineContext, spec: ArtifactSpec): Promise<boolean> {
  if (FORCE_REGENERATE) {
    return false;
  }
  const check = await validatePipelineArtifact(ctx, spec);
  return check.exists && check.failures.length === 0;
}

function signalsFromArtifactStyle(style: ArtifactStyle): GlobalStyle {
  return {
    voice: style.voice,
    avgWordsTotal: style.avgWordsTotal,
    diagramConvention: style.diagramConvention,
    codeBlockDensity: style.codeBlockDensity,
  };
}

async function buildArtifactStyleContext(
  ctx: PipelineContext,
  spec: ArtifactSpec,
): Promise<ArtifactStylePromptContext | null> {
  if (!ctx.styleProfile) {
    return null;
  }

  const slug = slugForFilename(spec.filename);
  const artifactStyle = slug ? ctx.styleProfile.artifactStyles[slug] : undefined;

  // Full override: exact-slug match — learned sections + signals + retrieved examples.
  if (slug && artifactStyle && ctx.styleIndex) {
    const [queryEmbedding] = await embedTexts([
      `${spec.filename}\n${spec.purpose}\n${artifactStyle.sections.join("\n")}`,
    ]);
    const examples = retrieveStyleExamples(ctx.styleIndex, slug, queryEmbedding, 2).map((example) => ({
      path: example.examplePath,
      preview: example.preview,
    }));
    return {
      mode: "full",
      sections: artifactStyle.sections,
      signals: signalsFromArtifactStyle(artifactStyle),
      examples,
    };
  }

  // Global fallback: no exact-slug match, but a generalizable globalStyle exists.
  // Keep the artifact's default sections; apply only voice/length/diagram/code.
  if (ctx.styleProfile.globalStyle) {
    return {
      mode: "global",
      sections: [],
      signals: ctx.styleProfile.globalStyle,
      examples: [],
    };
  }

  // Backward compatibility: pre-Phase-7 profile with no globalStyle field —
  // preserve Phase 2 behavior (no global fallback).
  return null;
}

function resolveStyleWorkdir(workdir: string): string {
  const resolved = path.resolve(workdir);
  if (
    path.basename(path.dirname(path.dirname(resolved))) === PANTHEON_OUTPUT_DIR &&
    path.basename(path.dirname(resolved)) === "runs"
  ) {
    return path.dirname(path.dirname(path.dirname(resolved)));
  }
  if (path.basename(path.dirname(resolved)) === PANTHEON_OUTPUT_DIR && path.basename(resolved) === "latest") {
    return path.dirname(path.dirname(resolved));
  }
  return resolved;
}

export async function runSynthesizePipeline(ctx: PipelineContext): Promise<PipelineResult> {
  return runArtifactPipeline(ctx, { mode: "synthesize" });
}

async function writeFixtureArtifact(ctx: PipelineContext, expectedFilename: string): Promise<void> {
  const fixtureDir = process.env.PANTHEON_FIXTURE_DIR;
  if (!fixtureDir) {
    throw new Error(
      `Fixture provider requires PANTHEON_FIXTURE_DIR. Set it to a folder containing canned artifacts.`,
    );
  }
  const fixturePath = path.join(fixtureDir, expectedFilename);
  let content: string;
  try {
    content = await fs.readFile(fixturePath, "utf8");
  } catch (err) {
    throw new Error(
      `Fixture provider could not read ${fixturePath}: ${err instanceof Error ? err.message : String(err)}. ` +
      `Create the fixture file or pick a fixture dir that contains it.`,
    );
  }
  await fs.writeFile(path.join(ctx.workdir, expectedFilename), content, "utf8");
  console.error(`[pantheon] pipeline: fixture wrote ${expectedFilename} from ${fixturePath}`);
}

async function writeStyleReportIfPresent(ctx: PipelineContext): Promise<void> {
  if (!ctx.styleProfile) {
    return;
  }

  const faithfulnesses = [];
  for (const spec of ARTIFACT_SPECS) {
    const filepath = path.join(ctx.workdir, spec.filename);
    const content = await readIfExists(filepath);
    if (!content) {
      continue;
    }
    const faithfulness = await scoreStyleFaithfulness(content, spec.filename, ctx.styleProfile);
    if (faithfulness) {
      faithfulnesses.push(faithfulness);
    }
  }

  if (faithfulnesses.length === 0) {
    return;
  }

  const reportPath = path.join(ctx.workdir, "style-report.md");
  await fs.writeFile(reportPath, formatStyleReport(faithfulnesses), "utf8");
  console.error(`[pantheon] style report: ${reportPath}`);
}
