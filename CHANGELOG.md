# Changelog

All notable changes to Pantheon are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org).

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
