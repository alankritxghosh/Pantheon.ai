# Customer Interview: Acme Co

Date: 2026-04-09
Participants: Priya N. (Director of Platform Engineering), Sam R. (Engineering Manager, Developer Experience), Mira P. (Conduit PM)

Acme Co has 185 engineers across platform, product infrastructure, and application teams. Priya described the team as "good at incident response, bad at slow cleanup." The work that falls through the cracks is not urgent enough for an incident channel and not strategic enough for quarterly planning. Examples include stale pull-request follow-ups, dependency migration nudges, flaky-test ownership, and support escalations that need an engineer to confirm impact.

Priya currently asks managers to maintain their own spreadsheets for this work. The spreadsheets are inconsistent and often stale by the second week. Sam built a small script that collects flaky-test failures from CI and posts them into a Slack channel, but nobody owns the channel. Engineers mute it because it feels like a stream, not a plan.

The phrase that came up repeatedly was "batch it for me." Priya does not want a new ticketing system. Acme already has Jira, GitHub, PagerDuty, and Slack. She wants Conduit to gather the operational residue from those systems, group it into a digest, and make ownership obvious enough that managers can run a 15-minute cleanup block each week.

Important quotes:

- "If I get one more dashboard, I will ignore it. I need a short list I can act on."
- "The owner inference matters more than the summary. If ownership is wrong, managers will not trust the digest."
- "I would rather have 12 good items every Friday than 90 technically complete items every day."
- "Our security team will ask how we export the history. We cannot put workflow data into a black box."

Buying process:

Priya can approve a small pilot under $10k annually. Anything above that needs procurement and security review. The security review will ask about repository permissions, data retention, audit logs, and export. Acme prefers tools that can start with read-only GitHub access. They will not grant source-code content access in the first trial.

Success criteria for a pilot:

1. Create a weekly review-debt digest for three repositories.
2. Keep the digest under 20 items.
3. Correctly infer an owner for at least 80% of items.
4. Show that managers resolve or defer at least half the items within seven days.
5. Export pilot history at the end of the trial.

Priya said she would not measure success by "more tasks found." She would measure it by fewer awkward follow-up meetings. The strongest willingness to pay is for reducing coordination drag, not for discovering every possible problem.

Follow-up notes:

Sam asked whether Conduit can avoid posting public blame into Slack. He wants the digest to make ownership visible without shaming individual engineers. The preferred behavior is to show the owner, the reason Conduit inferred ownership, and a low-friction "reassign" action. Priya said managers will accept imperfect owner inference if the product makes correction easy and learns from it.

The team also asked for a read-only trial mode. Their security reviewer is comfortable with metadata access for pull requests, checks, labels, and comments, but source-code contents require a separate review. A trial that proves the batching workflow without requesting code contents would shorten procurement by at least two weeks.

Mira's interpretation: Acme is not buying automation for its own sake. They are buying a calmer weekly operating rhythm. The system design should emphasize capped digests, transparent ownership inference, preview before scheduling, export, and auditability.
