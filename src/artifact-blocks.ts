export interface ArtifactBlock {
  filename: string;
  content: string;
}

export function parseArtifactBlocks(text: string): ArtifactBlock[] {
  const regex =
    /<<<PANTHEON_ARTIFACT\s+filename="([^"]+)">>{2,3}\s*([\s\S]*?)\s*<<<END_PANTHEON_ARTIFACT>{2,3}/g;
  const artifacts: ArtifactBlock[] = [];
  for (const match of text.matchAll(regex)) {
    artifacts.push({ filename: match[1] ?? "artifact.md", content: match[2] ?? "" });
  }
  return artifacts;
}
