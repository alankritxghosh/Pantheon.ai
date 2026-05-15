import type { ArtifactStyle, CodeBlockDensity, DiagramConvention } from "./style-profile.js";

type ExtractedArtifactStyle = Omit<ArtifactStyle, "examples">;

const FIRST_PERSON_RE = /\b(we|i|our|my|us)\b/gi;
const HEDGING_RE = /\b(perhaps|might|may|could|consider|likely|possibly|seems|appears)\b/gi;
const PASSIVE_RE = /\b(?:was|were|been)\s+\w+(?:ed|en)\b/gi;
const FENCED_BLOCK_RE = /```([^\n]*)\n([\s\S]*?)```/g;

export function extractArtifactStyle(content: string): ExtractedArtifactStyle {
  const sections = extractSections(content);
  const words = countWords(content);
  const fencedBlocks = [...content.matchAll(FENCED_BLOCK_RE)];

  return {
    sections,
    avgWordsPerSection: roundMetric(words / Math.max(sections.length, 1)),
    avgWordsTotal: words,
    voice: {
      firstPersonRatio: ratioPerHundred(content.match(FIRST_PERSON_RE)?.length ?? 0, words),
      passiveVoiceRatio: ratioPerHundred(content.match(PASSIVE_RE)?.length ?? 0, words),
      hedgingDensity: ratioPerHundred(content.match(HEDGING_RE)?.length ?? 0, words),
    },
    diagramConvention: detectDiagramConvention(content, fencedBlocks),
    codeBlockDensity: detectCodeBlockDensity(fencedBlocks.length, words),
  };
}

function extractSections(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => /^##\s+(.+?)\s*#*\s*$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1].trim());
}

function countWords(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function ratioPerHundred(count: number, words: number): number {
  if (words === 0) {
    return 0;
  }
  return roundMetric(Math.min(count / (words / 100), 1));
}

function detectDiagramConvention(content: string, fencedBlocks: RegExpMatchArray[]): DiagramConvention {
  if (/```mermaid\b/i.test(content)) {
    return "mermaid";
  }
  if (fencedBlocks.some((block) => isAsciiDiagram(block[2] ?? ""))) {
    return "ascii";
  }
  if (/!\[[^\]]*]\([^)]+\)/.test(content)) {
    return "image-ref";
  }
  return "none";
}

function isAsciiDiagram(block: string): boolean {
  const diagramChars = block.match(/[|+\-/]/g)?.length ?? 0;
  const letters = block.match(/[a-z]/gi)?.length ?? 0;
  return diagramChars >= 8 && diagramChars > letters * 0.4;
}

function detectCodeBlockDensity(blocks: number, words: number): CodeBlockDensity {
  if (blocks === 0 || words === 0) {
    return "none";
  }
  const density = blocks / (words / 1000);
  if (density >= 3) {
    return "high";
  }
  if (density >= 1) {
    return "medium";
  }
  return "low";
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}
