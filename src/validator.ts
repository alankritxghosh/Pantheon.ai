import fs from "fs/promises";
import path from "path";

export const STANDARD_PACKET_ARTIFACTS = [
  "evidence-ledger.md",
  "product-vision.md",
  "user-personas-jtbd.md",
  "competitive-deconstruction.md",
  "opportunity-scorecard.md",
  "prd-v1.md",
  "system-design.md",
  "evals.md",
  "roadmap.md",
  "launch-plan.md",
  "risk-review.md",
  "decision-packet.md",
  "quality-report.md",
] as const;

export const MIN_NON_EMPTY_LINES = 35;
export const MIN_HEADINGS = 4;
export const DECISION_PACKET_WORD_LIMIT = 500;
const VALIDATION_REPORT = "validation-report.md";
const RAW_OUTPUT = "raw-output.md";

export interface ValidationOptions {
  invalidArtifactNames?: string[];
  allowedExtraMarkdownFiles?: string[];
}

export interface ArtifactCheck {
  filename: string;
  exists: boolean;
  nonEmptyLines?: number;
  headings?: number;
  words?: number;
  failures: string[];
}

export interface ValidationResult {
  passed: boolean;
  demoReady: boolean;
  reportPath: string;
  checks: ArtifactCheck[];
  missingArtifacts: string[];
  shallowArtifacts: string[];
  invalidArtifactNames: string[];
  decisionPacketWords: number | null;
}

export async function validateRunFolder(
  workdir: string,
  options: ValidationOptions = {},
): Promise<ValidationResult> {
  const entries = await fs.readdir(workdir);
  const files = entries.filter((entry) => entry.endsWith(".md")).sort();
  const invalidOnDisk = files.filter((entry) => !isFlatMarkdownFilename(entry));
  const invalidArtifactNames = [
    ...new Set([...(options.invalidArtifactNames ?? []), ...invalidOnDisk]),
  ].sort();

  const checks: ArtifactCheck[] = [];
  for (const filename of STANDARD_PACKET_ARTIFACTS) {
    const filepath = path.join(workdir, filename);
    const check: ArtifactCheck = {
      filename,
      exists: files.includes(filename),
      failures: [],
    };

    if (!check.exists) {
      check.failures.push("missing");
      checks.push(check);
      continue;
    }

    const content = await fs.readFile(filepath, "utf8");
    checks.push(validateArtifactContent(filename, content));
  }

  const missingArtifacts = checks
    .filter((check) => check.failures.includes("missing"))
    .map((check) => check.filename);
  const shallowArtifacts = checks
    .filter((check) => check.failures.some((failure) => failure.startsWith("too shallow")))
    .map((check) => check.filename);
  const decisionPacket = checks.find((check) => check.filename === "decision-packet.md");
  const decisionPacketWords = decisionPacket?.words ?? null;
  const passed = checks.every((check) => check.failures.length === 0) && invalidArtifactNames.length === 0;
  const report = renderValidationReport({
    workdir,
    checks,
    files,
    invalidArtifactNames,
    passed,
    decisionPacketWords,
    allowedExtraMarkdownFiles: options.allowedExtraMarkdownFiles ?? [],
  });
  const reportPath = path.join(workdir, VALIDATION_REPORT);
  await fs.writeFile(reportPath, report, "utf8");

  return {
    passed,
    demoReady: passed,
    reportPath,
    checks,
    missingArtifacts,
    shallowArtifacts,
    invalidArtifactNames,
    decisionPacketWords,
  };
}

export async function validateArtifactFile(workdir: string, filename: string): Promise<ArtifactCheck> {
  const filepath = path.join(workdir, filename);
  try {
    const content = await fs.readFile(filepath, "utf8");
    return validateArtifactContent(filename, content);
  } catch {
    return { filename, exists: false, failures: ["missing"] };
  }
}

