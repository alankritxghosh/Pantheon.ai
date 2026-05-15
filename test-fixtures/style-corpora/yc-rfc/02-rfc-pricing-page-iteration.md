# RFC: Pricing Page Iteration

## Problem

We are getting the same pricing question from almost every inbound lead: "Do task batches count by user, by repo, or by run?" The page says "usage-based," which is technically true and practically useless. People are not objecting to the price yet. They are objecting to not knowing what the price means.

This is especially painful for teams with bursty usage. They imagine a bad week of flaky CI turning into a surprise invoice. That fear is reasonable. We built Conduit to make messy work queues feel controlled, then our pricing page introduces a new uncontrolled queue in the buyer's head.

## Proposal

We propose changing the pricing page from plan-first to scenario-first. The top of the page should show three examples: "10 engineers clearing review follow-ups," "40 engineers batching flaky-test triage," and "120 engineers managing migration work." Each example should include expected monthly batches, expected cost, and the point where we recommend talking to sales.

The plans can still exist below the fold, but they should support the scenario, not lead it. We should also add a usage calculator with three fields: engineers, repositories, and weekly batch runs. It does not need to be perfect; it needs to make the pricing model legible.

We should avoid discount language for now. The goal is clarity, not cheaper positioning. If clear pricing reduces demo requests from tiny accounts, that is probably good.

## Open Questions

Do we include overage language on the first version, or wait until someone asks?

Should the calculator output a range or a single number?

What is the smallest account size where we still want a sales conversation?
