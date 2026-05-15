# PR/FAQ: Customer Onboarding Redesign

## Problem Statement

Northstar Home Services has an onboarding problem disguised as a scheduling problem. New customers can book a technician quickly, but they often do not understand what information the technician needs, what the visit can resolve, or what happens if the home setup differs from the customer's description. The first visit then carries too much discovery work, and the customer experiences preventable reschedules as service unreliability.

The current onboarding flow asks for category, address, preferred time, and a short issue description. This is enough to reserve labor. It is not enough to prepare the visit. Customers are not experts in appliance models, wiring states, water shutoff locations, or access requirements. When we ask generic questions, they give generic answers, and the technician arrives with incomplete context.

This PR/FAQ uses a working-backwards frame: begin with a customer who gets the right technician on the first visit, then redesign each onboarding step around that outcome.

We should redesign onboarding around visit readiness rather than booking completion. The goal is to reduce failed first visits without making the customer feel interrogated.

## Tenets

The first tenet is that readiness beats speed when speed creates rework. A booking that fails on arrival is not fast from the customer's point of view. The product should spend an extra minute when that minute prevents a second appointment.

The second tenet is that the customer should not need trade vocabulary. We should ask for observable facts: photos, location, symptoms, and access constraints. We should avoid asking the customer to classify technical root cause.

The third tenet is that uncertainty should route the job, not blame the customer. If a customer cannot answer a question, the system should use that uncertainty to choose a technician, parts kit, or inspection slot. It should not block the customer with a quiz.

The fourth tenet is that technicians deserve context they can trust. Free-text descriptions are useful, but structured signals and images should be summarized into a clear pre-visit brief.

## Customer Experience

The customer starts by selecting the service category. Instead of moving immediately to time selection, the product asks three readiness questions tailored to the category. For a dishwasher issue, the customer is asked whether water is leaking now, whether the appliance has power, and whether they can upload a photo of the model label. Each question includes "not sure" as a valid answer.

The scheduling page then shows two appointment types when needed. A prepared repair visit is available when the customer provides enough information. A diagnostic visit is available when the situation is unclear. The customer sees the difference in price, likely duration, and chance of same-day resolution. This is more honest than selling every appointment as a repair visit.

Before the visit, the technician receives a brief written in operational language. It includes the customer description, images, access notes, likely parts, and uncertainty flags. The customer receives a simpler version that explains what to expect and what to prepare.

If the customer edits details before the visit, the system updates the brief and warns only when the change affects the appointment type. The product should treat onboarding as a living preparation step, not a one-time form.

## Working Backwards

Press release draft: Northstar Home Services is introducing readiness-based onboarding, a new booking experience that helps customers prepare successful first visits. The flow asks simple, observable questions, supports photos, and matches customers to the right appointment type before a technician arrives.

The customer benefit is fewer surprises. A customer with a straightforward repair can book confidently. A customer with an unclear issue can choose a diagnostic visit without feeling like the service failed later. Technicians benefit from better pre-visit context and fewer avoidable reschedules.

The redesign should start with appliance repair and expand only after first-visit resolution improves without reducing booking completion among high-intent customers.

## FAQs

**Will additional questions reduce conversion?** Some drop-off is possible. The relevant question is whether completed bookings become more successful. We should measure first-visit resolution, reschedule rate, technician idle time, and customer contact rate together.

**Why not let technicians call customers before the visit?** Calls help but do not scale reliably and often happen too late. Structured onboarding gives both sides a written record.

**What if customers upload poor photos?** The system should accept imperfect photos and let technicians flag unusable images. The first version should not require computer vision quality gates.

**Does this change pricing?** It clarifies appointment type. Pricing changes should be explicit and tied to the distinction between diagnostic and prepared repair visits.

## Appendix

Pilot categories should be dishwasher, refrigerator, washer, dryer, and water-heater support. Excluded categories should include emergency plumbing and safety-critical electrical work because those have separate escalation paths. The decision for this review is whether to optimize onboarding for visit readiness even if the form becomes slightly longer.