export async function writeValidationAwareQualityReport(
  workdir: string,
  validation: ValidationResult,
): Promise<void> {
  const filepath = path.join(workdir, "quality-report.md");
  let existing = "";
  try {
    existing = await fs.readFile(filepath, "utf8");
  } catch {
    existing = "# Quality Report\n\n## Model Review\n\n- Missing provider-generated quality report.\n";
  }

  const body = existing.replace(
    /^# Quality Report\s+\n## Pantheon Deterministic Validation[\s\S]*?(?=\n## Model Review|\n# |\n## |$)/,
    "",
  );
  const modelReview = body.includes("## Model Review") ? body.trimStart() : `## Model Review\n\n${body.trimStart()}`;
  await fs.writeFile(
    filepath,
    `# Quality Report

## Pantheon Deterministic Validation

> Status: ${validation.passed ? "Pass" : "Fail"}.
> Demo readiness: ${validation.demoReady ? "Demo-ready" : "Not demo-ready"}.
> Source of truth: \`validation-report.md\`.

| Artifact | Status | Lines | Headings | Words | Notes |
| --- | --- | ---: | ---: | ---: | --- |
${validation.checks
  .map((check) => {
    const status = check.failures.length === 0 ? "Pass" : "Fail";
    const notes = check.failures.length === 0 ? "-" : check.failures.join("; ");
    return `| ${check.filename} | ${status} | ${check.nonEmptyLines ?? "-"} | ${check.headings ?? "-"} | ${check.words ?? "-"} | ${notes} |`;
  })
  .join("\n")}

${modelReview}`,
    "utf8",
  );
}

export function validateArtifactContent(filename: string, content: string): ArtifactCheck {
  const check: ArtifactCheck = {
    filename,
    exists: true,
    failures: [],
    nonEmptyLines: countNonEmptyLines(content),
    headings: countMarkdownHeadings(content),
    words: countWords(content),
  };

  if (filename === "decision-packet.md") {
    if ((check.words ?? 0) > DECISION_PACKET_WORD_LIMIT) {
      check.failures.push(
        `too long: ${check.words} words; limit is ${DECISION_PACKET_WORD_LIMIT}`,
      );
    }
    requireSignals(check, content, [
      ["recommendation"],
      ["risk", "risks"],
      ["ask", "asks"],
      ["next decision"],
    ]);
  } else if ((check.nonEmptyLines ?? 0) < MIN_NON_EMPTY_LINES || (check.headings ?? 0) < MIN_HEADINGS) {
    check.failures.push(
      `too shallow: ${check.nonEmptyLines} non-empty lines and ${check.headings} headings; floor is ${MIN_NON_EMPTY_LINES} lines and ${MIN_HEADINGS} headings`,
    );
  }

  if (filename === "evidence-ledger.md") {
    requireSignals(check, content, [
      ["confirmed"],
      ["inference"],
      ["assumption"],
      ["evidence gap", "evidence gaps", "data needed"],
    ]);
  }

  if (filename === "evals.md") {
    requireSignals(check, content, [
      ["adversarial"],
      ["ship gate", "ship gates", "ship-gate", "ship-gates"],
    ]);
  }

  // competitive-deconstruction.md is a comparison artifact — model names are required and valid
  if (filename !== "competitive-deconstruction.md") {
    const staleModels = findStaleCurrentModelReferences(content);
    if (staleModels.length > 0) {
      check.failures.push(
        `stale current-model recommendation: ${[...new Set(staleModels)].join(", ")}; old model names may appear only as legacy/rejected examples`,
      );
    }
  }

  return check;
}

export function isFlatMarkdownFilename(filename: string): boolean {
  return (
    filename.endsWith(".md") &&
    filename === path.basename(filename) &&
    !filename.includes("/") &&
    !filename.includes("\\") &&
    filename !== "." &&
    filename !== ".."
  );
}

