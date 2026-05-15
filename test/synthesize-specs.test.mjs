import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ARTIFACT_SPECS,
  filterSpecsForMode,
  SYNTHESIZE_ARTIFACTS,
  specForMode,
} from "../dist/artifacts.js";

test("SYNTHESIZE_ARTIFACTS contains exactly the four-artifact subset", () => {
  assert.deepEqual(SYNTHESIZE_ARTIFACTS, [
    "evidence-ledger.md",
    "product-vision.md",
    "competitive-deconstruction.md",
    "opportunity-scorecard.md",
  ]);
});

test("filterSpecsForMode('full') returns all standard specs unchanged", () => {
  const filtered = filterSpecsForMode([...ARTIFACT_SPECS], "full");
  assert.equal(filtered.length, ARTIFACT_SPECS.length);
});

test("filterSpecsForMode('synthesize') returns exactly four specs in topological order", () => {
  const filtered = filterSpecsForMode([...ARTIFACT_SPECS], "synthesize");
  assert.equal(filtered.length, 4);
  const names = filtered.map((spec) => spec.filename);
  assert.deepEqual(names, SYNTHESIZE_ARTIFACTS);
});

test("filterSpecsForMode('synthesize') applies slim requiredSections for product-vision", () => {
  const filtered = filterSpecsForMode([...ARTIFACT_SPECS], "synthesize");
  const vision = filtered.find((spec) => spec.filename === "product-vision.md");
  assert.ok(vision);
  assert.deepEqual(vision.requiredSections, ["Thesis", "ICP", "Wedge"]);
});

test("filterSpecsForMode('synthesize') applies slim requiredSections for competitive-deconstruction", () => {
  const filtered = filterSpecsForMode([...ARTIFACT_SPECS], "synthesize");
  const comp = filtered.find((spec) => spec.filename === "competitive-deconstruction.md");
  assert.ok(comp);
  assert.deepEqual(comp.requiredSections, ["Alternatives", "Implications"]);
});

test("filterSpecsForMode('synthesize') keeps opportunity-scorecard full-section list", () => {
  const filtered = filterSpecsForMode([...ARTIFACT_SPECS], "synthesize");
  const scorecard = filtered.find((spec) => spec.filename === "opportunity-scorecard.md");
  assert.ok(scorecard);
  assert.ok(scorecard.requiredSections.length >= 4);
});

test("specForMode('full') returns the original spec untouched", () => {
  const original = ARTIFACT_SPECS.find((spec) => spec.filename === "product-vision.md");
  const mapped = specForMode(original, "full");
  assert.deepEqual(mapped.requiredSections, original.requiredSections);
});

test("specForMode('synthesize') with no synthesizeMode override returns identical spec", () => {
  const evidenceSpec = ARTIFACT_SPECS.find((spec) => spec.filename === "evidence-ledger.md");
  const mapped = specForMode(evidenceSpec, "synthesize");
  assert.deepEqual(mapped.requiredSections, evidenceSpec.requiredSections);
});
