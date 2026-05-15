import fs from "fs/promises";
import path from "path";
import type { ContextFile, WorkspaceContext } from "../workspace.js";

export const EVIDENCE_CARDS_DIR = "evidence-cards";
const MAX_CARD_SNIPPETS = 8;

export interface EvidenceCard {
  id: string;
  filename: string;
  sourcePath: string;
  fileType: string;
  bytes: number;
  headings: string[];
  confirmedFacts: string[];
  userSignals: string[];
  metrics: string[];
  risks: string[];
  assumptions: string[];
  evidenceGaps: string[];
}

export interface EvidenceEnrichmentResult {
  enabled: boolean;
  status: "disabled" | "success" | "failed";
  detail: string;
}

export function extractEvidenceCards(ctx: WorkspaceContext): EvidenceCard[] {
  return ctx.supportedFiles.map((file, index) => extractEvidenceCard(file, index + 1));
}

function extractEvidenceCard(file: ContextFile, index: number): EvidenceCard {
  const fileType = path.extname(file.relativePath).replace(/^\./, "") || "text";
  const lines = file.content.split(/\r?\n/);
  const headings = extractHeadings(lines);
  const significant = significantLines(lines);
  const metrics = linesMatching(lines, /(\b\d+(?:\.\d+)?%?\b|\$[0-9,.]+|latency|conversion|retention|cogs|csat|p\d+|q[1-4]|n=|tickets?|escalations?)/i);
  const risks = linesMatching(lines, /(risk|blocker|constraint|privacy|legal|consent|retention|security|abuse|failure|timeout|deprecated|cannot|can't|issue|bug|escalat)/i);
  const userSignals = linesMatching(lines, /(customer|user|seller|shopper|interview|feedback|support|complain|request|pain|workaround|persona|jtbd)/i);
  const sqlSignals = fileType === "sql" ? linesMatching(lines, /\b(select|from|where|join|group by|count|avg|sum|metric|event)\b/i) : [];

  const confirmedFacts = uniqueFirst([
    ...headings.map((heading) => `Document section present: ${heading}`),
    ...significant,
    ...sqlSignals,
  ], MAX_CARD_SNIPPETS);

  return {
    id: `E${String(index).padStart(3, "0")}`,
    filename: safeEvidenceCardFilename(file.relativePath),
    sourcePath: file.relativePath,
    fileType,
    bytes: file.bytes,
    headings: headings.slice(0, MAX_CARD_SNIPPETS),
    confirmedFacts: citeAll(confirmedFacts, file.relativePath),
    userSignals: citeAll(uniqueFirst(userSignals, MAX_CARD_SNIPPETS), file.relativePath),
    metrics: citeAll(uniqueFirst(metrics, MAX_CARD_SNIPPETS), file.relativePath),
    risks: citeAll(uniqueFirst(risks, MAX_CARD_SNIPPETS), file.relativePath),
    assumptions: [
      `Assumption: signals extracted from \`${file.relativePath}\` need PM review before being treated as a roadmap commitment. [source: ${file.relativePath}]`,
    ],
    evidenceGaps: buildEvidenceGaps(file, { userSignals, metrics, risks }),
  };
}

function extractHeadings(lines: string[]): string[] {
  return uniqueFirst(
    lines
      .map((line) => line.trim())
      .filter((line) => /^#{1,6}\s+\S/.test(line))
      .map((line) => line.replace(/^#{1,6}\s+/, "")),
    MAX_CARD_SNIPPETS,
  );
}

function significantLines(lines: string[]): string[] {
  return uniqueFirst(
    lines
      .map((line) => line.trim())
      .filter((line) => line.length >= 24 && line.length <= 220)
      .filter((line) => !/^[{}[\],]+$/.test(line))
      .filter((line) => !/^[-*_]{3,}$/.test(line))
      .slice(0, 40),
    MAX_CARD_SNIPPETS,
  );
}

function linesMatching(lines: string[], pattern: RegExp): string[] {
  return uniqueFirst(
    lines
      .map((line) => line.trim())
      .filter((line) => line.length >= 6 && line.length <= 240)
      .filter((line) => pattern.test(line)),
    MAX_CARD_SNIPPETS,
  );
}

function uniqueFirst(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized.toLowerCase())) continue;
    seen.add(normalized.toLowerCase());
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

function citeAll(values: string[], sourcePath: string): string[] {
  if (values.length === 0) return [`None found in this source. [source: ${sourcePath}]`];
  return values.map((value) => `${value} [source: ${sourcePath}]`);
}

function buildEvidenceGaps(
  file: ContextFile,
  signals: { userSignals: string[]; metrics: string[]; risks: string[] },
): string[] {
  const gaps: string[] = [];
  if (signals.userSignals.length === 0) {
    gaps.push(`Evidence gap: no explicit user/customer signal detected in this source. [source: ${file.relativePath}]`);
  }
  if (signals.metrics.length === 0) {
    gaps.push(`Evidence gap: no explicit metric or numeric signal detected in this source. [source: ${file.relativePath}]`);
  }
  if (signals.risks.length === 0) {
    gaps.push(`Evidence gap: no explicit risk/constraint language detected in this source. [source: ${file.relativePath}]`);
  }
  return gaps.length > 0 ? gaps : [`Evidence gap: validate whether extracted signals are current and complete. [source: ${file.relativePath}]`];
}

export function safeEvidenceCardFilename(relativePath: string): string {
  const safeBase = relativePath
    .replace(/\\/g, "/")
    .replace(/^\.+\//, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "__")
    .replace(/^_+|_+$/g, "")
    .slice(0, 140) || "workspace-file";
  return `${safeBase}.evidence.md`;
}

export function formatEvidenceCardMarkdown(card: EvidenceCard): string {
  return `# Evidence Card: ${card.sourcePath}

## Source

- ID: ${card.id}
- Path: \`${card.sourcePath}\`
- Type: ${card.fileType}
- Bytes: ${card.bytes}

## Confirmed facts

${bullets(card.confirmedFacts)}

## User/customer signals

${bullets(card.userSignals)}

## Metrics/data points

${bullets(card.metrics)}

## Risks/constraints

${bullets(card.risks)}

## Assumptions/inferences

${bullets(card.assumptions)}

## Evidence gaps

${bullets(card.evidenceGaps)}
`;
}

export async function writeEvidenceCards(runDir: string, cards: EvidenceCard[]): Promise<void> {
  const cardsDir = path.join(runDir, EVIDENCE_CARDS_DIR);
  await fs.mkdir(cardsDir, { recursive: true });
  await Promise.all(
    cards.map((card) => fs.writeFile(path.join(cardsDir, card.filename), formatEvidenceCardMarkdown(card), "utf8")),
  );
  await fs.writeFile(path.join(cardsDir, "index.json"), `${JSON.stringify(cards, null, 2)}\n`, "utf8");
}

export function renderEvidenceBrief(cards: EvidenceCard[], maxChars: number): string {
  const sections = cards.map((card) => `## ${card.sourcePath}

### Confirmed facts
${bullets(card.confirmedFacts.slice(0, 4))}

### User/customer signals
${bullets(card.userSignals.slice(0, 4))}

### Metrics/data points
${bullets(card.metrics.slice(0, 4))}

### Risks/constraints
${bullets(card.risks.slice(0, 4))}

### Evidence gaps
${bullets(card.evidenceGaps.slice(0, 3))}`);
  const rendered = `# Evidence Brief\n\n${sections.join("\n\n")}`;
  return rendered.length <= maxChars
    ? rendered
    : `${rendered.slice(0, Math.max(0, maxChars - 52)).replace(/\s+$/, "")}\n\n[Truncated by Pantheon evidence budget.]`;
}

export function buildDeterministicEvidenceLedger(
  cards: EvidenceCard[],
  ctx: WorkspaceContext,
  clusters = "",
): string {
  const confirmed = cards.flatMap((card) => card.confirmedFacts.slice(0, 3));
  const userSignals = cards.flatMap((card) => card.userSignals.filter((item) => !item.startsWith("None found")).slice(0, 2));
  const metrics = cards.flatMap((card) => card.metrics.filter((item) => !item.startsWith("None found")).slice(0, 2));
  const risks = cards.flatMap((card) => card.risks.filter((item) => !item.startsWith("None found")).slice(0, 2));
  const gaps = cards.flatMap((card) => card.evidenceGaps.slice(0, 2));

  return `# Evidence Ledger

> Status: Deterministic fallback generated by Pantheon before model artifact generation.
> TL;DR: Pantheon extracted ${cards.length} source-grounded evidence card${cards.length === 1 ? "" : "s"} from ${ctx.supportedFiles.length} ingested file${ctx.supportedFiles.length === 1 ? "" : "s"}.

## Source Coverage

- Supported files ingested: ${ctx.supportedFiles.length}
- Unsupported context gaps: ${ctx.unsupportedFiles.length}
- Skipped supported files: ${ctx.skippedFiles.length}
- Evidence cards generated: ${cards.length}
- Ingested characters: ${ctx.totalChars}

## Confirmed Evidence

${bullets(firstOrFallback(confirmed, "Confirmed evidence was not detected in the ingested files."))}

## User/Customer Signals

${bullets(firstOrFallback(userSignals, "Evidence gap: no explicit user/customer signals were detected."))}

## Metrics And Data Points

${bullets(firstOrFallback(metrics, "Evidence gap: no explicit metrics or numeric data points were detected."))}

## Risks And Constraints

${bullets(firstOrFallback(risks, "Evidence gap: no explicit risks or constraints were detected."))}

## Inferences

- Inference: repeated customer, support, metric, or risk language across the evidence cards should be treated as candidate product signal, not validated roadmap direction.
- Inference: files with no explicit metrics need follow-up before sizing opportunity, prioritization, or launch readiness.
- Inference: the strongest next product decision should be based on source-backed signals above, then checked against engineering feasibility and privacy constraints.

## Assumptions

- Assumption: the workspace folder is the intended product context for this run.
- Assumption: source files are current enough to inform the generated packet unless an artifact states otherwise.
- Assumption: deterministic extraction may miss nuance in long prose; downstream artifacts should preserve Evidence gap labels where support is weak.

## Evidence Gaps

${bullets(firstOrFallback(gaps, "Evidence gap: no explicit evidence gaps were produced by extraction."))}

## Optional Evidence Clusters

${clusters.trim() || "- No model-generated evidence clusters were produced for this run."}

## What Evidence Would Change The Decision

- Direct customer quotes tied to revenue, churn, activation, support cost, or adoption blockers.
- Fresh product analytics with cohort definitions and counter-metrics.
- Engineering constraints from owners of the relevant systems.
- Legal/privacy sign-off where retention, consent, or customer data is involved.
`;
}

export function buildEvidenceReport(
  cards: EvidenceCard[],
  enrichment: EvidenceEnrichmentResult,
  ctx: WorkspaceContext,
): string {
  const sourcesWithSignals = cards.filter((card) =>
    [...card.userSignals, ...card.metrics, ...card.risks].some((item) => !item.startsWith("None found")),
  ).length;
  const gaps = cards.flatMap((card) => card.evidenceGaps).slice(0, 20);
  return `# Evidence Report

> Status: Generated by Pantheon's deterministic evidence extraction.
> TL;DR: ${cards.length} evidence card${cards.length === 1 ? "" : "s"} generated from ${ctx.supportedFiles.length} supported source file${ctx.supportedFiles.length === 1 ? "" : "s"}; enrichment ${enrichment.status}.

## Coverage

- Workspace: \`${ctx.workspaceDir}\`
- Supported files processed: ${ctx.supportedFiles.length}
- Unsupported files: ${ctx.unsupportedFiles.length}
- Skipped files: ${ctx.skippedFiles.length}
- Evidence cards generated: ${cards.length}
- Sources with extracted product signal: ${sourcesWithSignals}

## Enrichment

- Enabled: ${enrichment.enabled ? "yes" : "no"}
- Status: ${enrichment.status}
- Detail: ${enrichment.detail}

## Top Evidence Gaps

${gaps.length === 0 ? "- None detected." : bullets(gaps)}

## Card Index

${cards.map((card) => `- \`${card.filename}\` — \`${card.sourcePath}\``).join("\n") || "- None"}
`;
}

function firstOrFallback(values: string[], fallback: string): string[] {
  const filtered = values.filter((value) => value && !value.startsWith("None found"));
  return filtered.length > 0 ? uniqueFirst(filtered, 24) : [fallback];
}

function bullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n") || "- None.";
}
