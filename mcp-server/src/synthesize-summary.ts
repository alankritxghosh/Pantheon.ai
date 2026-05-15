// Pure functions that turn an opportunity-scorecard.md artifact into a
// terminal-friendly top-N summary. No file IO. No globals. Heavily unit tested.

export interface ParsedOpportunity {
  rank: number;
  name: string;
  score: number | null;
  rationale: string;
  citation: string | null;
}

export interface SummaryOptions {
  topN: number;
  // Terminal width hint; lines wrap defensively at this column.
  columnWidth?: number;
}

const DEFAULT_COLUMN_WIDTH = 100;

const CITATION_PATTERN = /\[source:\s*([^\]]+)\]/i;

/**
 * Parse the opportunity-scorecard.md markdown into a ranked list of
 * opportunities. Robust against minor formatting drift in model output.
 *
 * Strategy: look for any pattern that mentions a numeric score and a name.
 * Supported shapes:
 *   1. **Opportunity Name** — Score: 8/10 ...
 *   ### 1. Opportunity Name (score 8)
 *   | Opportunity Name | 8 | ... |
 */
export function parseOpportunityScorecard(markdown: string): ParsedOpportunity[] {
  if (!markdown.trim()) return [];

  const results: ParsedOpportunity[] = [];
  const seen = new Set<string>();

  // Table rows: | name | score | rationale | citation |
  for (const row of extractTableRows(markdown)) {
    const opp = tableRowToOpportunity(row, results.length + 1);
    if (opp && !seen.has(opp.name.toLowerCase())) {
      results.push(opp);
      seen.add(opp.name.toLowerCase());
    }
  }

  // Heading style: "### 1. Name (score 8)" or "## Opportunity: Name — score 8/10"
  for (const heading of extractScoredHeadings(markdown)) {
    if (!seen.has(heading.name.toLowerCase())) {
      results.push({ ...heading, rank: results.length + 1 });
      seen.add(heading.name.toLowerCase());
    }
  }

  // Sort by score desc; opportunities with no score sink to the bottom but keep relative order.
  results.sort((a, b) => {
    const scoreA = a.score ?? -Infinity;
    const scoreB = b.score ?? -Infinity;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.rank - b.rank;
  });

  // Re-rank after sort.
  return results.map((opp, idx) => ({ ...opp, rank: idx + 1 }));
}

export function renderTopN(opportunities: ParsedOpportunity[], options: SummaryOptions): string {
  const topN = Math.max(1, Math.floor(options.topN));
  const width = options.columnWidth ?? DEFAULT_COLUMN_WIDTH;
  if (opportunities.length === 0) {
    return [
      "Top opportunities:",
      "  (no scored opportunities found in opportunity-scorecard.md)",
      "",
      "  Inspect the artifact directly: pantheon-output/latest/opportunity-scorecard.md",
    ].join("\n");
  }

  const slice = opportunities.slice(0, topN);
  const lines: string[] = [];
  lines.push(`Top ${slice.length} opportunit${slice.length === 1 ? "y" : "ies"}:`);
  lines.push("");
  slice.forEach((opp, idx) => {
    const scoreLabel = opp.score === null ? "score: unscored" : `score: ${formatScore(opp.score)}`;
    lines.push(`${idx + 1}. ${truncate(opp.name, width - 4)} — ${scoreLabel}`);
    if (opp.rationale) {
      lines.push(`   Why: ${truncate(opp.rationale, width - 8)}`);
    }
    if (opp.citation) {
      lines.push(`   Evidence: ${truncate(opp.citation, width - 13)}`);
    }
    lines.push("");
  });
  lines.push("Full artifacts written to: pantheon-output/latest/");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function extractTableRows(markdown: string): string[][] {
  const rows: string[][] = [];
  let inTable = false;
  let headerSeen = false;
  let separatorSeen = false;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = splitTableRow(line);
      if (!inTable) {
        inTable = true;
        headerSeen = true;
        separatorSeen = false;
        continue; // header row, skip
      }
      if (headerSeen && !separatorSeen) {
        // separator row e.g. | --- | --- |
        if (cells.every((cell) => /^[-:\s]+$/.test(cell))) {
          separatorSeen = true;
          continue;
        }
      }
      if (separatorSeen) {
        rows.push(cells);
      }
    } else if (line === "") {
      inTable = false;
      headerSeen = false;
      separatorSeen = false;
    }
  }

  return rows;
}

