# Changelog

All notable changes to Pantheon are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org).

## [3.0.0] - 2026-05-16

### Added

- `pantheon_synthesize` MCP tool — primary entry point that accepts up to 200 raw evidence blobs (`{ name, content, source_type? }`) and returns ranked opportunities with citations resolved back to the original blob names. No folder organization required.
- Fixture LLM provider (`PANTHEON_PROVIDER=fixture`) that replays canned artifacts from `PANTHEON_FIXTURE_DIR`. Enables deterministic CI without an LLM running.
- `PipelineMode` ("full" | "synthesize") — the synthesize path runs only the 4 PM-wedge artifacts (evidence-ledger, product-vision, competitive-deconstruction, opportunity-scorecard).
- Citation round-tripping: evidence blobs written as `evidence-NNN-slug.md` are substituted back to the original human-readable names in returned markdown.
- GitHub Actions CI: typecheck + unit + E2E on Node 20 and 22 for both agent and mcp-server packages.
- 72 new tests covering scorecard parsing, citation round-trip, fixture pipeline, and MCP handler validation.

### Changed

- Repositions Pantheon from a folder-based CLI to an MCP-native reasoning layer. The folder workflow still works, but the primary surface area is now the MCP tool consumed by Claude Code and other MCP clients.
- Validator accepts a `requiredArtifacts` override so the synthesize path validates only its 4-artifact subset.
- Ollama integration moves from subprocess shelling to a direct HTTP client.

### Removed

- `nvidia-agent.ts` — unused provider integration removed as part of the v3 provider refactor.

## [2.0.0] - 2026-05-14

### Added

- `pantheon learn-style <dir>` ingests example docs to produce a StyleProfile at `.pantheon/style.json`.
- Style-aware generation: `pantheon run` detects `.pantheon/` and overrides section structure, voice, and length to match the learned style.
- Format-faithfulness validator: writes `style-report.md` scoring how well generated artifacts match the learned style.
- MCP server now exposes `learn-style` as a callable tool from Claude Code.
- Demo corpora for Amazon 6-pager, Google design-doc, and YC RFC styles, plus `DEMO.md` walkthrough script.

### Changed

- When a style profile is present, depth floors (`MIN_NON_EMPTY_LINES`, `MIN_HEADINGS`) are bypassed in favor of the learned format. Unstyled runs preserve v1 behavior.
- `workspace.ts` now supports `.markdown` files in addition to `.md`.

### Notes

- Pre-generated demo workspaces ship in `test-fixtures/demo-context-{amazon,google,yc}/` with their `.pantheon/` profiles already populated. Run `pantheon run` inside any of them for an instant demo.
