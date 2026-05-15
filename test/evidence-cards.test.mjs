import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildDeterministicEvidenceLedger,
  buildEvidenceReport,
  extractEvidenceCards,
  formatEvidenceCardMarkdown,
  renderEvidenceBrief,
  safeEvidenceCardFilename,
  writeEvidenceCards,
} from "../dist/evidence/evidence.js";
import { resolveArtifactCitations } from "../dist/citations.js";
import { validateArtifactContent } from "../dist/validator.js";
import { mirrorRunToLatest } from "../dist/workspace.js";

async function tempDir(name) {
  return fs.mkdtemp(path.join(os.tmpdir(), `pantheon-${name}-`));
}

function workspace(files) {
  return {
    workspaceDir: "/tmp/ws",
    supportedFiles: files,
    skippedFiles: [],
    unsupportedFiles: [],
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    totalChars: files.reduce((sum, file) => sum + file.content.length, 0),
  };
}

test("safeEvidenceCardFilename handles nested paths deterministically", () => {
  assert.equal(
    safeEvidenceCardFilename("support-data/escalations-log.log"),
    "support-data__escalations-log.log.evidence.md",
  );
  assert.equal(
    safeEvidenceCardFilename("../raw interviews/cust 07.md"),
    "raw__interviews__cust__07.md.evidence.md",
  );
});

test("deterministic extraction works across common workspace file types", () => {
  const ctx = workspace([
    { relativePath: "notes/readout.md", bytes: 120, content: "# Readout\nCustomer says setup is slow. CSAT 62%. Privacy risk remains." },
    { relativePath: "data/funnel.csv", bytes: 80, content: "step,conversion\nstart,100\nbuy,42\n" },
    { relativePath: "sql/funnel.sql", bytes: 90, content: "select count(*) from events where event = 'checkout_error';" },
    { relativePath: "logs/support.log", bytes: 90, content: "ERROR customer escalation: consent blocker caused timeout" },
    { relativePath: "config/okrs.yaml", bytes: 80, content: "goal: reduce escalations\nmetric: p95 latency" },
    { relativePath: "research/page.html", bytes: 80, content: "<h1>Competitor</h1><p>Users complain about reporting.</p>" },
    { relativePath: "scratch.txt", bytes: 80, content: "Need more evidence before roadmap commitment." },
  ]);

  const cards = extractEvidenceCards(ctx);
  assert.equal(cards.length, 7);
  for (const card of cards) {
    const md = formatEvidenceCardMarkdown(card);
    assert.match(md, new RegExp(`\\[source: ${card.sourcePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`));
    assert.match(md, /## Evidence gaps/);
  }
});

test("writeEvidenceCards emits markdown cards and index json", async () => {
  const dir = await tempDir("cards");
  const ctx = workspace([
    { relativePath: "support/foo.md", bytes: 40, content: "Customer asks for refund metrics. Risk: privacy review." },
  ]);
  const cards = extractEvidenceCards(ctx);

  await writeEvidenceCards(dir, cards);

  assert.deepEqual((await fs.readdir(path.join(dir, "evidence-cards"))).sort(), [
    "index.json",
    "support__foo.md.evidence.md",
  ]);
});

test("renderEvidenceBrief caps oversized output with visible notice", () => {
  const ctx = workspace([
    { relativePath: "a.md", bytes: 200, content: "# A\n".padEnd(500, "customer metric risk ") },
  ]);
  const brief = renderEvidenceBrief(extractEvidenceCards(ctx), 160);
  assert.match(brief, /# Evidence Brief/);
  assert.match(brief, /Truncated by Pantheon evidence budget/);
});

test("deterministic evidence ledger validates without a model call", () => {
  const ctx = workspace([
    { relativePath: "support/foo.md", bytes: 90, content: "# Support\nCustomer escalation. CSAT 42%. Privacy risk. Evidence gap remains." },
  ]);
  const ledger = buildDeterministicEvidenceLedger(extractEvidenceCards(ctx), ctx);
  const check = validateArtifactContent("evidence-ledger.md", ledger);

  assert.deepEqual(check.failures, []);
  assert.match(ledger, /Deterministic fallback/);
  assert.match(ledger, /Confirmed Evidence/);
});

test("citation audit resolves deterministic evidence ledger citations", () => {
  const ctx = workspace([
    { relativePath: "support/foo.md", bytes: 90, content: "Customer escalation. CSAT 42%. Privacy risk." },
  ]);
  const ledger = buildDeterministicEvidenceLedger(extractEvidenceCards(ctx), ctx);
  const result = resolveArtifactCitations("evidence-ledger.md", ledger, ["support/foo.md"]);

  assert.equal(result.unresolved.length, 0);
  assert.ok(result.resolved.length > 0);
});

test("evidence report records enrichment status and coverage", () => {
  const ctx = workspace([
    { relativePath: "support/foo.md", bytes: 90, content: "Customer escalation. CSAT 42%. Privacy risk." },
  ]);
  const report = buildEvidenceReport(extractEvidenceCards(ctx), {
    enabled: false,
    status: "disabled",
    detail: "off",
  }, ctx);

  assert.match(report, /# Evidence Report/);
  assert.match(report, /enrichment disabled/i);
});

test("mirrorRunToLatest excludes evidence-card intermediates but keeps evidence report", async () => {
  const runDir = await tempDir("run");
  const latestDir = await tempDir("latest");
  await fs.mkdir(path.join(runDir, "evidence-cards"));
  await fs.writeFile(path.join(runDir, "evidence-ledger.md"), "# Evidence\n");
  await fs.writeFile(path.join(runDir, "evidence-report.md"), "# Evidence Report\n");
  await fs.writeFile(path.join(runDir, "raw-output-evidence-card-a.md"), "# Raw\n");

  await mirrorRunToLatest(runDir, latestDir);

  assert.deepEqual((await fs.readdir(latestDir)).sort(), ["evidence-ledger.md", "evidence-report.md"]);
});
