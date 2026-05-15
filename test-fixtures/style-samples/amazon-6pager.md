# Working Backwards Six-Pager: Team Context Memory

## Problem Statement

Enterprise product teams lose decision context because the evidence behind a launch is scattered across research notes, support tickets, Slack threads, and review docs. The immediate pain is not that teams lack documents. It is that teams cannot tell which claims are grounded, which claims are assumptions, and which claims were copied forward because they sounded plausible in the last planning cycle. We see the effect most clearly during system design review: engineers ask for sources, PMs hunt through folders, and leadership waits for a cleaned-up narrative before making a call.

The customer is a senior product owner preparing a review for a cross-functional audience. They need to assemble a credible packet in hours, not days. They do not want a blank template or a generic consultant voice. They want a document that follows their team conventions, preserves nuance, and makes uncertainty explicit.

## Tenets

We start from customer trust. Every generated claim should point back to a source or declare that it is an inference. We optimize for review usefulness over document beauty. A plain but grounded artifact beats a polished artifact that cannot survive a skeptical question. We keep local-first operation as the default because many customers will not upload internal context to hosted services.

We also preserve human ownership. The system may draft, classify, and structure the packet, but the customer remains the decision maker. If the evidence is thin, the output should make that visible rather than fill the gap with confident prose. We prefer deterministic checks where possible and model judgment only where the value is clearly higher than a rule.

## Customer Experience

The PM drops a folder of product notes into a workspace and runs one command. The tool scans supported files, builds an evidence inventory, generates the packet, and writes Markdown artifacts into a predictable output folder. The PM opens the system design first, sees the architecture, tradeoffs, source references, and open questions, then decides whether the packet is ready for review.

For style learning, the PM provides three to ten prior docs from the team. The tool reads headings, depth, voice, and format conventions, then saves a local style profile. On later runs, the packet should resemble the team's existing documents. The customer should feel that the tool learned the house style without requiring them to configure a taxonomy by hand.

## Working Backwards

Press release draft: Today we are launching a local style ingestion preview for Pantheon, helping teams generate product and system design artifacts in their own company format. Customers can point Pantheon at examples of prior PRDs, design docs, and RFCs. Pantheon extracts the common section structure, tone, diagram conventions, and document depth, then stores a hand-editable profile under `.pantheon/style.json`.

The most important customer benefit is reduced translation work. A senior PM should not need to rewrite a generated system design from a generic template into an Amazon six-pager, a Google design doc, or a startup RFC. The preview does not change the generation pipeline yet. It creates the profile that later phases will use.

## FAQs

**Why not ask the model to infer style during every run?** Repeating style inference during generation is slower, less inspectable, and harder to debug. A saved profile gives users a concrete artifact they can review, edit, and commit if they choose.

**What happens when examples disagree?** The preview groups examples by artifact type and aggregates common structure. If the examples do not share enough headings, it keeps the most representative section list instead of inventing a blended document.

**Does this require embeddings?** Not in the preview. Embeddings are useful when retrieving the best examples at generation time, but the first step is deterministic extraction.

## Appendix

Risks include misclassification, shallow examples, and teams with multiple document families under the same filename convention. We mitigate the first risk with simple filename and content markers. We mitigate the second by surfacing averages in the profile so users can see when the learned style is based on thin samples. We leave richer retrieval and prompt integration for the next phase.
