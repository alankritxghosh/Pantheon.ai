import fs from "fs";

const prompt = fs.readFileSync(process.argv[2], "utf8");
const filename = /filename="([^"]+)"/.exec(prompt)?.[1] ?? "artifact.md";
const sections = extractSections(prompt);
const content = renderArtifact(filename, sections);

process.stdout.write(`<<<PANTHEON_ARTIFACT filename="${filename}">>>\n${content}\n<<<END_PANTHEON_ARTIFACT>>>\n`);

function extractSections(value) {
  const match = /Required sections:\n([\s\S]*?)(?:\n\nValidation floor:|\n\nImportant content rules:)/.exec(value);
  if (!match) {
    return ["Readiness verdict", "Artifact scorecard", "Validation failures", "Evidence gaps", "Top fixes"];
  }
  return match[1]
    .split("\n")
    .map((line) => line.replace(/^-\s+/, "").trim())
    .filter(Boolean);
}

function renderArtifact(filename, sections) {
  if (filename === "decision-packet.md") {
    return `# Decision Packet

> Status: Test fixture output.

## Recommendation

Ship the style-aware generation preview.

## Why now

Confirmed: local context shows teams need company-specific formats.

## Why this wedge

The learned style profile reduces rewrite work.

## Top risks

Risk: style examples may be thin.

## Asks

Ask: review Phase 3 validation.

## Next decision

Decide whether format-faithfulness should block demo readiness.`;
  }

  const body = sections.map((section) => `## ${section}

- Confirmed: ${filename} uses the requested section ${section}.
- Inference: this test fixture keeps content deterministic.
- Assumption: production providers will add richer detail.
- Evidence gap: Phase 3 should validate style faithfulness.
- Data needed: compare generated output against learned examples.`).join("\n\n");

  return `# ${titleFor(filename)}

> Status: Test fixture output.
> TL;DR: This deterministic artifact is emitted by the Pantheon mock CLI.

${body}

## Style Source

- Style profile: .pantheon/style.json
- Examples: referenced by path in the style index
- Confirmed: artifact block parsing works in smoke tests
- Inference: section override reached the provider prompt
- Assumption: full LLM runs will preserve the same headings
- Evidence gap: Phase 3 should score voice and depth
- Data needed: real provider output under a capable model`;
}

function titleFor(filename) {
  return filename.replace(/\.md$/, "").split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}
