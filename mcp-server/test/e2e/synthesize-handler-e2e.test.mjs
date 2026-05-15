import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { handlePantheonSynthesize } from "../../dist/synthesize-handler.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const mcpRoot = path.resolve(here, "..", "..");
const agentRoot = path.resolve(mcpRoot, "..");
const AGENT_BIN = path.join(agentRoot, "dist", "index.js");
const FIXTURE_DIR = path.join(agentRoot, "test", "fixtures", "llm-recordings", "synthesize");

process.env.PANTHEON_MCP_BIN = AGENT_BIN;
process.env.PANTHEON_PROVIDER = "fixture";
process.env.PANTHEON_FIXTURE_DIR = FIXTURE_DIR;

test("pantheon_synthesize handler runs end-to-end with fixture provider", async () => {
  const result = await handlePantheonSynthesize({
    evidence: [
      {
        name: "customer-call-2026-05-10",
        content:
          "The customer said billing reconciliation across regions is the single most painful part of their weekly close. They lose two hours every Monday on it.",
        source_type: "granola",
      },
      {
        name: "linear-ticket-PROD-412",
        content:
          "Support escalation: enterprise customer needs a way to attribute revenue across child accounts. Currently they export and pivot in Excel.",
        source_type: "linear",
      },
      {
        name: "slack-thread-billing-pain",
        content:
          "Three different Slack threads this month complain about reconciliation. CSM team flags it as their #1 churn risk for Q3.",
        source_type: "slack",
      },
    ],
    top_n: 3,
  });

  assert.ok(result.run_id, "result missing run_id");
  assert.ok(result.workspace_dir, "result missing workspace_dir");
  assert.ok(Array.isArray(result.ranked_opportunities), "ranked_opportunities should be array");
  assert.equal(result.ranked_opportunities.length, 3, "expected top 3 opportunities");
  assert.equal(result.ranked_opportunities[0].rank, 1);
  assert.ok(result.evidence_ledger_markdown.length > 0, "evidence_ledger_markdown empty");
  assert.ok(result.opportunity_scorecard_markdown.length > 0, "opportunity_scorecard_markdown empty");
  assert.equal(result.validation_passed, true, "validation should pass on fixture run");

  // Citation round-tripping: the deterministic evidence ledger cites the on-disk
  // safe filenames. After round-tripping, the markdown surfaced to the agent must
  // reference the original blob names instead of the temp safe filenames.
  assert.match(
    result.evidence_ledger_markdown,
    /customer-call-2026-05-10/,
    "evidence_ledger_markdown should reference original blob name",
  );
  assert.doesNotMatch(
    result.evidence_ledger_markdown,
    /evidence-001-customer-call-2026-05-10\.md/,
    "evidence_ledger_markdown should not leak safe filenames after round-trip",
  );

  await rm(result.workspace_dir, { recursive: true, force: true });
});

test("pantheon_synthesize rejects evidence names with disallowed characters", async () => {
  await assert.rejects(
    handlePantheonSynthesize({
      evidence: [{ name: "../etc/passwd", content: "hostile" }],
      top_n: 1,
    }),
    /unsupported characters/,
  );
});

test("pantheon_synthesize accepts a single evidence blob and returns at least one ranked opportunity", async () => {
  const result = await handlePantheonSynthesize({
    evidence: [
      {
        name: "manual-note",
        content: "PMs we surveyed all said research synthesis is the slowest part of their week.",
      },
    ],
    top_n: 1,
  });
  assert.equal(result.ranked_opportunities.length, 1);
  await rm(result.workspace_dir, { recursive: true, force: true });
});
