# Conduit Stand-up Notes - 2026-04-12

Attendees: Mira Patel, Jon Bell, Casey Tran, Lina Howard, Omar Voss

Mira opened with the pattern from the last two weeks of onboarding calls: engineering managers like the idea of batching operational work, but they do not know what their first batch should be. They understand that Conduit can collect tasks from pull requests, flaky-test reports, migrations, and support escalations. The problem is that the blank setup screen asks them to design a workflow before they have seen one work.

Jon said the strongest moment in demos is still the Friday review-debt batch. When we show a manager that twelve stale PR comments can become one digest with owners and suggested next actions, the product clicks. When the same manager signs up alone later, they see filters, schedules, and routing rules first. We are showing the machinery before the job.

Casey shared three support tickets from trial teams that all said some version of "I connected GitHub but nothing happened." In each case, the workspace had access to enough repository data. The user simply never created a batch. The product treated connection as success; the customer treated a useful digest as success.

Lina noted that the digest quality has improved since the summarizer update. The issue is not output quality once a batch runs. The issue is getting to the first run. She suggested we create starter templates around specific pains: review debt, flaky tests, migration follow-up, and production support follow-up. Each template should include a default filter, owner inference rule, and digest schedule.

Omar raised a concern about noisy first runs. If the first digest includes 80 tasks, users may churn because Conduit feels like another backlog. The team agreed that templates should include caps and grouping rules. The review-debt template should start with at most 15 items, sorted by age and customer impact. The flaky-test template should group by test name and failing branch rather than sending every failure.

Decisions:

- Treat "first useful batch ran" as the activation event, not "connected GitHub."
- Build starter templates for four pains before adding more connector options.
- Add a first-run preview so users can see what the digest would contain before scheduling it.
- Instrument template selection, preview viewed, first run completed, and second run completed.

Metrics reviewed:

- Trial-to-first-batch conversion is 31% for workspaces that start from a sales-assisted setup and 12% for self-serve workspaces.
- Workspaces that complete a second scheduled run convert to paid at 38%, compared with 9% for workspaces that only run one manual batch.
- The median first digest currently contains 47 items. The team believes this is too high for a first experience.
- Owner corrections are common: 28% of first-run items receive "not mine" feedback when the customer uses owner review.

Mira asked whether the preview should be editable or read-only. Jon argued for editable because the preview is the first moment the manager understands the product. Casey pushed back that editing could turn onboarding into workflow design again. The tentative answer is to allow only two edits in v1: remove an item from the first run and change the digest channel. Everything else can wait until after the first successful run.

Open concerns:

- Whether templates should be role-specific. Managers and tech leads describe the pain differently.
- Whether we need a sample-data mode for teams that cannot connect GitHub during procurement.
- How much setup the user should complete before inviting teammates.
