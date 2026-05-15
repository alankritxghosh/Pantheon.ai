# RFC: Self-Serve Onboarding Flow

## Problem

New workspaces can sign up without talking to us, but they still behave like they are waiting for a human kickoff. The first session usually ends after connecting GitHub. The second session often never happens. When we watch FullStory, the pattern is clear: users understand the product category, but they do not know which batch to create first.

We have been solving this manually in onboarding calls by asking, "What task keeps slipping every Friday?" That question works. The product should ask it too.

## Proposal

We propose replacing the generic setup checklist with a three-step first-batch flow. Step one asks the user to choose a pain: review debt, flaky tests, migration follow-up, or support escalations. Step two recommends a template with editable filters. Step three creates the first batch and schedules the first digest.

The flow should look like this:

```text
choose pain -> tune template -> schedule digest
```

We should keep GitHub connection early, but not as the hero task. The hero task is creating a useful batch. If GitHub is not connected yet, the selected template can explain why it needs repo access in context.

Success for this version is not "completed onboarding." Success is "created one batch that runs at least once." That is the behavior correlated with teams coming back.

## Open Questions

Should users be able to skip the pain choice and start from a blank batch?

Do we need different templates for engineering managers versus individual contributors?

How much sample data should we show before GitHub is connected?
