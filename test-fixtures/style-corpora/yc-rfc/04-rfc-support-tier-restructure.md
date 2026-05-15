# RFC: Support Tier Restructure

## Problem

Our current support promise is "we are responsive," which worked when the team was small and every customer knew us personally. It does not scale. Customers on the starter plan sometimes get same-hour help because someone sees the message. Larger accounts sometimes wait because the issue lands in the wrong channel. That feels generous but random.

We also use support time as a hidden discount. A team paying $79 can consume three hours of migration help if they are loud enough. That is not their fault; we trained them that this is available.

## Proposal

We propose three support tiers tied to plan level. Starter gets email support with a two-business-day target. Team gets in-app support with one-business-day target and access to setup office hours. Business gets a shared Slack channel, quarterly workflow review, and priority incident handling.

This should be positioned as clarity, not a downgrade. The copy should say exactly what each team can expect. Existing customers keep their current channel for 60 days, then move to the tier that matches their plan unless sales grants an exception.

We should also create an internal escalation rule: any issue blocking a scheduled batch for more than four hours can bypass tiering. If Conduit is failing at the core job, we fix that first.

## Open Questions

Do we grandfather current Slack channels for annual customers until renewal?

Who owns office hours: support, success, or rotating product engineers?

Should priority incident handling include weekend coverage, or is that a separate enterprise add-on?