function splitTableRow(line: string): string[] {
  return line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function tableRowToOpportunity(cells: string[], rank: number): ParsedOpportunity | null {
  if (cells.length < 2) return null;
  const name = stripInlineMarkdown(cells[0]);
  if (!name) return null;
  const score = findScoreInCells(cells);
  const citationCell = cells.find((cell) => CITATION_PATTERN.test(cell));
  const citationMatch = citationCell?.match(CITATION_PATTERN);
  const citation = citationMatch ? citationMatch[1].trim() : null;
  // Rationale: the longest cell (after the name) that is neither the score nor the citation.
  const candidates = cells
    .slice(1)
    .filter((cell) => !CITATION_PATTERN.test(cell))
    .filter((cell) => parseScore(cell) === null)
    .filter((cell) => cell.length > 3);
  const rationaleCell = candidates.sort((a, b) => b.length - a.length)[0] ?? "";
  const rationale = stripInlineMarkdown(rationaleCell);
  return { rank, name, score, rationale, citation };
}

function findScoreInCells(cells: string[]): number | null {
  for (const cell of cells) {
    const value = parseScore(cell);
    if (value !== null) return value;
  }
  return null;
}

function parseScore(value: string): number | null {
  const cleaned = value.replace(/[^0-9./\-]/g, " ").trim();
  if (!cleaned) return null;
  const fraction = cleaned.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return Number((numerator / denominator * 10).toFixed(2));
  }
  const single = cleaned.match(/^(\d+(?:\.\d+)?)/);
  if (single) {
    const n = Number(single[1]);
    if (Number.isFinite(n) && n >= 0 && n <= 100) return n > 10 ? Number((n / 10).toFixed(2)) : n;
  }
  return null;
}

function extractScoredHeadings(markdown: string): Array<Omit<ParsedOpportunity, "rank">> {
  const headings: Array<Omit<ParsedOpportunity, "rank">> = [];
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = /^#{2,4}\s+(?:\d+[.)]\s+)?(.+?)\s*(?:\(score\s*[:=]?\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\)|—\s*score\s*[:=]?\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?)\s*$/i.exec(line.trim());
    if (!match) continue;
    const name = stripInlineMarkdown(match[1]);
    if (!name) continue;
    const num = Number(match[2] ?? match[4] ?? "");
    const denom = Number(match[3] ?? match[5] ?? "10");
    const score = Number.isFinite(num) && denom > 0 ? Number((num / denom * 10).toFixed(2)) : null;
    const rationale = collectFollowingProse(lines, i + 1);
    const citationMatch = rationale.match(CITATION_PATTERN);
    const citation = citationMatch ? citationMatch[1].trim() : null;
    headings.push({ name, score, rationale, citation });
  }
  return headings;
}

function collectFollowingProse(lines: string[], startIdx: number): string {
  const collected: string[] = [];
  for (let i = startIdx; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      if (collected.length > 0) break;
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) break;
    if (line.startsWith("|") || line.startsWith("```")) break;
    collected.push(line);
    if (collected.join(" ").length > 220) break;
  }
  return collected.join(" ").replace(/\s+/g, " ").trim();
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/^\*\*\s*/, "")
    .replace(/\s*\*\*$/, "")
    .replace(/^_\s*/, "")
    .replace(/\s*_$/, "")
    .replace(/^`/, "")
    .replace(/`$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatScore(score: number): string {
  if (Number.isInteger(score)) return `${score}/10`;
  return `${score.toFixed(1)}/10`;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 1) return value.slice(0, max);
  return `${value.slice(0, max - 1).trimEnd()}…`;
}
