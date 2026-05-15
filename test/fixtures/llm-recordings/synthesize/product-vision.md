# Product Vision

> Status: Synthesize-mode product vision generated from workspace evidence.
> TL;DR: An evidence-cited synthesis layer that runs alongside the PM's existing tools and turns clutter
> into a ranked, cited shortlist in under three minutes per run.

## Thesis

The workspace evidence shows a recurring signal: PMs spend hours hunting through customer-call notes,
support tickets, and analytics dashboards before they can make any prioritization decision. That archaeology
work is repetitive, low-leverage, and the most fatiguing part of every planning cycle. The thesis is that an
evidence-cited synthesis layer, sitting alongside the tools where context already lives, can collapse that
work from hours to minutes without forcing a folder workflow.

- Confirmed: workspace files include multiple references to manual research synthesis as the slowest step.
  [source: workspace/prd-notes.md]
- Inference: A trustworthy ranking with cited claims will be adopted faster than a generator that produces
  longer documents nobody trusts.
- Assumption: Operators will tolerate a 60-180 second wait if the output cites every claim back to a source.
- Evidence gap: We have no direct confirmation that PMs will run this weekly rather than once.

## ICP

The primary ICP is the senior product manager at a 20-200 person SaaS company who already runs a weekly
prioritization ritual and currently does it manually. They are technical enough to install an MCP server and
opinionated enough to want the agent to show evidence.

- Secondary ICP: Founding PM at an early-stage company who is the only person doing this work.
- Tertiary ICP: Staff or principal PM at a larger org who runs weekly opportunity reviews for their pod.
- Anti-ICP: Enterprise PM whose tooling is locked by procurement and cannot install new clients.
- Activation moment: The first ranked opportunity that cites a specific quote they recognize from a recent call.
- Inference: Vertical-specific PMs (fintech, healthtech) will only adopt if local-first stays the default.

## Wedge

The wedge is research-synthesis-to-ranked-opportunity. Drop in raw evidence from any source. Get back a
ranked, cited shortlist of what to consider next, in under three minutes, with no folder organization
required. The wedge ships as both a CLI and an MCP-native tool so the PM can use whichever surface fits.

- Why this wedge: It is the most painful manual step in the prioritization ritual.
- Why it earns the rest: Once a PM trusts the ranking, the same product can carry them into PRD drafting,
  system-design hand-off, eval planning, and launch sequencing.
- Evidence gap: We have not yet validated whether teams will accept the ranking when it disagrees with a
  strong stakeholder opinion. That is the single biggest open assumption.
- Differentiation: The cited evidence trail is the moat. Every alternative loses on that single axis.
- Non-direction: We are deliberately not shipping a hosted SaaS web app, a chat UI, or a Notion clone in
  this wedge. Those expand the surface area before the wedge is validated.
