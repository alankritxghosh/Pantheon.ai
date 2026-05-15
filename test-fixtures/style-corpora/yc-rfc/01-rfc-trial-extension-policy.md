# RFC: Trial Extension Policy

## Problem

We keep handling trial extensions as one-off Slack decisions. A founder asks for seven more days, an AE says yes, support updates Stripe manually, and then nobody knows whether the account is still a real opportunity or just stuck in limbo. The current pattern feels friendly in the moment, but it creates bad incentives for the team and confusing expectations for customers.

The bigger issue is that our trials are not all the same. Some teams genuinely need another week because their security reviewer is out. Others have not invited a second user or connected their first repository. We should not punish the first group, but we also should not keep extending accounts that have not shown intent.

## Proposal

We propose a simple policy: one self-serve seven-day extension when the workspace has reached two activation signals, and one manual extension after that only if the account owner writes a short reason in HubSpot. Activation signals are: invited at least two teammates, connected one production repo, created three task batches, or viewed the weekly digest twice.

The product should expose this as a quiet banner on day twelve of the trial. The copy should say that the team is eligible for seven more days because they have started using Conduit, not because we are discounting urgency. If the workspace is not eligible, the banner should point them to the two fastest activation steps instead of showing a dead end.

Support can still override for weird cases, but every override needs a reason code. We should review the reason codes after two weeks and decide whether any should become product rules.

## Open Questions

Should extensions reset the sales sequence timing, or should the sequence keep running?

Do we want the banner to appear for all admins, or only for the workspace creator?

If a customer converts during the extension window, should we attribute that to the original trial or the extension experiment?
