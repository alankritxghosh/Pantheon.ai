import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resolveArtifactCitations } from "../dist/citations.js";
import { loadStyleProfile } from "../dist/style/style-profile.js";
import { validateArtifactContent, writeValidationAwareQualityReport } from "../dist/validator.js";
import { mirrorRunToLatest } from "../dist/workspace.js";

async function tempDir(name) {
  return fs.mkdtemp(path.join(os.tmpdir(), `pantheon-${name}-`));
}

test("mirrorRunToLatest excludes raw debug dumps", async () => {
  const runDir = await tempDir("run");
  const latestDir = await tempDir("latest");
  await fs.writeFile(path.join(runDir, "product-vision.md"), "# Product\n");
  await fs.writeFile(path.join(runDir, "quality-report.md"), "# Quality\n");
  await fs.writeFile(path.join(runDir, "citations-report.md"), "# Citations\n");
  await fs.writeFile(path.join(runDir, "raw-output.md"), "# Raw\n");
  await fs.writeFile(path.join(runDir, "raw-output-product-vision.md"), "# Raw\n");

  await mirrorRunToLatest(runDir, latestDir);

  assert.deepEqual((await fs.readdir(latestDir)).sort(), [
    "citations-report.md",
    "product-vision.md",
    "quality-report.md",
  ]);
});

test("citation audit resolves paths and flags malformed links", () => {
  const result = resolveArtifactCitations(
    "x.md",
    "A [source: support/foo.md] B [source: missing.md] C [bad](#)",
    ["support/foo.md"],
  );

  assert.deepEqual(result.resolved, ["support/foo.md"]);
  assert.deepEqual(result.unresolved, ["missing.md"]);
  assert.equal(result.malformed, 1);
});

test("old style profiles without globalStyle still load", async () => {
  const dir = await tempDir("style");
  await fs.mkdir(path.join(dir, ".pantheon"));
  await fs.writeFile(
    path.join(dir, ".pantheon", "style.json"),
    JSON.stringify({ extractedAt: "2026-01-01T00:00:00.000Z", sourceDocs: [], artifactStyles: {} }),
  );

  const profile = await loadStyleProfile(dir);
  assert.equal(profile.globalStyle, undefined);
});

test("evidence ledger accepts source-cited confirmed evidence", () => {
  const content = `# Evidence Ledger

## Evidence Items

- Customer issue [source: support/escalations.log]
- Inference: shoppers may churn.
- Assumption: team can ship beta.
- Evidence gap: cohort sizing.
`;

  const check = validateArtifactContent("evidence-ledger.md", content, {
    styleAware: true,
    requiredSections: [],
  });
  assert.deepEqual(check.failures, []);
});

test("quality report header reflects supplied final validation state", async () => {
  const dir = await tempDir("quality");
  await fs.writeFile(
    path.join(dir, "quality-report.md"),
    "# Quality Report\n\n## Model Review\n\n> Status: Not demo-ready\n\n- opportunity-scorecard.md: Fail\n",
  );

  await writeValidationAwareQualityReport(dir, {
    passed: false,
    demoReady: false,
    reportPath: path.join(dir, "validation-report.md"),
    checks: [
      { filename: "opportunity-scorecard.md", exists: false, failures: ["missing"] },
      { filename: "quality-report.md", exists: true, failures: [], nonEmptyLines: 5, headings: 2, words: 20 },
    ],
    missingArtifacts: ["opportunity-scorecard.md"],
    shallowArtifacts: [],
    invalidArtifactNames: [],
    decisionPacketWords: null,
  });

  const report = await fs.readFile(path.join(dir, "quality-report.md"), "utf8");
  assert.match(report, /> Status: Fail\./);
  assert.match(report, /> Demo readiness: Not demo-ready\./);
  assert.match(report, /opportunity-scorecard\.md \| Fail/);
  assert.match(report, /> Status: Not demo-ready/);
});
