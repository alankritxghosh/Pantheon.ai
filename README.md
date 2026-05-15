# Pantheon

**The folder is the prompt.**

Pantheon is an open-source, local-first product intelligence CLI that turns a messy folder of product context into a complete, rigorous product packet — PRD, system design, competitive analysis, eval plan, launch plan, decision packet, and more — with every claim traced back to a specific file in your workspace.

No forms. No chat interface. No copy-pasting context into a box. You `cd` into your folder and run one command.

```bash
cd ~/my-product-context
pantheon run
```

Pantheon first extracts deterministic evidence cards from your files, then synthesizes the product packet from that evidence layer. Thirteen structured Markdown artifacts land in `pantheon-output/latest/`. Every assertion cites its source file. Anything the model cannot ground in evidence is explicitly labelled as an `Assumption` or `Evidence gap` — not silently hallucinated.

Runs entirely locally via [Ollama](https://ollama.com). No data leaves your machine. No API key required by default. Works offline once the model is pulled.

---

## Prerequisites

- Node.js 20+
- [Ollama](https://ollama.com) installed and running locally for the default private/local workflow
- Pull the style embedding model: `ollama pull nomic-embed-text`
- Pull at least one generation model: `ollama pull llama3.2`
- Or set an API key for a remote provider: `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`

Run `pantheon doctor` after install to verify your setup is ready.

## What's new in v2

Pantheon can now learn the shape of your team's existing docs and use that style during generation. Run `pantheon learn-style <dir>` with a folder of Markdown or text examples, optionally adding `--company "Your Company"`, and Pantheon writes a hand-editable `.pantheon/style.json` profile plus a regenerable `.pantheon/style-index.json` vector index.

Styled runs detect `.pantheon/`, retrieve the nearest examples for each artifact, and override Pantheon's default section structure with the learned format. That means the same context can generate as an Amazon-style 6-pager, a Google-style design doc, or a short YC-style RFC.

Styled runs also write `style-report.md` beside the generated artifacts, scoring how closely each artifact matched the learned section structure, length, voice, diagrams, and code-block conventions. See [`DEMO.md`](./DEMO.md) for a 3-minute walkthrough and [`CHANGELOG.md`](./CHANGELOG.md) for the v2.0.0 release notes.

## Quickstart (no setup, see Pantheon in action)

The repo includes pre-generated demo workspaces with `.pantheon/` profiles already populated. After installing the CLI, run:

```bash
cd test-fixtures/demo-context-google
pantheon run
```

Try `test-fixtures/demo-context-amazon` or `test-fixtures/demo-context-yc` to see the same Conduit context generated in different house styles.

---

## Why this exists

Senior PMs spend a disproportionate amount of time on archaeology — hunting through Gong recordings, Slack threads, support tickets, and meeting notes just to find the evidence to back up decisions they've already made intuitively. It is the least-leveraged work a senior PM does and the most time-consuming part of every planning cycle.

Existing AI tools make this worse, not better. They generate beautiful-looking documents nobody trusts because nothing is sourced. Engineers push back. Executives ask "where does this come from?" The PM goes back and does the archaeology manually anyway.

Pantheon's answer: force the model to cite every claim to a specific file in your workspace. Label anything it cannot source as `Inference`, `Assumption`, or `Evidence gap` — explicitly, structurally, every time. The folder is the evidence base. The artifacts are the synthesis.

---

## What it produces

One `pantheon run` generates the following 13 artifacts:

| Artifact | What it is |
| --- | --- |
| `evidence-ledger.md` | Every piece of evidence from your workspace, labelled: Confirmed / Public signal / Inference / Assumption / Evidence gap |
| `product-vision.md` | Thesis, ICP, wedge, why-now, differentiation, product principles, and what you refuse to build |
| `user-personas-jtbd.md` | 3+ personas with triggers, pains, current workarounds, adoption blockers, and JTBD statements |
| `competitive-deconstruction.md` | 5+ competitor/alternative categories with strengths, weaknesses, and implications |
| `opportunity-scorecard.md` | 5–7 wedges scored across pain, evidence, leverage, feasibility, risk, and why-now |
| `prd-v1.md` | Problem, user stories, scope, non-goals, success metrics, counter-metrics, RAI/privacy constraints |
| `system-design.md` | Architecture, model layer, data flow, privacy, observability, failure modes, rejected alternatives |
| `evals.md` | Golden set, rubric, judge, regression bars, adversarial suite, ship gates |
| `roadmap.md` | 4+ phases with goals, dependencies, risks, exit criteria, and deferred scope |
| `launch-plan.md` | ICP, beta cohort, activation flow, pricing hypothesis, distribution, rollback triggers |
| `risk-review.md` | Product, technical, data/privacy, RAI, GTM, competitive, and operational risks |
| `decision-packet.md` | One-screen leadership summary — recommendation, risks, asks, next decision. Under 500 words. |
| `quality-report.md` | Self-review of the packet: readiness score, evidence strength, validation failures, top fixes |

Each artifact is a real Markdown document with a `> Status:` header and a TL;DR. Not an outline. Not a template with blanks. The actual content, at depth, every time.

---

## Compatibility

| Platform | Support |
| --- | --- |
| macOS (Apple Silicon) | ✅ Full support. M-series Macs with 16GB+ unified memory run the default model (Qwen 2.5 14B) smoothly. |
| macOS (Intel) | ✅ Supported. 16GB+ RAM recommended for the default model. |
| Linux (x86_64) | ✅ Full support. Ubuntu 20.04+, Debian 11+, Fedora 36+, and any distro with Node.js 20+ and Ollama support. |
| Linux (ARM64) | ✅ Supported on ARM64 Linux (e.g. AWS Graviton, Raspberry Pi 5). |
| Windows 10/11 | ✅ Supported via WSL2 (recommended) or native with Ollama for Windows. |
| Windows (native) | ⚠️ Works but WSL2 gives better Ollama performance and shell compatibility. |

**Node.js version:** 20 or higher required.

---

## Detailed local setup

### 1. Node.js 20+

```bash
# Check your version
node --version   # should print v20.x.x or higher

# Install via nvm (recommended)
nvm install 20 && nvm use 20

# Or download from https://nodejs.org
```

### 2. Ollama

Ollama is the local model runtime Pantheon uses by default. Install it once, start the daemon, and pull the models you want to use.

**macOS**
```bash
brew install ollama
ollama serve   # start the daemon (keep this running in a separate terminal)
```

**Linux**
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama serve
```

**Windows**
Download and run the installer from [https://ollama.com/download](https://ollama.com/download). The installer starts the daemon automatically.

Pull the default local generation model and the v2 style embedding model:

```bash
ollama pull qwen3:14b
ollama pull nomic-embed-text
```

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/alankritxghosh/Pantheon.ai.git
cd Pantheon.ai/agent

# 2. Install dependencies and build
npm install   # automatically builds dist/ via prepare script

# 3. (Optional) Link the CLI globally so you can run `pantheon` from anywhere
npm link
```

After `npm link`, the `pantheon` command is available system-wide. Without linking, invoke it as:

```bash
node /path/to/pantheon/agent/dist/index.js run
```

---

## Quickstart (your own workspace)

```bash
# Navigate to any folder with product context
cd ~/my-messy-product-notes

# Run the full workflow
pantheon run
```

That's it. Pantheon will:
1. Scan the folder recursively for supported context files
2. Build a deterministic context summary
3. Generate all 13 artifacts sequentially, each informed by the previous
4. Validate every artifact against structural and content quality checks
5. Automatically repair any artifact that fails validation
6. Write a `quality-report.md` and `validation-report.md` with the run verdict

Outputs land in two places:
- `pantheon-output/latest/` — always contains the most recent run
- `pantheon-output/runs/<timestamp>/` — timestamped archive of every run

Source files are never touched. Pantheon is read-only on your workspace.

---

## Usage

### Folder-native workflow (recommended)

```bash
cd /path/to/your/product-context
pantheon run                    # full 13-artifact packet, default model
pantheon run --model fast       # faster, lighter model
pantheon run --model best       # stronger model, better output
pantheon run --model flagship   # maximum quality, requires 64GB+ RAM
```

### Standard product packet on a topic

Generate a full product packet for any topic or product without a local folder:

```bash
pantheon packet "AI-native CRM for SMB sales teams"
pantheon packet "Cursor for Product Managers" --out ./runs/cursor-for-pms
pantheon packet "B2B SaaS churn prevention feature"
```

### Critique an existing run

Point Pantheon at a completed run folder to get a critical quality review:

```bash
pantheon critique ./pantheon-output/runs/2026-05-04T10-00-00-000Z
pantheon critique ./runs/cursor-for-pms
```

### Freeform brief

Pass any brief directly for open-ended work:

```bash
pantheon "Deconstruct Cursor and propose its next AI feature."
pantheon "User: solo founders. Problem: investor deck. Scope a feature."
pantheon -f brief.md --out ./runs/my-run
```

### Explicit provider override

```bash
pantheon run --provider ollama --model qwen3:30b
pantheon run --provider claude-cli
pantheon run --provider gemini-cli
pantheon run --provider openai-cli
```

---

## Models and hardware

Pantheon defaults to `qwen3:14b` running locally via Ollama. Choose a tier that fits your hardware:

| Alias | Model | RAM needed | Speed | Quality |
| --- | --- | --- | --- | --- |
| `fast` | `qwen2.5:7b` | 8–16 GB | ~15–20 min/run | Good for drafts |
| `default` / `local` | `qwen3:14b` | 16–24 GB | ~20–35 min/run | Recommended local beta default |
| `best` | `qwen3:30b` | 32–48 GB | ~35–60 min/run | Stronger technical synthesis |
| `flagship` | `qwen3-coder:30b` | 32–48 GB | ~35–60 min/run | Best local coding/technical-doc path |

You can also pass any Ollama model tag directly:

```bash
pantheon run --model qwen3:14b
pantheon run --model mistral-nemo:12b
OLLAMA_MODEL=llama3.3:70b pantheon run
```

**On Apple Silicon:** M3 Max / M4 Max with 48–128 GB unified memory can run the `best` or `flagship` tiers at practical speeds. M2/M3 Pro with 36 GB handles `best` well.

**On Linux with GPU:** A single 24 GB VRAM GPU (RTX 3090, 4090, A5000) handles `best`. Dual 24 GB handles `flagship`.

---

## What files Pantheon reads

Pantheon recursively scans the current directory for these file types:

| Type | Extensions |
| --- | --- |
| Markdown | `.md` |
| Plain text | `.txt` |
| CSV | `.csv` |
| TSV | `.tsv` |
| JSON | `.json` |

**Not yet supported:** `.pdf`, `.docx`, `.xlsx`, images, audio, video, and binaries. Unsupported files are listed in `context-summary.md` as evidence gaps rather than silently skipped or hallucinated from.

**Automatically excluded:** `pantheon-output/`, `.git/`, `node_modules/`, `dist/`, `.next/`, and standard build/cache directories.

---

## How the quality pipeline works

Every artifact goes through a four-stage quality loop before the run is considered complete:

```
Generate → Validate → Repair → (Rescue)
```

1. **Generate:** The model produces the artifact using the workspace brief and any previously completed artifacts as context.
2. **Validate:** Pantheon checks structural requirements — minimum line count, heading count, required content signals (e.g. `evidence-ledger.md` must contain `Confirmed`, `Inference`, `Assumption`), and word limits for `decision-packet.md`.
3. **Repair:** If validation fails, a targeted repair prompt is sent. The model rewrites the artifact with explicit instructions to fix the specific failures.
4. **Rescue:** After all 13 artifacts are generated, any that still fail (up to 3) get a final rescue pass with the full context of all completed artifacts available.

The run produces a `validation-report.md` with a pass/fail status for every artifact, and a `quality-report.md` combining the model's self-assessment with the deterministic validation results.

---

## Environment variables

Pantheon loads `.env` in this order: current folder → `~/.pantheon/.env` → package directory. No API keys are required for the default Ollama path.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PANTHEON_PROVIDER` | `ollama` | Provider: `ollama`, `anthropic`, `claude-cli`, `openai-cli`, `gemini-cli` |
| `PANTHEON_MODEL` | `qwen3:14b` | Model name or alias |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama daemon URL |
| `OLLAMA_MODEL` | — | Override model for Ollama provider |
| `PANTHEON_OLLAMA_NUM_CTX` | `16384` | Ollama context window used for generation requests |
| `PANTHEON_OLLAMA_CALL_TIMEOUT_MS` | `900000` | Per-call Ollama timeout in milliseconds |
| `PANTHEON_OLLAMA_FIRST_TOKEN_TIMEOUT_MS` | `360000` | First streamed-token timeout for Ollama generation requests |
| `PANTHEON_EVIDENCE_ENRICHMENT` | `off` | Optional model clustering for deterministic evidence cards (`off` or `on`) |
| `PANTHEON_ARTIFACT_MODEL_MODE` | `polish` | Artifact generation mode: model-polished artifacts (`polish`) or deterministic fallbacks (`off`) |
| `PANTHEON_EMBED_PROVIDER` | `ollama` | Style embedding provider: `ollama`, `openai`, or `anthropic` (not yet supported) |
| `OPENAI_API_KEY` | — | Required only for OpenAI embeddings or OpenAI CLI workflows |
| `ANTHROPIC_API_KEY` | — | Required only for `provider=anthropic` |
| `ANTHROPIC_MODEL` | `claude-opus-4-7` | Model override for Anthropic provider |
| `OPENAI_MODEL` | — | Model override for `openai-cli` |
| `GEMINI_MODEL` | — | Model override for `gemini-cli` |
| `PANTHEON_MAX_TOKENS` | `64000` | Max output tokens per artifact |
| `PANTHEON_MAX_ITERATIONS` | `30` | Tool-loop cap for agentic providers |
| `PANTHEON_DISABLE_THINKING` | `0` | Set to `1` for models without thinking support |
| `PANTHEON_CLAUDE_CLI_COMMAND` | see below | Override Claude CLI invocation template |
| `PANTHEON_OPENAI_CLI_COMMAND` | see below | Override OpenAI CLI invocation template |
| `PANTHEON_GEMINI_CLI_COMMAND` | see below | Override Gemini CLI invocation template |

Default CLI command templates (override if your installed CLI uses different syntax):

```bash
claude -p "$(cat "{{prompt_file}}")"
openai responses create -m "{{model}}" -i "$(cat "{{prompt_file}}")"
gemini --model "{{model}}" -p "$(cat "{{prompt_file}}")"
```

Template variables: `{{prompt_file}}` (path to temp file with full prompt), `{{model}}` (resolved model name), `{{out}}` (output directory).

---

## Architecture

```
pantheon run
    │
    ├── workspace.ts       — recursively scans folder, builds context summary
    │
    ├── pipeline.ts        — sequential artifact loop with validate/repair/rescue
    │   │
    │   ├── artifacts.ts   — artifact specs: filename, purpose, required sections, dependencies
    │   ├── ollama-agent.ts — Ollama HTTP adapter (auto-pull, single-artifact mode)
    │   ├── agent.ts       — Anthropic SDK adapter (native tool use)
    │   ├── cli-agent.ts   — shell-out adapter for claude/openai/gemini CLIs
    │   └── validator.ts   — deterministic quality checks, report generation
    │
    ├── prompt.ts          — the Pantheon system prompt (the PM operating model)
    └── models.ts          — provider/model resolution, aliases
```

Each artifact in the pipeline is generated with:
- The full workspace brief and context summary
- All previously completed artifacts as dependency context
- A targeted generation prompt specifying the artifact's purpose, required sections, and quality floor

This sequential dependency chain is intentional — `prd-v1.md` informs `system-design.md`, which informs `evals.md`, which informs `roadmap.md`. Skipping ahead breaks coherence.

The system prompt in `prompt.ts` encodes the operating model of a senior AI PM: cite evidence, label gaps, score alternatives before recommending, treat responsible-AI as a Day-1 constraint, define "good" before shipping.

---

## Project structure

```
agent/
├── src/
│   ├── index.ts           — CLI entry point, argument parsing, mode dispatch
│   ├── pipeline.ts        — artifact generation loop
│   ├── artifacts.ts       — artifact specifications
│   ├── ollama-agent.ts    — local Ollama adapter
│   ├── agent.ts           — Anthropic SDK adapter
│   ├── cli-agent.ts       — CLI shell-out adapter
│   ├── workspace.ts       — folder scanning and context building
│   ├── validator.ts       — output quality validation
│   ├── prompt.ts          — system prompt
│   ├── models.ts          — model registry and resolution
│   ├── artifact-blocks.ts — delimiter parser for model output
│   ├── tools.ts           — tool definitions
│   └── env.ts             — environment loading
├── dist/                  — compiled JS (generated by tsc)
├── runs/                  — example outputs
├── .env.example           — environment variable reference
├── package.json
└── tsconfig.json
```

---

## Development

```bash
# Type-check without building
npm run typecheck

# Build (compiles TypeScript to dist/)
npm run build

# Run directly from source (no build step)
npm start -- run
npm start -- packet "My product idea"
npm start -- --help
```

To run against a workspace during development:

```bash
cd /path/to/test-workspace
node /path/to/pantheon/agent/dist/index.js run
```

---

## Use Pantheon inside Claude Code

A Model Context Protocol server wraps Pantheon as tools for Claude Code. See [`mcp-server/README.md`](./mcp-server/README.md) for setup.

## Troubleshooting

Run `pantheon doctor` for a full readiness check. It tells you exactly what's missing and how to fix it. Common issues it catches:

- Ollama not running (fix: `ollama serve`)
- Generation model not pulled (fix: `ollama pull <model>`)
- Embedding model not pulled (fix: `ollama pull nomic-embed-text`)
- Missing API keys for hosted providers (fix: set the relevant env var)

`pantheon run` also invokes the same readiness check before doing any work, so failures are caught in seconds with no orphan output folders.

## FAQ

**Does it work without internet?**
Yes, once Ollama is running and the model is pulled locally, Pantheon runs entirely offline. The only network call is the initial model pull (one-time, ~5–40 GB depending on model size).

**Does it modify my source files?**
No. Pantheon is read-only on your workspace. It only writes to `pantheon-output/` which it creates inside your folder.

**What if a file type I use isn't supported?**
V1 ingests text-based files only. Unsupported files (PDFs, Word docs, images) are listed in `context-summary.md` as evidence gaps. PDF/DOCX parsing is on the roadmap.

**Can I use a cloud model instead of Ollama?**
Yes. Use `--provider anthropic` (requires `ANTHROPIC_API_KEY`), `--provider claude-cli`, `--provider openai-cli`, or `--provider gemini-cli`. The default is local Ollama for privacy and offline capability.

**How long does a full run take?**
Roughly 20–35 minutes on `qwen3:14b` (default), depending on hardware and workspace size. The pipeline keeps the evidence ledger first, then uses compact dependency context for later artifacts to reduce repeated prompt cost. `qwen2.5:7b` is faster for drafts; `qwen3:30b` and `qwen3-coder:30b` improve technical quality on larger-memory machines.

**What's the quality like on smaller models?**
Models below ~7B parameters struggle with Pantheon's strict artifact-delimiter format and structured-output requirements. `qwen2.5:7b` is the minimum recommended size. Smaller models like `llama3.2:3b` will produce content but the delimiter parsing often fails, requiring multiple repair passes.

**My run says "Not demo-ready" — is the output useless?**
Not necessarily. The validator enforces structural minimums (line count, headings, required content signals). A `Not demo-ready` verdict means one or more artifacts didn't meet the floor — but the artifacts that passed are real, usable documents. Check `validation-report.md` to see exactly which artifacts failed and why.

---

## License

MIT. See [LICENSE](LICENSE).

---

## Acknowledgements

Built on [Ollama](https://ollama.com) for local model serving and the [Qwen 2.5](https://qwenlm.github.io) model family as the default inference backend. Inspired by the operating model of senior PMs at frontier AI labs who own the full feedback loop — discovery through eval — not just the PRD.
