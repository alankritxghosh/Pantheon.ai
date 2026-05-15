import fs from "fs/promises";
import path from "path";
import { cosineSimilarity, embeddingDimension } from "./embeddings.js";

export interface StyleIndex {
  provider: string;
  dimension: number;
  entries: StyleIndexEntry[];
}

export interface StyleIndexEntry {
  slug: string;
  examplePath: string;
  vector: number[];
  preview: string;
}

const STYLE_INDEX_PATH = path.join(".pantheon", "style-index.json");

export async function loadStyleIndex(workdir: string): Promise<StyleIndex | null> {
  try {
    const raw = await fs.readFile(path.join(workdir, STYLE_INDEX_PATH), "utf8");
    const index = JSON.parse(raw) as StyleIndex;
    if (index.dimension !== embeddingDimension()) {
      console.error(
        `[pantheon] style: ignoring style-index.json because dimension is ${index.dimension}; expected ${embeddingDimension()}`,
      );
      return null;
    }
    if (index.entries.some((entry) => entry.vector.length !== index.dimension)) {
      console.error("[pantheon] style: ignoring style-index.json because at least one vector has the wrong dimension");
      return null;
    }
    return index;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function saveStyleIndex(workdir: string, index: StyleIndex): Promise<void> {
  const indexPath = path.join(workdir, STYLE_INDEX_PATH);
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

export function retrieveStyleExamples(
  index: StyleIndex,
  slug: string,
  queryEmbedding: number[],
  k: number,
): StyleIndexEntry[] {
  return index.entries
    .filter((entry) => entry.slug === slug)
    .map((entry) => ({ entry, score: cosineSimilarity(entry.vector, queryEmbedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((result) => result.entry);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
