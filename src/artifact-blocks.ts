export interface ArtifactBlock {
  filename: string;
  content: string;
}

export function parseArtifactBlocks(text: string): ArtifactBlock[] {
  const regex =
    /<{2,3}PANTHEON_ARTIFACT\s+filename="([^"]+)"\s*>{2,3}\s*([\s\S]*?)\s*<{2,3}END_PANTHEON_ARTIFACT\s*>{2,3}/g;
  const artifacts: ArtifactBlock[] = [];
  for (const match of text.matchAll(regex)) {
    artifacts.push({
      filename: (match[1] ?? "artifact.md").trim(),
      content: normalizeArtifactContent(match[2] ?? ""),
    });
  }
  return artifacts;
}

const RAW_STDOUT_RE = /## stdout\s+```(?:text|markdown|md)?\s*([\s\S]*?)\s*```\s*(?:## stderr|$)/i;
const OUTER_CODE_FENCE_RE = /^\s*```(?:markdown|md|text)?\s*\n([\s\S]*?)\n```\s*$/i;
const PROMPT_SCAFFOLDING_LINE_RE = /^\s*(style source\s*:|STYLE REQUIREMENTS\b|writing style to match\s*:)/i;

/**
 * Scoped fallback for single-artifact calls. It intentionally does not try to
 * infer filenames from freeform multi-artifact output; callers must already
 * know the one expected filename.
 */
export function recoverSingleArtifactContent(rawText: string): string | null {
  const unwrapped = unwrapRawOutput(rawText);
  if (parseArtifactBlocks(unwrapped).length > 0) {
    return null;
  }
  if (/<{2,3}PANTHEON_ARTIFACT\b/i.test(unwrapped) || /<{2,3}END_PANTHEON_ARTIFACT\b/i.test(unwrapped)) {
    return null;
  }

  let content = stripOuterCodeFence(unwrapped).trim();
  const firstHeading = content.search(/^#\s+/m);
  if (firstHeading > 0) {
    content = content.slice(firstHeading);
  }

  content = normalizeArtifactContent(content);
  if (!/^#\s+/m.test(content)) {
    return null;
  }
  return content;
}

export function normalizeArtifactContent(content: string): string {
  const stripped = stripOuterCodeFence(unwrapRawOutput(content));
  const lines = stripped.split(/\r?\n/).filter((line) => !PROMPT_SCAFFOLDING_LINE_RE.test(line));
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "")}\n`;
}

function unwrapRawOutput(text: string): string {
  const match = RAW_STDOUT_RE.exec(text);
  return match?.[1] ?? text;
}

function stripOuterCodeFence(text: string): string {
  const match = OUTER_CODE_FENCE_RE.exec(text);
  return match?.[1] ?? text;
}
