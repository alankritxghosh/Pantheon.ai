# Opportunity Scorecard

> Status: Synthesize-mode ranking of candidate wedges from workspace evidence.
> TL;DR: The MCP-native synthesis layer wins on every dimension that matters this quarter and should
> ship first, with the cited research-synthesis blob format in the same release.

## Scoring criteria

Each opportunity is scored on six dimensions on a 0-10 scale. The final score is the average, rounded to one
decimal. Each row links to its strongest source-file citation. Anything unsourced is labelled as an
Assumption or an Evidence gap.

- Pain: how acutely the workspace evidence reports the underlying pain.
- Evidence: density of confirmed signals vs inferences in the workspace.
- Leverage: how much downstream work the opportunity unlocks if shipped.
- Feasibility: realistic given the team and current architecture.
- Risk: low-risk earns a high score.
- Why-now: how strong the timing signal is.

## Scored opportunities

The table below ranks six candidate wedges drawn from the workspace evidence. The winner is the
MCP-native synthesis layer because it scores highest on pain, evidence, leverage, and why-now without
sacrificing feasibility.

| Opportunity | Score | Strongest evidence | Rationale |
| --- | --- | --- | --- |
| MCP-native synthesis layer | 9.2 | [source: workspace/prd-notes.md] | Highest pain density and unblocks every other workflow. |
| Cited research synthesis from raw blobs | 8.7 | [source: workspace/interview-transcripts.md] | Wins on evidence and feasibility; modest risk. |
| Persistent product memory across runs | 7.6 | [source: workspace/decisions-log.md] | High leverage but feasibility drops once the memory schema lands. |
| Agent handoff to Cursor and Claude Code | 7.1 | [source: workspace/handoff-notes.md] | Bigger moat; lower why-now until the synthesis wedge lands. |
| Distribution loop via shared artifacts | 5.8 | [source: workspace/share-experiments.md] | Strong leverage, higher risk on security and privacy. |
| Folder-mode polish | 4.2 | [source: workspace/folder-friction.md] | Solves a workflow few PMs actually have. |

## Winner rationale

The MCP-native synthesis layer wins on every dimension that matters this quarter. It directly attacks the
"PMs do not have folders" objection that killed cold-tester retention, it reuses the existing MCP server,
and it unlocks the agent-handoff act that follows. The cited synthesis blob format is the closest second and
should ship as part of the same wedge rather than as a standalone follow-up.

- The winner ships first.
- The runner-up ships in the same release because it is the same code path.
- Persistent memory is queued for the next iteration once the wedge is validated.
- The CLI surface stays as the local-first option for the technical PM crowd.
- The MCP surface becomes the primary front door referenced in the README.

## Rejected alternatives

These alternatives were considered and explicitly rejected for this iteration. Each is logged here so the
decision is auditable in future runs.

- Building a hosted SaaS web app: too expensive, too long, fails the weekend-build constraint.
- Adding LangChain or LangGraph as an orchestration layer: adds dependency surface without solving the wedge.
- Direct API integrations to Slack, Linear, and Notion: defer to those tools' own MCPs.
- Folder-mode parser ecosystem (Granola, Gong file imports): deferred to a post-wedge iteration.
- Public sharing or distribution loop: defer until after the wedge is validated; security review required.
- UI work of any kind: defer until the MCP-native surface proves the wedge.
