import fs from "fs/promises";
import path from "path";

/**
 * Folder-native citation format: [source: <relative-path>] where
 * <relative-path> is a file the model was given in the workspace context.
 */
const CITATION_RE = /\[source:\s*([^\]]+?)\s*\]/gi;
/** Legacy/malformed citations the pre-Phase-7 prompt produced, e.g. `[text](#)`. */
const MALFORMED_LINK_RE = /\]\(\s*#\s*\)/g;

const CITATIONS_REPORT = "citations-report.md";

export interface ArtifactCitationResult {
  filename: string;
  total: number;
  resolved: string[];
  unresolved: string[];
  malformed: number;
}

export interface CitationAuditResult {
  artifacts: ArtifactCitationResult[];
  totalCitations: number;
  totalResolved: number;
  totalUnresolved: number;
  totalMalformed: number;
}

export function extractCitations(content: string): string[] {
  const found: string[] = [];
  for (const match of content.matchAll(CITATION_RE)) {
    found.push(match[1].trim());
  }
  return found;
}

function normalizePath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

export function resolveArtifactCitations(
  filename: string,
  content: string,
  workspaceFiles: string[],
): ArtifactCitationResult {
  const fullPaths = new Set(workspaceFiles.map(normalizePath));
  const basenames = new Set(workspaceFiles.map((file) => normalizePath(path.basename(file))));
  const resolved: string[] = [];
  const unresolved: string[] = [];

  for (const citation of extractCitations(content)) {
    const normalized = normalizePath(citation);
    const matches =
      fullPaths.has(normalized) || basenames.has(normalizePath(path.basename(citation)));
    if (matches) {
      resolved.push(citation);
    } else {
      unresolved.push(citation);
    }
  }

  const malformed = (content.match(MALFORMED_LINK_RE) ?? []).length;
  return { filename, total: resolved.length + unresolved.length, resolved, unresolved, malformed };
}

/**
 * Scan each artifact for citation markers and check that each resolves to a
 * real workspace file. Informational only — never blocks a run.
 */
export async function runCitationAudit(
  workdir: string,
  artifactFilenames: readonly string[],
  workspaceFiles: string[],
): Promise<CitationAuditResult> {
  const artifacts: ArtifactCitationResult[] = [];
  for (const filename of artifactFilenames) {
    let content: string;
    try {
      content = await fs.readFile(path.join(workdir, filename), "utf8");
    } catch {
      continue;
    }
    artifacts.push(resolveArtifactCitations(filename, content, workspaceFiles));
  }

  return {
    artifacts,
    totalCitations: artifacts.reduce((sum, artifact) => sum + artifact.total, 0),
    totalResolved: artifacts.reduce((sum, artifact) => sum + artifact.resolved.length, 0),
    totalUnresolved: artifacts.reduce((sum, artifact) => sum + artifact.unresolved.length, 0),
    totalMalformed: artifacts.reduce((sum, artifact) => sum + artifact.malformed, 0),
  };
}

export function formatCitationsReport(result: CitationAuditResult): string {
  const lines: string[] = [];
  lines.push("# Citations Report");
  lines.push("");
  lines.push("> Status: Informational. Unresolvable citations are warnings and do not block a run.");
  lines.push(
    `> TL;DR: ${result.totalCitations} citation${result.totalCitations === 1 ? "" : "s"} found — ${result.totalResolved} resolved to workspace files, ${result.totalUnresolved} unresolved, ${result.totalMalformed} malformed.`,
  );
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Artifact | Citations | Resolved | Unresolved | Malformed |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  for (const artifact of result.artifacts) {
    lines.push(
      `| ${artifact.filename} | ${artifact.total} | ${artifact.resolved.length} | ${artifact.unresolved.length} | ${artifact.malformed} |`,
    );
  }
  lines.push("");

  const withUnresolved = result.artifacts.filter((artifact) => artifact.unresolved.length > 0);
  lines.push("## Unresolved Citations");
  lines.push("");
  if (withUnresolved.length === 0) {
    lines.push("- None. Every `[source: ...]` citation points at a real workspace file.");
  } else {
    for (const artifact of withUnresolved) {
      lines.push(`### ${artifact.filename}`);
      lines.push("");
      for (const citation of artifact.unresolved) {
        lines.push(`- \`[source: ${citation}]\` — no matching file in the workspace context`);
      }
      lines.push("");
    }
  }

  const withMalformed = result.artifacts.filter((artifact) => artifact.malformed > 0);
  if (withMalformed.length > 0) {
    lines.push("## Malformed Citations");
    lines.push("");
    lines.push(
      "These artifacts contain bare `(#)` links instead of the resolvable `[source: <relative-path>]` format:",
    );
    lines.push("");
    for (const artifact of withMalformed) {
      lines.push(`- ${artifact.filename}: ${artifact.malformed} malformed link${artifact.malformed === 1 ? "" : "s"}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export async function writeCitationsReport(
  workdir: string,
  result: CitationAuditResult,
): Promise<string> {
  const reportPath = path.join(workdir, CITATIONS_REPORT);
  await fs.writeFile(reportPath, formatCitationsReport(result), "utf8");
  return reportPath;
}
