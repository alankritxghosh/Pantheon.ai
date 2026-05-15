import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PantheonSynthesizeInput,
  roundTripCitations,
  slugify,
} from "../dist/synthesize-handler.js";

test("slugify lowercases and replaces non-alphanumerics with single hyphens", () => {
  assert.equal(slugify("Granola Call 2026-05-12"), "granola-call-2026-05-12");
  assert.equal(slugify("Linear-PROD/412"), "linear-prod-412");
  assert.equal(slugify("  spaced  out  "), "spaced-out");
});

test("slugify falls back to 'blob' when name has no alphanumerics", () => {
  assert.equal(slugify("___"), "blob");
  assert.equal(slugify("///"), "blob");
});

test("slugify clamps slugs to 60 characters", () => {
  const long = "x".repeat(200);
  assert.ok(slugify(long).length <= 60);
});

test("roundTripCitations substitutes longest safe filenames first to avoid stomps", () => {
  const mappings = [
    { blobName: "linear-PROD-412", safeFilename: "evidence-001-linear-prod-412.md", sourceType: "linear" },
    { blobName: "linear-PROD-4", safeFilename: "evidence-002-linear-prod-4.md", sourceType: "linear" },
  ];
  const md = "Cited [source: evidence-001-linear-prod-412.md] and [source: evidence-002-linear-prod-4.md].";
  const result = roundTripCitations(md, mappings);
  assert.match(result, /\[source: linear-PROD-412\]/);
  assert.match(result, /\[source: linear-PROD-4\]/);
  assert.doesNotMatch(result, /evidence-001/);
  assert.doesNotMatch(result, /evidence-002/);
});

test("roundTripCitations handles multiple occurrences of the same filename", () => {
  const mappings = [
    { blobName: "granola-2026-05-12", safeFilename: "evidence-001-granola-2026-05-12.md", sourceType: "granola" },
  ];
  const md = "First [source: evidence-001-granola-2026-05-12.md] then again [source: evidence-001-granola-2026-05-12.md].";
  const result = roundTripCitations(md, mappings);
  const matches = result.match(/granola-2026-05-12/g) ?? [];
  assert.equal(matches.length, 2);
});

test("roundTripCitations returns empty string unchanged", () => {
  assert.equal(roundTripCitations("", []), "");
});

test("roundTripCitations leaves non-citation text untouched", () => {
  const md = "Plain text with no citations whatsoever.";
  assert.equal(roundTripCitations(md, []), md);
});

test("PantheonSynthesizeInput rejects empty evidence array", () => {
  const parsed = PantheonSynthesizeInput.safeParse({ evidence: [] });
  assert.equal(parsed.success, false);
});

test("PantheonSynthesizeInput rejects more than 200 evidence blobs", () => {
  const big = Array.from({ length: 201 }, (_, i) => ({ name: `e${i}`, content: "x" }));
  const parsed = PantheonSynthesizeInput.safeParse({ evidence: big });
  assert.equal(parsed.success, false);
});

test("PantheonSynthesizeInput defaults top_n to 3", () => {
  const parsed = PantheonSynthesizeInput.parse({
    evidence: [{ name: "a", content: "hello" }],
  });
  assert.equal(parsed.top_n, 3);
});

test("PantheonSynthesizeInput rejects top_n outside 1..10", () => {
  const tooBig = PantheonSynthesizeInput.safeParse({
    evidence: [{ name: "a", content: "x" }],
    top_n: 11,
  });
  assert.equal(tooBig.success, false);
  const tooSmall = PantheonSynthesizeInput.safeParse({
    evidence: [{ name: "a", content: "x" }],
    top_n: 0,
  });
  assert.equal(tooSmall.success, false);
});

test("PantheonSynthesizeInput accepts optional source_type and workspace_id", () => {
  const parsed = PantheonSynthesizeInput.parse({
    evidence: [{ name: "a", content: "x", source_type: "granola" }],
    workspace_id: "team-orbit",
    top_n: 5,
  });
  assert.equal(parsed.evidence[0].source_type, "granola");
  assert.equal(parsed.workspace_id, "team-orbit");
  assert.equal(parsed.top_n, 5);
});

test("PantheonSynthesizeInput rejects empty content", () => {
  const parsed = PantheonSynthesizeInput.safeParse({
    evidence: [{ name: "a", content: "" }],
  });
  assert.equal(parsed.success, false);
});
