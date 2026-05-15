import fs from "fs/promises";
import path from "path";

export type DiagramConvention = "mermaid" | "ascii" | "image-ref" | "none";
export type CodeBlockDensity = "high" | "medium" | "low" | "none";

export interface VoiceSignals {
  firstPersonRatio: number;
  passiveVoiceRatio: number;
  hedgingDensity: number;
}

export interface ArtifactStyle {
  sections: string[];
  avgWordsPerSection: number;
  avgWordsTotal: number;
  voice: VoiceSignals;
  diagramConvention: DiagramConvention;
  codeBlockDensity: CodeBlockDensity;
  examples: string[];
}

/**
 * Generalizable writing-style signals that apply to every artifact, not just
 * exact-slug matches. Deliberately excludes `sections` — section structure is
 * artifact-specific and must not be cross-applied.
 */
export interface GlobalStyle {
  voice: VoiceSignals;
  avgWordsTotal: number;
  diagramConvention: DiagramConvention;
  codeBlockDensity: CodeBlockDensity;
}

export interface StyleProfile {
  company?: string;
  extractedAt: string;
  sourceDocs: string[];
  artifactStyles: Record<string, ArtifactStyle>;
  /**
   * Optional. Absent in pre-Phase-7 style.json files; loaders must tolerate
   * its absence and fall back to Phase 2 behavior (no global fallback).
   */
  globalStyle?: GlobalStyle;
}

const STYLE_PROFILE_PATH = path.join(".pantheon", "style.json");

export const ARTIFACT_SLUG_TO_FILENAME: Record<string, string> = {
  "evidence-ledger": "evidence-ledger.md",
  "product-vision": "product-vision.md",
  "personas-jtbd": "user-personas-jtbd.md",
  competitive: "competitive-deconstruction.md",
  "opportunity-scorecard": "opportunity-scorecard.md",
  prd: "prd-v1.md",
  "system-design": "system-design.md",
  "eval-plan": "evals.md",
  roadmap: "roadmap.md",
  "launch-plan": "launch-plan.md",
  "risk-review": "risk-review.md",
  "decision-packet": "decision-packet.md",
  "quality-report": "quality-report.md",
};

export function defaultStyleProfile(): StyleProfile {
  return {
    extractedAt: new Date().toISOString(),
    sourceDocs: [],
    artifactStyles: {},
  };
}

export async function loadStyleProfile(workdir: string): Promise<StyleProfile | null> {
  try {
    const raw = await fs.readFile(path.join(workdir, STYLE_PROFILE_PATH), "utf8");
    return JSON.parse(raw) as StyleProfile;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function saveStyleProfile(workdir: string, profile: StyleProfile): Promise<void> {
  const profilePath = path.join(workdir, STYLE_PROFILE_PATH);
  await fs.mkdir(path.dirname(profilePath), { recursive: true });
  await fs.writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
}

export function slugForFilename(filename: string): string | null {
  return Object.entries(ARTIFACT_SLUG_TO_FILENAME).find(([, mappedFilename]) => mappedFilename === filename)?.[0] ?? null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
