# RFC: Founder Review Mode

## Problem

Early startup teams write quickly and decide even faster. A founder may have a few customer notes, a rough positioning doc, and a half-written product spec. They still need a credible answer to basic questions: what are we building, why now, what could go wrong, and what evidence do we actually have? The current packet format is powerful, but it can feel heavier than the meeting needs.

The user wants a short RFC that keeps the team honest without slowing the conversation. We should keep the artifact direct, practical, and slightly opinionated. It should be clear where we know something, where we are guessing, and what decision the team needs to make this week.

## Proposal

Add a founder review mode that compresses the packet into a short RFC shape. The output should open with the problem, state the proposal, and list open questions. It may include lightweight bullets for scope, metrics, and risks when the source material supports them, but it should avoid enterprise ceremony.

The system should still cite local evidence. We can be concise without becoming vague. If a claim comes from a customer interview, point to the interview. If it is a strategy bet, mark it as an assumption. If the team lacks data, say what to collect next.

Example review flow:

```
+ context folder
+ pantheon run
+ short RFC
+ founder decision
```

## Open Questions

Should this mode be a separate command or a style profile learned from startup examples? The style-profile path seems better because it avoids adding one-off modes for every company culture.

How much validation should apply to a deliberately short artifact? The current depth checks are useful for full packets but may punish concise RFCs. Phase 3 should define a style-faithfulness validator that knows when short is intentional.
