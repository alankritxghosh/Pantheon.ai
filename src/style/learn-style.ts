import path from "path";
import { discoverWorkspaceFiles } from "../workspace.js";
import { classifyArtifactType } from "./classifier.js";
import { embedTexts, embeddingDimension, embeddingProviderName } from "./embeddings.js";
import { extractArtifactStyle } from "./extractor.js";
import { saveStyleIndex, type StyleIndex, type StyleIndexEntry } from "./retrieval.js";
import {
  defaultStyleProfile,
  saveStyleProfile,
  type ArtifactStyle,
  type CodeBlockDensity,
  type DiagramConvention,
  type GlobalStyle,
  type StyleProfile,
} from "./style-profile.js";

interface LearnStyleOptions {
  company?: string;
}

interface StyleExample {
  relativePath: string;
  artifactType: string;
  style: Omit<ArtifactStyle, "examples">;
}

const STYLE_SUPPORTED_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);
const EMBEDDING_SNIPPET_CHARS = 2000;
const PREVIEW_CHARS = 500;

export async function learnStyle(
  inputDir: string,
  workdir: string,
  options: LearnStyleOptions = {},
): Promise<StyleProfile> {
  const resolvedInputDir = path.resolve(inputDir);
  const resolvedWorkdir = path.resolve(workdir);
  console.error(`[pantheon] learn-style: scanning ${resolvedInputDir}`);

  const files = await readStyleDocuments(resolvedInputDir);
  if (files.length === 0) {
    throw new Error(`No style sample files found in ${resolvedInputDir}`);
  }

  console.error(`[pantheon] learn-style: found ${files.length} sample file${files.length === 1 ? "" : "s"}`);
  const examples = files.map((file) => {
    const artifactType = classifyArtifactType(file.relativePath, file.content);
    const style = extractArtifactStyle(file.content);
    console.error(`[pantheon] learn-style: ${file.relativePath} -> ${artifactType}`);
    return { relativePath: file.relativePath, artifactType, style };
  });

  const profile = defaultStyleProfile();
  if (options.company) {
    profile.company = options.company;
  }
  profile.sourceDocs = examples.map((example) => example.relativePath).sort();
  profile.artifactStyles = aggregateExamples(examples);
  profile.globalStyle = aggregateGlobalStyle(examples);

  await saveStyleProfile(resolvedWorkdir, profile);
  console.error(`[pantheon] learn-style: wrote ${path.join(resolvedWorkdir, ".pantheon", "style.json")}`);
  await saveStyleIndex(resolvedWorkdir, await buildStyleIndex(examples, filesByRelativePath(files)));
  console.error(`[pantheon] learn-style: wrote ${path.join(resolvedWorkdir, ".pantheon", "style-index.json")}`);
  return profile;
}

async function buildStyleIndex(
  examples: StyleExample[],
  filesByPath: Map<string, string>,
): Promise<StyleIndex> {
  console.error(`[pantheon] learn-style: embedding ${examples.length} examples...`);
  const snippets = examples.map((example) => {
    const content = filesByPath.get(example.relativePath);
    if (content === undefined) {
      throw new Error(`Could not find content for style example ${example.relativePath}`);
    }
    return content.slice(0, EMBEDDING_SNIPPET_CHARS);
  });
  const vectors = await embedTexts(snippets);
  const entries: StyleIndexEntry[] = examples.map((example, index) => ({
    slug: example.artifactType,
    examplePath: example.relativePath,
    vector: vectors[index],
    preview: snippets[index].slice(0, PREVIEW_CHARS),
  }));

  return {
    provider: embeddingProviderName(),
    dimension: embeddingDimension(),
    entries,
  };
}

function aggregateExamples(examples: StyleExample[]): Record<string, ArtifactStyle> {
  const grouped = new Map<string, StyleExample[]>();
  for (const example of examples) {
    const group = grouped.get(example.artifactType) ?? [];
    group.push(example);
    grouped.set(example.artifactType, group);
  }

  return Object.fromEntries(
    [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([artifactType, group]) => [artifactType, aggregateGroup(group)]),
  );
}

