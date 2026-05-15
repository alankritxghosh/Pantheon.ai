import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseOpportunityScorecard,
  renderTopN,
} from "../dist/cli-output/synthesize-summary.js";

const TABLE_SCORECARD = `# Opportunity Scorecard

## Scored opportunities

| Opportunity | Score | Strongest evidence | Rationale |
| --- | --- | --- | --- |
| MCP-native synthesis layer | 9.2 | [source: workspace/prd-notes.md] | Highest pain density and unblocks every other workflow. |
| Cited research synthesis | 8.7 | [source: workspace/interviews.md] | Wins on evidence and feasibility. |
| Persistent memory | 7.6 | [source: workspace/decisions.md] | High leverage but feasibility drops. |
`;

const HEADING_SCORECARD = `# Opportunity Scorecard

## Candidate wedges

### 1. MCP-native synthesis layer (score 9)

Highest pain density and unblocks every other workflow.
[source: workspace/prd.md]

### 2. Persistent memory — score 7/10

Increases retention. [source: workspace/decisions.md]
`;

test("parseOpportunityScorecard ranks table rows by score descending", () => {
  const parsed = parseOpportunityScorecard(TABLE_SCORECARD);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].name, "MCP-native synthesis layer");
  assert.equal(parsed[0].score, 9.2);
  assert.equal(parsed[0].rank, 1);
  assert.equal(parsed[1].name, "Cited research synthesis");
  assert.equal(parsed[2].name, "Persistent memory");
});

test("parseOpportunityScorecard extracts citation from table row", () => {
  const [first] = parseOpportunityScorecard(TABLE_SCORECARD);
  assert.equal(first.citation, "workspace/prd-notes.md");
});

test("parseOpportunityScorecard picks rationale instead of citation cell", () => {
  const [first] = parseOpportunityScorecard(TABLE_SCORECARD);
  assert.equal(first.rationale, "Highest pain density and unblocks every other workflow.");
});

test("parseOpportunityScorecard handles heading-style scorecards", () => {
  const parsed = parseOpportunityScorecard(HEADING_SCORECARD);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, "MCP-native synthesis layer");
  assert.equal(parsed[0].score, 9);
  assert.equal(parsed[1].score, 7);
});

test("parseOpportunityScorecard returns empty array for empty input", () => {
  assert.deepEqual(parseOpportunityScorecard(""), []);
  assert.deepEqual(parseOpportunityScorecard("   \n   "), []);
});

test("parseOpportunityScorecard returns empty array for prose without tables or headings", () => {
  const result = parseOpportunityScorecard("This is just prose with no opportunities listed.");
  assert.deepEqual(result, []);
});

test("parseOpportunityScorecard dedupes opportunities by name (case-insensitive)", () => {
  const md = `## Scorecard

| Opportunity | Score | Evidence |
| --- | --- | --- |
| Same wedge | 8 | [source: x.md] |
| same wedge | 5 | [source: y.md] |
`;
  const parsed = parseOpportunityScorecard(md);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].score, 8);
});

test("parseOpportunityScorecard handles unicode opportunity names", () => {
  const md = `| Opportunity | Score | Evidence |
| --- | --- | --- |
| 日本語 wedge | 9 | [source: nihongo.md] |
`;
  const parsed = parseOpportunityScorecard(md);
  assert.equal(parsed[0].name, "日本語 wedge");
});

test("parseOpportunityScorecard handles scores as fractions like 18/20", () => {
  const md = `| Opportunity | Score | Evidence |
| --- | --- | --- |
| Wedge A | 18/20 | [source: a.md] |
| Wedge B | 15/20 | [source: b.md] |
`;
  const parsed = parseOpportunityScorecard(md);
  assert.equal(parsed[0].name, "Wedge A");
  assert.equal(parsed[0].score, 9);
  assert.equal(parsed[1].score, 7.5);
});

test("renderTopN: zero opportunities yields a helpful empty message", () => {
  const output = renderTopN([], { topN: 3 });
  assert.match(output, /no scored opportunities/i);
  assert.match(output, /opportunity-scorecard\.md/);
});

test("renderTopN: respects topN smaller than list length", () => {
  const parsed = parseOpportunityScorecard(TABLE_SCORECARD);
  const output = renderTopN(parsed, { topN: 2 });
  assert.match(output, /Top 2 opportunities:/);
  assert.match(output, /MCP-native synthesis layer/);
  assert.match(output, /Cited research synthesis/);
  assert.doesNotMatch(output, /Persistent memory/);
});

test("renderTopN: topN larger than list shows all available", () => {
  const parsed = parseOpportunityScorecard(TABLE_SCORECARD);
  const output = renderTopN(parsed, { topN: 10 });
  assert.match(output, /Top 3 opportunities:/);
  assert.match(output, /Persistent memory/);
});

test("renderTopN: shows formatted score with /10 suffix", () => {
  const parsed = parseOpportunityScorecard(TABLE_SCORECARD);
  const output = renderTopN(parsed, { topN: 1 });
  assert.match(output, /score: 9\.2\/10/);
});

test("renderTopN: truncates long lines defensively", () => {
  const longName = "A".repeat(500);
  const output = renderTopN(
    [{ rank: 1, name: longName, score: 8, rationale: "x".repeat(500), citation: "y.md" }],
    { topN: 1, columnWidth: 80 },
  );
  for (const line of output.split("\n")) {
    assert.ok(line.length <= 100, `line too long: ${line.length} chars`);
  }
});

test("renderTopN: handles unscored opportunities by labelling them clearly", () => {
  const output = renderTopN(
    [{ rank: 1, name: "Mystery wedge", score: null, rationale: "", citation: null }],
    { topN: 1 },
  );
  assert.match(output, /Mystery wedge/);
  assert.match(output, /score: unscored/);
});
