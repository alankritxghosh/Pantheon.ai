# Tenets Revision: Northstar Grocery Delivery

## Problem Statement

Northstar's grocery delivery experience is reliable after checkout and confusing before checkout. The customer can usually receive a basket within the promised window, but they cannot easily understand why the basket changed, whether a substitution is likely, or which promise matters when an item has multiple constraints. The result is a service that performs operationally and still feels uncertain to a household planning dinner.

The issue is not a single screen defect. It is a mismatch between how the service reasons about inventory and how the customer reasons about a meal. The system optimizes for item availability, picker efficiency, and delivery-window utilization. The customer optimizes for whether the planned meal will work. A missing cilantro bunch, a delayed refrigerated item, or an unexpected larger size can each break the customer promise even when the order is technically delivered.

We need a revised set of product tenets that guides selection, substitution, and communication decisions across teams. These tenets should help product, operations, and catalog teams make the same tradeoff without escalating every edge case.

## Tenets

The first tenet is that the meal promise is larger than the item promise. When a customer buys a set of ingredients that commonly form a meal, the service should preserve the meal outcome where possible, even if that means recommending a different brand, package size, or delivery window. This does not mean guessing intent in unsafe ways. It means acknowledging that groceries are often purchased as connected plans rather than isolated SKUs.

The second tenet is that uncertainty should be surfaced before commitment. Customers tolerate change better when they understand the risk before checkout. If a store has volatile inventory for a category, the product should say so plainly. We should not hide uncertainty in order to increase conversion and then spend the trust later through substitutions.

The third tenet is that substitution authority belongs to the customer. The service may propose intelligent defaults, but it should make clear when the customer has approved a class of substitutions and when a picker is making a judgment call. This distinction matters because grocery preference can be personal, dietary, and cultural.

The fourth tenet is that operational elegance is not a customer-facing excuse. If a decision is made for picker routing, cold-chain handling, or batch density, the customer should experience it as a better promise, not as an unexplained constraint.

## Customer Experience

The customer starts with a basket for Tuesday dinner. As they add items, the service quietly identifies ingredients that are frequently purchased together and have high substitution sensitivity. The customer sees a simple note: "Two ingredients in this basket have changing availability today." The message appears before checkout, not after payment.

At checkout, the customer is offered three clear choices. They can accept close substitutions for all low-risk pantry items. They can require approval for fresh produce and allergy-sensitive items. They can choose a later delivery window with stronger inventory confidence. The interface does not require the customer to understand inventory systems. It translates system uncertainty into meal-level choices.

During picking, if an item becomes unavailable, the customer receives a message framed around the meal impact. Instead of "12 oz basil unavailable," the service says, "Basil for this dinner plan is unavailable; Thai basil is available, or we can remove the herb." This is more work for the system, but it respects the customer's intent.

After delivery, the receipt shows which substitutions were customer-approved, which were picker-proposed, and which items were removed. This creates an audit trail without making the experience feel legalistic.

## Working Backwards

Press release draft: Northstar today introduced meal-aware grocery promises, a clearer way for customers to understand and control substitutions before checkout. Instead of treating each grocery item as an isolated transaction, Northstar now identifies when baskets are likely to support a meal and explains availability risk in customer language.

The customer benefit is confidence. Families planning weeknight meals can decide whether to accept substitutions, move a delivery window, or adjust the basket while they still have choices. Pickers benefit because approved substitution rules are clearer. Operations benefits because fewer customers reject completed orders for reasons the system could have explained earlier.

The launch starts with dinner baskets in three metro areas and expands only after substitution rejection rates, customer-contact rates, and picker exception times improve together.

## FAQs

**Does this require the system to infer private intent?** No. The system uses basket patterns and customer-provided substitution rules. It does not label a customer or infer household attributes. The feature is about the current basket.

**Will this reduce conversion?** Some customers will choose a later window or remove volatile items before checkout. That is acceptable if it reduces post-checkout disappointment and support contacts. The goal is durable trust, not a brittle conversion lift.

**What happens when the system is wrong about a meal?** The customer never sees a hard classification. They see availability risk and substitution controls. If the basket is not a meal, the controls are still useful.

**How do we measure success?** We expect lower substitution rejection, fewer order-level refunds tied to missing ingredients, and fewer contacts that say the order was delivered but unusable.

## Appendix

Initial launch categories should include produce, dairy, dry pasta, sauces, fresh herbs, and refrigerated proteins. Excluded categories should include pharmacy, alcohol, and regulated items. The product should keep the copy short enough for checkout and detailed enough for the post-order audit trail. The review decision is whether these tenets become binding for the next two quarters of grocery delivery planning.