/**
 * Aggregate the generalizable writing-style signals across ALL ingested
 * examples, regardless of their classified slug. Section structure is
 * deliberately omitted — it stays artifact-specific.
 */
function aggregateGlobalStyle(examples: StyleExample[]): GlobalStyle {
  return {
    voice: {
      firstPersonRatio: mean(examples.map((example) => example.style.voice.firstPersonRatio)),
      passiveVoiceRatio: mean(examples.map((example) => example.style.voice.passiveVoiceRatio)),
      hedgingDensity: mean(examples.map((example) => example.style.voice.hedgingDensity)),
    },
    avgWordsTotal: mean(examples.map((example) => example.style.avgWordsTotal)),
    diagramConvention: mode(examples.map((example) => example.style.diagramConvention)),
    codeBlockDensity: mode(examples.map((example) => example.style.codeBlockDensity)),
  };
}

function aggregateGroup(group: StyleExample[]): ArtifactStyle {
  return {
    sections: aggregateSections(group.map((example) => example.style.sections)),
    avgWordsPerSection: mean(group.map((example) => example.style.avgWordsPerSection)),
    avgWordsTotal: mean(group.map((example) => example.style.avgWordsTotal)),
    voice: {
      firstPersonRatio: mean(group.map((example) => example.style.voice.firstPersonRatio)),
      passiveVoiceRatio: mean(group.map((example) => example.style.voice.passiveVoiceRatio)),
      hedgingDensity: mean(group.map((example) => example.style.voice.hedgingDensity)),
    },
    diagramConvention: mode(group.map((example) => example.style.diagramConvention)),
    codeBlockDensity: mode(group.map((example) => example.style.codeBlockDensity)),
    examples: group.map((example) => example.relativePath).sort(),
  };
}

function aggregateSections(sectionLists: string[][]): string[] {
  if (sectionLists.length === 0) {
    return [];
  }
  if (sectionLists.length === 1) {
    return sectionLists[0];
  }

  const common = sectionLists.slice(1).reduce((current, next) => longestCommonSubsequence(current, next), sectionLists[0]);
  const longest = Math.max(...sectionLists.map((sections) => sections.length));
  if (common.length >= Math.ceil(longest / 2)) {
    return common;
  }

  return mostCommonSectionList(sectionLists);
}

function longestCommonSubsequence(left: string[], right: string[]): string[] {
  const dp: string[][][] = Array.from({ length: left.length + 1 }, () =>
    Array.from({ length: right.length + 1 }, () => []),
  );

  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      if (left[i - 1] === right[j - 1]) {
        dp[i][j] = [...dp[i - 1][j - 1], left[i - 1]];
      } else {
        dp[i][j] = dp[i - 1][j].length >= dp[i][j - 1].length ? dp[i - 1][j] : dp[i][j - 1];
      }
    }
  }

  return dp[left.length][right.length];
}

function mostCommonSectionList(sectionLists: string[][]): string[] {
  const counts = new Map<string, { sections: string[]; count: number }>();
  for (const sections of sectionLists) {
    const key = JSON.stringify(sections);
    const existing = counts.get(key);
    counts.set(key, { sections, count: (existing?.count ?? 0) + 1 });
  }

  return [...counts.values()].sort((a, b) => b.count - a.count || b.sections.length - a.sections.length)[0].sections;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function mode<T extends DiagramConvention | CodeBlockDensity>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0][0];
}

async function readStyleDocuments(inputDir: string): Promise<Array<{ relativePath: string; content: string }>> {
  const discovery = await discoverWorkspaceFiles(inputDir, {
    supportedExtensions: STYLE_SUPPORTED_EXTENSIONS,
    unsupportedReason: "unsupported file type in style ingestion",
  });
  return discovery.supportedFiles.map((file) => ({ relativePath: file.relativePath, content: file.content }));
}

function filesByRelativePath(files: Array<{ relativePath: string; content: string }>): Map<string, string> {
  return new Map(files.map((file) => [file.relativePath, file.content]));
}