function renderValidationReport(args: {
  workdir: string;
  checks: ArtifactCheck[];
  files: string[];
  invalidArtifactNames: string[];
  passed: boolean;
  decisionPacketWords: number | null;
  allowedExtraMarkdownFiles: string[];
}): string {
  const allowedExtraMarkdownFiles = new Set(args.allowedExtraMarkdownFiles);
  const failedChecks = args.checks.filter((check) => check.failures.length > 0);
  const extraFiles = args.files.filter(
    (file) =>
      !STANDARD_PACKET_ARTIFACTS.includes(file as (typeof STANDARD_PACKET_ARTIFACTS)[number]) &&
      file !== VALIDATION_REPORT &&
      file !== RAW_OUTPUT &&
      !allowedExtraMarkdownFiles.has(file),
  );

  return `# Validation Report

> Status: ${args.passed ? "Pass" : "Fail"}.
> Demo readiness: ${args.passed ? "Demo-ready" : "Not demo-ready"}.

## Summary

- Folder: \`${args.workdir}\`
- Required artifacts: ${STANDARD_PACKET_ARTIFACTS.length}
- Failed artifact checks: ${failedChecks.length}
- Invalid artifact filenames: ${args.invalidArtifactNames.length}
- Decision packet words: ${args.decisionPacketWords ?? "missing"}

## Artifact Checks

| Artifact | Status | Lines | Headings | Words | Notes |
| --- | --- | ---: | ---: | ---: | --- |
${args.checks
  .map((check) => {
    const status = check.failures.length === 0 ? "Pass" : "Fail";
    const notes = check.failures.length === 0 ? "-" : check.failures.join("; ");
    return `| ${check.filename} | ${status} | ${check.nonEmptyLines ?? "-"} | ${check.headings ?? "-"} | ${check.words ?? "-"} | ${notes} |`;
  })
  .join("\n")}

## Invalid Artifact Filenames

${args.invalidArtifactNames.length === 0 ? "- None" : args.invalidArtifactNames.map((name) => `- \`${name}\``).join("\n")}

## Extra Markdown Files

${extraFiles.length === 0 ? "- None" : extraFiles.map((name) => `- \`${name}\``).join("\n")}

## Validation Rules

- Standard packet artifacts must all be present.
- Every standard artifact except \`decision-packet.md\` must have at least ${MIN_NON_EMPTY_LINES} non-empty lines and ${MIN_HEADINGS} markdown headings.
- \`decision-packet.md\` must be at or under ${DECISION_PACKET_WORD_LIMIT} words.
- Artifact filenames must be flat Markdown filenames with no folders or path separators.
`;
}

function countNonEmptyLines(content: string): number {
  return content.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

function countMarkdownHeadings(content: string): number {
  return content.split(/\r?\n/).filter((line) => /^#{1,6}\s+\S/.test(line.trim())).length;
}

function countWords(content: string): number {
  const words = content.trim().match(/\S+/g);
  return words?.length ?? 0;
}

function requireSignals(check: ArtifactCheck, content: string, termGroups: string[][]): void {
  const lower = content.toLowerCase();
  const missing = termGroups
    .filter((terms) => !terms.some((term) => lower.includes(term)))
    .map((terms) => terms[0] ?? "unknown");
  if (missing.length > 0) {
    check.failures.push(`missing required content signals: ${missing.join(", ")}`);
  }
}

function findStaleCurrentModelReferences(content: string): string[] {
  const stalePatterns = [
    /claude\s+3\.5(?:\s+sonnet)?/gi,
    /gemini\s+1\.5(?:\s+pro)?/gi,
    /gpt-4o-0806/gi,
  ];
  const allowedContext =
    /\b(legacy|outdated|stale|old|older|rejected|avoid|do not use|not current|historical|previously|formerly|prior|before|competitor|compare|compared|versus|vs|instead of|rather than|example|for example|such as|e\.g)\b/i;
  const hits: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (allowedContext.test(line)) continue;
    for (const pattern of stalePatterns) {
      const matches = line.match(pattern);
      if (matches) hits.push(...matches);
    }
  }
  return hits;
}
