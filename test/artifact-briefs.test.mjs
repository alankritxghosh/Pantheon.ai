import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ARTIFACT_SPECS } from "../dist/artifacts.js";
import {
  artifactBriefFilename,
  buildArtifactBrief,
  buildDeterministicFallbackArtifact,
  renderArtifactBriefForPrompt,
  writeArtifactBrief,
  writeRunMetrics,
} from "../dist/briefs/briefs.js";
import { validateArtifactContent } from "../dist/validator.js";
import { mirrorRunToLatest } from "../dist/workspace.js";

async function tempDir(name) {
  return fs.mkdtemp(path.join(os.tmpdir(), `pantheon-${name}-`));
}

const evidenceBrief = `# Evidence Brief

## support/foo.md

- Customer escalation with CSAT 42%. [source: support/foo.md]
- Risk: privacy review is blocking rollout. [source: support/foo.md]
- Evidence gap: validate the cohort size. [source: support/foo.md]
`;

test("artifact briefs are generated for every downstream artifact", async () => {
  const dir = await tempDir("briefs");
  await fs.writeFile(path.join(dir, "evidence-report.md"), "# Evidence Report\n\n- Coverage [source: support/foo.md]\n");
  await fs.writeFile(path.join(dir, "evidence-ledger.md"), "# Evidence Ledger\n\n- Confirmed [source: support/foo.md]\n");
  const downstream = ARTIFACT_SPECS.filter((spec) => spec.filename !== "evidence-ledger.md");

  for (const spec of downstream) {
    const brief = await buildArtifactBrief(spec, {
      workdir: dir,
      evidenceBrief,
      dependencyMarkdown: "## evidence-ledger.md\n\n[source: support/foo.md]",
      pipelineStatus: "- evidence-ledger.md: Pass",
    });
    await writeArtifactBrief(dir, spec, brief);
    assert.match(brief, new RegExp(`# Artifact Brief: ${spec.filename}`));
    assert.match(brief, /## Required Sections/);
    assert.match(brief, /\[source: support\/foo\.md\]/);
    assert.match(brief, /Assumption/);
    assert.match(brief, /Evidence gap/);
  }

  const files = await fs.readdir(path.join(dir, "artifact-briefs"));
  assert.equal(files.length, downstream.length);
  assert.ok(files.includes(artifactBriefFilename(downstream[0])));
});

test("artifact brief prompt rendering truncates visibly", () => {
  const rendered = renderArtifactBriefForPrompt("# Brief\n\n".padEnd(500, "x"), 120);
  assert.match(rendered, /Truncated by Pantheon artifact brief budget/);
});

test("deterministic fallback artifacts validate structurally", () => {
  const brief = `${evidenceBrief}\nAssumption: model polish unavailable.\nEvidence gap: needs PM review.\n`;
  for (const spec of ARTIFACT_SPECS) {
    const artifact = buildDeterministicFallbackArtifact(spec, brief);
    const check = validateArtifactContent(spec.filename, artifact);
    assert.deepEqual(check.failures, [], spec.filename);
  }
});

test("decision packet fallback stays under 500 words", () => {
  const spec = ARTIFACT_SPECS.find((item) => item.filename === "decision-packet.md");
  const artifact = buildDeterministicFallbackArtifact(spec, evidenceBrief);
  const check = validateArtifactContent("decision-packet.md", artifact);
  assert.equal(check.failures.length, 0);
  assert.ok(check.words <= 500);
});

test("run metrics write json and markdown", async () => {
  const dir = await tempDir("metrics");
  await writeRunMetrics(dir, [
    { phase: "brief", artifact: "product-vision.md", durationMs: 12, status: "pass" },
  ]);

  assert.match(await fs.readFile(path.join(dir, "run-metrics.md"), "utf8"), /product-vision\.md/);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, "run-metrics.json"), "utf8"))[0].phase, "brief");
});

test("latest excludes artifact briefs but includes run metrics", async () => {
  const runDir = await tempDir("run");
  const latestDir = await tempDir("latest");
  await fs.mkdir(path.join(runDir, "artifact-briefs"));
  await fs.writeFile(path.join(runDir, "artifact-briefs", "product-vision.brief.md"), "# Brief\n");
  await fs.writeFile(path.join(runDir, "product-vision.md"), "# Product\n");
  await fs.writeFile(path.join(runDir, "run-metrics.md"), "# Metrics\n");

  await mirrorRunToLatest(runDir, latestDir);

  assert.deepEqual((await fs.readdir(latestDir)).sort(), ["product-vision.md", "run-metrics.md"]);
});
