import { extractArtifactStyle } from "./extractor.js";
import { slugForFilename, type StyleProfile } from "./style-profile.js";

export interface StyleFaithfulness {
  filename: string;
  slug: string;
  scores: {
    sectionStructure: number;
    length: number;
    voice: number;
    diagramConvention: number;
    codeBlockDensity: number;
  };
  overall: number;
  issues: string[];
}

const WEIGHTS = {
  sectionStructure: 0.4,
  length: 0.2,
  voice: 0.2,
  diagramConvention: 0.1,
  codeBlockDensity: 0.1,
};

export async function scoreStyleFaithfulness(
  content: string,
  filename: string,
  profile: StyleProfile,
): Promise<StyleFaithfulness | null> {
  const slug = slugForFilename(filename);
  const expected = slug ? profile.artifactStyles[slug] : undefined;
  if (!slug || !expected) {
    return null;
  }

  const actual = extractArtifactStyle(content);
  const sectionStructure = scoreSectionStructure(actual.sections, expected.sections);
  const length = scoreLength(actual.avgWordsTotal, expected.avgWordsTotal);
  const voice = mean([
    scoreSignal(actual.voice.firstPersonRatio, expected.voice.firstPersonRatio),
    scoreSignal(actual.voice.passiveVoiceRatio, expected.voice.passiveVoiceRatio),
    scoreSignal(actual.voice.hedgingDensity, expected.voice.hedgingDensity),
  ]);
  const diagramConvention = actual.diagramConvention === expected.diagramConvention ? 1 : 0;
  const codeBlockDensity = actual.codeBlockDensity === expected.codeBlockDensity ? 1 : 0;
  const scores = {
    sectionStructure,
    length,
    voice,
    diagramConvention,
    codeBlockDensity,
  };

  return {
    filename,
    slug,
    scores,
    overall: roundScore(
      sectionStructure * WEIGHTS.sectionStructure +
        length * WEIGHTS.length +
        voice * WEIGHTS.voice +
        diagramConvention * WEIGHTS.diagramConvention +
        codeBlockDensity * WEIGHTS.codeBlockDensity,
    ),
    issues: buildIssues(actual, expected, scores),
  };
}

export function formatStyleReport(faithfulnesses: StyleFaithfulness[]): string {
  const overall = faithfulnesses.length === 0 ? 1 : mean(faithfulnesses.map((item) => item.overall));
  const details = faithfulnesses
    .filter((item) => item.issues.length > 0)
    .map((item) => `## ${item.filename}\n\n${item.issues.map((issue) => `- ${issue}`).join("\n")}`)
    .join("\n\n");

  return `# Style Faithfulness Report

Overall: ${formatPercent(overall)}

| Artifact | Overall | Structure | Length | Voice | Issues |
| --- | ---: | ---: | ---: | ---: | ---: |
${faithfulnesses
  .map((item) => {
    return `| ${item.filename} | ${formatPercent(item.overall)} | ${formatPercent(item.scores.sectionStructure)} | ${formatPercent(item.scores.length)} | ${formatPercent(item.scores.voice)} | ${item.issues.length} |`;
  })
  .join("\n")}

${details || "## Detailed Issues\n\n- None"}
`;
}

function scoreSectionStructure(actualSections: string[], expectedSections: string[]): number {
  if (expectedSections.length === 0) {
    return 1;
  }

  let lastOrderedIndex = -1;
  let score = 0;
  for (const expected of expectedSections) {
    const index = actualSections.findIndex((section) => normalizeSection(section) === normalizeSection(expected));
    if (index === -1) {
      continue;
    }
    if (index > lastOrderedIndex) {
      score += 1;
      lastOrderedIndex = index;
    } else {
      score += 0.5;
    }
  }

  return roundScore(score / expectedSections.length);
}

function scoreLength(actual: number, expected: number): number {
  if (!expected) {
    return 1;
  }
  return roundScore(1 - Math.min(1, Math.abs(actual - expected) / expected));
}

function scoreSignal(actual: number, expected: number): number {
  return roundScore(1 - Math.min(1, Math.abs(actual - expected) / Math.max(0.05, expected)));
}

function buildIssues(
  actual: ReturnType<typeof extractArtifactStyle>,
  expected: NonNullable<StyleProfile["artifactStyles"][string]>,
  scores: StyleFaithfulness["scores"],
): string[] {
  const issues: string[] = [];

  if (scores.sectionStructure < 0.7) {
    for (const section of expected.sections) {
      if (!actual.sections.some((actualSection) => normalizeSection(actualSection) === normalizeSection(section))) {
        issues.push(`Missing section: '${section}'`);
      }
    }
  }

  if (scores.length < 0.7 && expected.avgWordsTotal > 0) {
    const actualWords = actual.avgWordsTotal;
    const pct = Math.round((Math.abs(actualWords - expected.avgWordsTotal) / expected.avgWordsTotal) * 100);
    const direction = actualWords < expected.avgWordsTotal ? "below" : "above";
    issues.push(`Length ${actualWords} words is ${pct}% ${direction} expected ${expected.avgWordsTotal}`);
  }

  if (scores.voice < 0.7) {
    issues.push("Voice metrics differ from learned style");
  }

  if (scores.diagramConvention < 0.7) {
    issues.push(`Output uses ${actual.diagramConvention} diagrams; learned style uses ${expected.diagramConvention}`);
  }

  if (scores.codeBlockDensity < 0.7) {
    issues.push(`Output uses ${actual.codeBlockDensity} code block density; learned style uses ${expected.codeBlockDensity}`);
  }

  return issues;
}

function normalizeSection(section: string): string {
  return section.trim().toLowerCase();
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return roundScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
