import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeArtifactContent,
  parseArtifactBlocks,
  recoverSingleArtifactContent,
} from "../dist/artifact-blocks.js";

test("parseArtifactBlocks accepts exact and near-miss delimiters", () => {
  const exact = `<<<PANTHEON_ARTIFACT filename="x.md">>>\n# X\n<<<END_PANTHEON_ARTIFACT>>>`;
  const nearMiss = `<<<PANTHEON_ARTIFACT filename="y.md">>\n# Y\n<<<END_PANTHEON_ARTIFACT>>>`;
  const spaced = `<<PANTHEON_ARTIFACT filename="z.md" >>\n# Z\n<<END_PANTHEON_ARTIFACT >>`;

  assert.deepEqual(
    parseArtifactBlocks(`${exact}\n${nearMiss}\n${spaced}`).map((artifact) => artifact.filename),
    ["x.md", "y.md", "z.md"],
  );
});

test("recoverSingleArtifactContent unwraps raw-output fences", () => {
  const raw = `# Raw Provider Output

## stdout

\`\`\`text
# Opportunity Scorecard

## Score Table

Useful content.
\`\`\`

## stderr

\`\`\`text
\`\`\`
`;

  assert.equal(
    recoverSingleArtifactContent(raw),
    "# Opportunity Scorecard\n\n## Score Table\n\nUseful content.\n",
  );
});

test("recoverSingleArtifactContent refuses ambiguous delimiter leftovers", () => {
  const raw = `Some text\n<<<PANTHEON_ARTIFACT filename="x.md">\n# Broken`;
  assert.equal(recoverSingleArtifactContent(raw), null);
});

test("normalizeArtifactContent strips prompt scaffolding lines", () => {
  assert.equal(
    normalizeArtifactContent("# Title\nStyle source: reference .pantheon/style.json\nWriting style to match:\nReal content\n"),
    "# Title\nReal content\n",
  );
});
