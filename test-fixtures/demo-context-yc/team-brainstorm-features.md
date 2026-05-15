# Conduit Feature Brainstorm

## Activation

- Pain-first onboarding: ask what keeps slipping, then recommend a starter batch.
- Four starter templates: review debt, flaky tests, migration follow-up, support escalations.
- First-run preview with caps and grouping visible before scheduling.
- Sample-data mode for teams that cannot connect GitHub during procurement.
- Invite teammates after the first useful digest, not before.
- Activation metric: first useful batch ran, followed by second scheduled run.

## Batch Quality

- Cap initial digests at 15 to 20 items depending on template.
- Group flaky-test failures by test name, branch, and likely owner.
- Rank review-debt items by age, reviewer activity, and customer impact labels.
- Infer owner from codeowners, recent commit history, assignee, and last substantive commenter.
- Let managers mark ownership as wrong and use that feedback in future batches.
- Add "defer with reason" so unresolved work does not reappear unchanged every week.

## Trust and Admin Controls

- Read-only GitHub permission explanation in onboarding.
- Export workspace history as zipped CSV files.
- Audit events for exports, digest delivery, owner changes, and permission changes.
- Data retention settings for batch history.
- Clear statement that Conduit does not ingest source-code contents in the default trial mode.

## Collaboration

- Slack digest channel selection with a preview of the message.
- Per-batch watchers so tech leads can follow without owning.
- Manager handoff notes for items that need human context.
- Lightweight acknowledgement button: "will handle," "not mine," "defer."
- Weekly cleanup ritual template: 15-minute agenda generated from the digest.

## Pricing and Packaging

- Scenario-based pricing page with examples by team size.
- Usage calculator based on engineers, repositories, and weekly batch runs.
- Trial extension when a workspace has reached two activation signals.
- Business tier should include export, audit log, and priority incident handling.
- Starter tier should stay self-serve and avoid custom workflow promises.

## Risks

- If the first batch is too noisy, Conduit feels like a backlog generator.
- If owner inference is wrong, managers lose trust quickly.
- If export is missing, larger accounts may fail security review before seeing value.
- If onboarding asks for too much configuration, users will stop after connecting GitHub.
- If we over-index on dashboards, we compete with tools that already own executive reporting.

## Candidate MVP Shape

The narrowest credible MVP is one connector, four templates, one digest surface, and one export path. GitHub should be the first connector because review debt, flaky tests, and migration follow-up can all be demonstrated from GitHub metadata. Slack delivery matters, but Slack should be an output channel rather than a second source of truth in v1.

The first-batch flow should create confidence before it asks for commitment. Users pick a pain, see a preview, tune the cap, choose a Slack channel, and schedule the cadence. The product can suggest owner rules, but the manager should be able to correct them during preview. Corrections should become training data for the workspace.

The system should store enough history to explain why an item appeared in a digest. That means source pointer, detection rule, inferred owner, owner confidence, digest run id, and user actions. It does not mean storing raw source code or duplicating full third-party records.
