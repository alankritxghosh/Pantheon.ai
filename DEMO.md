# Pantheon v2 Demo Script (target: 3 minutes)

## What this demo proves

- The same messy product context can generate artifacts in three different team formats.
- Pantheon learns structure, voice, length, diagrams, and code-block conventions from existing docs.
- Styled runs produce a faithfulness report that shows where the output matched the learned format and where it drifted.

## Setup (one-time, off-camera)

Install the CLI from the repo or use `npm link` while pre-publish. The demo workspaces already include pre-generated `.pantheon/` profiles, so `pantheon run` works immediately. Beat 2 still demos `learn-style` to show how users create profiles for their own teams.

```bash
git clone <repo>
cd Pantheon.ai/agent
npm install -g .
# Alternative during pre-publish:
# npm link
```

If you want the recording to show only three commands, do the setup above off-camera, then start the recording from `Pantheon.ai/agent`.

## Recording sequence (talking points + exact commands)

### Beat 1 (0:00-0:20) - The problem

Talking point:

"Pantheon already produces grounded product artifacts, but real companies do not all write in the same format. Amazon-style narratives, Google-style design docs, and startup RFCs each carry different expectations."

### Beat 2 (0:20-0:50) - learn-style on Amazon corpus

Command:

```bash
cd test-fixtures/demo-context-amazon
pantheon learn-style ../style-corpora/amazon-6pager
```

Talking points:

- "Drop in 4 of your team's existing 6-pagers."
- "Pantheon learns the structure, voice, length, and formatting conventions."
- "The human-readable style profile lives in `.pantheon/style.json`; the vector index stays separate."
- "The repo also ships pre-generated profiles, so viewers can skip this step and run the demo instantly."

Expected output on screen:

```text
[pantheon] learn-style: scanning /Users/alankritghosh/Pantheon.ai/agent/test-fixtures/style-corpora/amazon-6pager
[pantheon] learn-style: found 4 sample files
[pantheon] learn-style: 01-tenets-revision-grocery-delivery.md -> product-vision
[pantheon] learn-style: 02-prfaq-warehouse-robotics-tier.md -> product-vision
[pantheon] learn-style: 03-business-review-q3-pantry-restock.md -> product-vision
[pantheon] learn-style: 04-narrative-customer-onboarding-redesign.md -> product-vision
[pantheon] learn-style: wrote .../test-fixtures/demo-context-amazon/.pantheon/style.json
[pantheon] learn-style: embedding 4 examples...
[pantheon] learn-style: wrote .../test-fixtures/demo-context-amazon/.pantheon/style-index.json
[pantheon] learn-style: learned 1 artifact style
```

Show `.pantheon/style.json` briefly. Point at the section list:

```text
Problem Statement, Tenets, Customer Experience, Working Backwards, FAQs, Appendix
```

### Beat 3 (0:50-1:40) - pantheon run on same context, three styles

Commands:

```bash
pantheon run
cd ../demo-context-google && pantheon run
cd ../demo-context-yc && pantheon run
```

Talking points:

- "Same context. Same product. Three different teams' conventions."
- "The Amazon run uses the 6-pager section structure."
- "The Google run uses Background, Goals, Non-Goals, Overview, Detailed Design, Alternatives Considered."
- "The YC run is intentionally short: Problem, Proposal, Open Questions."

Suggested files to show:

```text
test-fixtures/demo-context-amazon/pantheon-output/<latest>/system-design.md
test-fixtures/demo-context-google/pantheon-output/<latest>/system-design.md
test-fixtures/demo-context-yc/pantheon-output/<latest>/prd-v1.md
```

### Beat 4 (1:40-2:30) - The faithfulness report

Open one styled run's `style-report.md`.

Talking points:

- "Pantheon does not claim 100%. It tells you exactly where it did not match."
- "Section structure can be perfect while length or voice still drifts."
- "That is the point: the tool gives you an audit trail instead of a vibe check."

Expected shape on screen:

```text
# Style Faithfulness Report

Overall: 88%

| Artifact | Overall | Structure | Length | Voice | Issues |
| --- | --- | --- | --- | --- | --- |
| system-design.md | 89% | 100% | 86% | 82% | 2 |
```

### Beat 5 (2:30-3:00) - Close

Talking point:

"Pantheon v2 lets you bring your own team's docs, learn the house style, generate grounded artifacts from messy context, and see exactly how faithful the result was. Try it on your own artifacts and send feedback on GitHub."

## What to NOT do during the recording

- Don't mention the mock CLI verification used in dev.
- Don't show the `.pantheon/style-index.json`; it is machine-generated and vector-heavy.
- Don't apologize for imperfect scores; reframe them as the feature.
- Don't run more than 3 commands on screen; everything else is pre-staged.
