# Competitive Deconstruction

> Status: Synthesize-mode comparison of practical alternatives observed in the workspace.
> TL;DR: Six categories of alternative exist today, none of which combine citations, persistent context,
> and an MCP-native surface. That gap is the wedge.

## Alternatives

The workspace evidence points at six categories of practical alternative that PMs already reach for when they
need to make a prioritization call. Each one solves part of the job and fails in a different way. The
synthesis wedge has to do better than the part each one does well, while removing the failure mode that keeps
the PM coming back to manual work.

- **ChatGPT or Claude in a browser tab.** Strong at drafting from pasted context, weak at remembering anything
  across sessions, no citations, no persistent workspace. Inference from workspace notes.
  [source: workspace/team-brainstorm-features.md]
- **Dovetail.** Strong at qualitative tagging, weak at translating tags into prioritized decisions.
  Public signal: market positioning.
- **Productboard, Aha, and Linear.** Strong at roadmap management, weak at the upstream synthesis step.
  Confirmed from workspace tooling references.
- **The PM's own spreadsheet.** Strong on flexibility, weak on rigor and zero reusability across cycles.
  Inference from interview snippets.
- **Internal Cursor-for-PM homegrown scripts.** Public signal: an SDE in the workspace built one for
  themselves before trying Pantheon, which is itself a market signal.
- **ChatPRD and similar PRD generators.** Strong at first-draft documents, weak at evidence and persistence.
  Inference from public coverage.

### Operational implications

The market is already moving toward synthesis-layer products. What is missing is one that cites evidence
back to source, runs alongside the tools where context lives, and outputs something agent-executable.

- Implication 1: Citations are the trust unlock. A non-cited ranking will lose to even a manual spreadsheet.
- Implication 2: The MCP-native surface is a moat. It removes the "organize a folder" friction every
  alternative still imposes on the PM.
- Implication 3: Speed matters. A run over five minutes loses to the spreadsheet because the PM gives up.

### Strategic implications

These implications shape what the synthesis wedge must do at launch, not later.

- Implication 4: The handoff to coding agents (Cursor, Claude Code) is the second-act story.
  The first act is earning trust on the ranking.
- Implication 5: The wedge has to be fast enough that a PM will run it weekly. Once weekly cadence sticks,
  the persistent-memory phase compounds.
- Implication 6: Defer parser ecosystems (Granola, Gong, Slack file imports) until after the wedge is
  validated. Other MCPs do that gathering, Pantheon does the synthesis.

## Implications

- Evidence gap: We do not yet have a confirmed adoption signal from a PM who switched away from one of the
  alternatives above. Treat that as the first thing to test in the next cohort.
- Why now: The MCP standard makes the cross-tool surface affordable for the first time.
