# Pantheon

**The reasoning layer for product managers, inside Claude Code.**

Pantheon takes a pile of raw evidence from wherever PMs already have it (Slack threads, Linear tickets, Gong or Granola transcripts, Notion pages, support escalations) and returns a ranked, cited opportunity list. Every claim traces back to the exact piece of evidence the PM provided, with the PM's own naming preserved end to end.

Pantheon is an MCP server. The primary entry point is the `pantheon_synthesize` tool, callable from Claude Code, Claude Desktop, or any MCP-compatible client.

```
PM: "Pull the last two weeks of customer signals from Linear and Slack,
     then run pantheon_synthesize on them."

Claude Code: [gathers evidence via Linear and Slack MCPs]
             [calls pantheon_synthesize with raw blobs]
             [returns ranked opportunities with citations back
              to PROD-412, slack-thread-billing-pain, etc.]
```

No folder organization required. No copy-paste. PMs stay where they already work.

---

## What v3 is

v3 repositions Pantheon from a folder-based CLI to an MCP-native reasoning layer. The insight is simple: PMs do not organize folders, they live in Slack, Linear, Gong, and Notion. Asking them to assemble a structured workspace was the wrong entry point. The synthesis logic, evidence labelling, and citation discipline that powered v1 and v2 are unchanged. What changed is how PMs invoke it.

The folder-native CLI workflow from v2 still ships and still works. It is now the advanced path for users who want the full 13-artifact packet on a curated workspace. See [Folder workflow (advanced)](#folder-workflow-advanced) below.

See [CHANGELOG.md](./CHANGELOG.md) for the full v3.0.0 release notes.

---

## Install the MCP server

```bash
git clone https://github.com/alankritxghosh/Pantheon.ai.git
cd Pantheon.ai/agent
npm install
cd mcp-server && npm install
```

Add Pantheon to your Claude Code config (`~/.claude.json` or `.mcp.json`):

```json
{
  "mcpServers": {
    "pantheon": {
      "command": "node",
      "args": ["/absolute/path/to/Pantheon.ai/agent/mcp-server/dist/index.js"],
      "env": {
        "PANTHEON_MCP_BIN": "/absolute/path/to/Pantheon.ai/agent/dist/index.js"
      }
    }
  }
}
```

Restart Claude Code. Type `/mcp` to confirm the `pantheon` server is loaded. The full MCP setup guide lives in [`mcp-server/README.md`](./mcp-server/README.md).

---

## The primary tool: `pantheon_synthesize`

Hand Pantheon any pile of raw evidence and get a ranked opportunity list back. The input is an array of evidence blobs with human-readable names:

```typescript
{
  evidence: [
    {
      name: "linear-PROD-412",
      content: "Support escalation: enterprise customer needs revenue attribution across child accounts...",
      source_type: "linear"
    },
    {
      name: "granola-call-2026-05-12",
      content: "Customer said billing reconciliation across regions is the most painful part of their weekly close...",
      source_type: "granola"
    },
    {
      name: "slack-thread-billing-pain",
      content: "Three different threads this month complain about reconciliation...",
      source_type: "slack"
    }
  ],
  top_n: 3
}
```

What you get back:

- `ranked_opportunities`: top-N opportunities with rank, name, score, rationale, and citation back to the evidence blob name
- `evidence_ledger_markdown`: full evidence ledger, with every assertion cited
- `opportunity_scorecard_markdown`: full scored scorecard
- `validation_passed`: structural validation status across the 4 artifacts
- `run_id` and `workspace_dir`: handles for follow-up artifact reads via `pantheon_read_artifact`

**Citation discipline:** the original `name` field is what shows up in every returned citation. PMs see `[source: linear-PROD-412]`, not an internal filename. The mapping is handled in-process by the MCP server.

**Hard limits:** up to 200 evidence blobs per call, up to 200,000 characters per blob, `top_n` between 1 and 10.

### What synthesize generates

Four PM-wedge artifacts:

| Artifact | What it is |
| --- | --- |
| `evidence-ledger.md` | Every piece of evidence labelled Confirmed, Public signal, Inference, Assumption, or Evidence gap |
| `product-vision.md` | Thesis, ICP, wedge, why-now, differentiation, product principles |
| `competitive-deconstruction.md` | Competitor and alternative categories with strengths, weaknesses, implications |
| `opportunity-scorecard.md` | 5 to 7 opportunities scored on pain, evidence, leverage, feasibility, risk, why-now |

Each is a real Markdown document at depth. No outlines. No templates with blanks.

---

## All MCP tools

| Tool | Purpose |
| --- | --- |
| `pantheon_synthesize` | **Primary.** Raw evidence in, ranked opportunities out. No folder required. |
| `learn-style` | Ingest example docs and write `.pantheon/style.json` so future runs match a team's house style. |
| `pantheon_run` | Start a folder-native 13-artifact run on a directory. Returns a runId. |
| `pantheon_packet` | Generate a packet from a free-text topic. |
| `pantheon_critique` | Critique an existing run folder. |
| `pantheon_status` | Poll the status of a long-running job. |
| `pantheon_read_artifact` | Read a specific artifact from a completed run. |
| `pantheon_list_runs` | List all runs in this MCP session. |

`pantheon_synthesize` is synchronous and returns in roughly 1 to 3 minutes on the default local model. `pantheon_run` is asynchronous (25 to 35 minutes on default model) and uses fire-and-poll.

---

## Prerequisites

- Node.js 20+
- [Ollama](https://ollama.com) running locally (default provider), or an API key for a hosted provider
- For Ollama: `ollama pull qwen3:14b` and `ollama pull nomic-embed-text`

Run `pantheon doctor` after install to verify your setup is ready.

For deterministic CI or local testing without an LLM running, set `PANTHEON_PROVIDER=fixture` and point `PANTHEON_FIXTURE_DIR` at a folder of canned artifacts. See [Fixture provider](#fixture-provider).

---

## Folder workflow (advanced)

The v2 folder workflow still ships. Use it when you want the full 13-artifact packet on a curated workspace folder, not the 4-artifact wedge.

```bash
cd ~/my-product-context
pantheon run
```

This generates 13 artifacts in `pantheon-output/latest/`:

| Artifact | What it is |
| --- | --- |
| `evidence-ledger.md` | Every piece of evidence, labelled |
| `product-vision.md` | Thesis, ICP, wedge, why-now, differentiation |
| `user-personas-jtbd.md` | 3+ personas with triggers, pains, JTBD statements |
| `competitive-deconstruction.md` | Competitor and alternative categories |
| `opportunity-scorecard.md` | 5 to 7 wedges scored across 6 dimensions |
| `prd-v1.md` | Problem, user stories, scope, success metrics |
| `system-design.md` | Architecture, model layer, failure modes |
| `evals.md` | Golden set, rubric, judge, ship gates |
| `roadmap.md` | 4+ phases with goals, dependencies, risks |
| `launch-plan.md` | Beta cohort, activation flow, distribution |
| `risk-review.md` | Product, technical, RAI, GTM, operational risks |
| `decision-packet.md` | One-screen leadership summary under 500 words |
| `quality-report.md` | Self-review with readiness score |

### Quickstart on a demo workspace

```bash
cd test-fixtures/demo-context-google
pantheon run
```

Try `demo-context-amazon` or `demo-context-yc` to see the same context generated in different house styles.

### Other CLI modes

```bash
pantheon synthesize ./evidence-folder --top 3   # 4-artifact wedge from a folder
pantheon packet "AI-native CRM for SMB sales"   # standard packet from a topic
pantheon critique ./pantheon-output/runs/<ts>   # quality review of a past run
pantheon "Deconstruct Cursor and propose its next AI feature."   # freeform brief
pantheon learn-style ./example-docs --company "Acme"            # learn house style
```

### Provider override

```bash
pantheon run --provider ollama --model qwen3:30b
pantheon run --provider claude-cli
pantheon run --provider gemini-cli
pantheon run --provider openai-cli
```

---

## Models and hardware

Pantheon defaults to `qwen3:14b` via Ollama. Choose a tier that fits your hardware:

| Alias | Model | RAM needed | Speed | Quality |
| --- | --- | --- | --- | --- |
| `fast` | `qwen2.5:7b` | 8 to 16 GB | ~15 to 20 min/run | Good for drafts |
| `default` / `local` | `qwen3:14b` | 16 to 24 GB | ~20 to 35 min/run | Recommended local default |
| `best` | `qwen3:30b` | 32 to 48 GB | ~35 to 60 min/run | Stronger technical synthesis |
| `flagship` | `qwen3-coder:30b` | 32 to 48 GB | ~35 to 60 min/run | Best local technical-doc path |

`pantheon_synthesize` runs faster than the full packet because it generates 4 artifacts instead of 13.

You can also pass any Ollama model tag directly:

```bash
pantheon run --model qwen3:14b
OLLAMA_MODEL=llama3.3:70b pantheon run
```

**On Apple Silicon:** M3 Max / M4 Max with 48 to 128 GB unified memory handles `best` or `flagship`. M2/M3 Pro with 36 GB handles `best` well.

**On Linux with GPU:** a single 24 GB VRAM GPU (RTX 3090, 4090, A5000) handles `best`. Dual 24 GB handles `flagship`.

---

## Fixture provider

For deterministic CI and local development without an LLM running, Pantheon ships a `fixture` provider that replays canned artifacts from disk.

```bash
PANTHEON_PROVIDER=fixture \
PANTHEON_FIXTURE_DIR=./agent/test/fixtures/llm-recordings/synthesize \
pantheon synthesize ./some-folder
```

This is how the test suite runs: 72 tests, all green, no Ollama or API calls. CI runs on GitHub Actions across Node 20 and 22.

---

## How the quality pipeline works

Every artifact goes through a four-stage loop:

```
Generate → Validate → Repair → (Rescue)
```

1. **Generate:** the model produces the artifact using the brief and any previously completed artifacts as context.
2. **Validate:** Pantheon checks structural requirements: minimum line count, heading count, required content signals (e.g. `evidence-ledger.md` must contain `Confirmed`, `Inference`, `Assumption`), and word limits for `decision-packet.md`.
3. **Repair:** if validation fails, a targeted repair prompt rewrites the artifact with explicit instructions to fix the specific failures.
4. **Rescue:** for the full packet path, any artifacts that still fail get a final pass with the full context of all completed artifacts.

Each run produces a `validation-report.md` with a pass/fail status for every artifact, and a `quality-report.md` combining model self-assessment with deterministic validation.

The MCP synthesize path validates a 4-artifact subset rather than the full 13.

---

## Citation round-tripping

When you call `pantheon_synthesize` with evidence named `linear-PROD-412` and `granola-call-2026-05-12`, those names appear in every citation the PM sees. Internally, Pantheon writes each blob to disk under a safe filename (`evidence-001-linear-prod-412.md`) so the filesystem stays sane. Before returning markdown to the agent, the MCP server substitutes safe filenames back to the original blob names. PMs never see internal naming. Their own labels show up everywhere.

This is unit-tested. See `mcp-server/test/synthesize-handler.test.mjs` for ordering edge cases (longer filenames substituted first to prevent substring stomps, multiple occurrences of the same filename handled correctly).

---

## Compatibility

| Platform | Support |
| --- | --- |
| macOS (Apple Silicon) | Full support. M-series Macs with 16GB+ unified memory run the default model smoothly. |
| macOS (Intel) | Supported. 16GB+ RAM recommended. |
| Linux (x86_64) | Full support. Ubuntu 20.04+, Debian 11+, Fedora 36+. |
| Linux (ARM64) | Supported. AWS Graviton, Raspberry Pi 5. |
| Windows 10/11 | Supported via WSL2 (recommended) or native with Ollama for Windows. |

Node.js 20 or higher required.

---

## Files Pantheon reads (folder workflow)

| Type | Extensions |
| --- | --- |
| Markdown | `.md`, `.markdown` |
| Plain text | `.txt` |
| CSV / TSV | `.csv`, `.tsv` |
| JSON | `.json` |

Not yet supported: `.pdf`, `.docx`, `.xlsx`, images, audio, video, binaries. Unsupported files are listed in `context-summary.md` as evidence gaps rather than silently skipped.

Automatically excluded: `pantheon-output/`, `.git/`, `node_modules/`, `dist/`, `.next/`, and standard build directories.

---

## Environment variables

Pantheon loads `.env` in this order: current folder, then `~/.pantheon/.env`, then package directory. No API keys are required for the default Ollama path.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PANTHEON_PROVIDER` | `ollama` | Provider: `ollama`, `anthropic`, `claude-cli`, `openai-cli`, `gemini-cli`, `fixture` |
| `PANTHEON_MODEL` | `qwen3:14b` | Model name or alias |
| `PANTHEON_FIXTURE_DIR` | none | Path to canned artifacts when `PANTHEON_PROVIDER=fixture` |
| `PANTHEON_MCP_BIN` | none | Absolute path to `agent/dist/index.js`, used by the MCP server |
| `PANTHEON_SYNTHESIZE_TIMEOUT_MS` | `300000` | Timeout for `pantheon_synthesize` subprocess |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama daemon URL |
| `OLLAMA_MODEL` | none | Override model for Ollama provider |
| `PANTHEON_OLLAMA_NUM_CTX` | `16384` | Ollama context window |
| `PANTHEON_OLLAMA_CALL_TIMEOUT_MS` | `900000` | Per-call Ollama timeout in ms |
| `PANTHEON_OLLAMA_FIRST_TOKEN_TIMEOUT_MS` | `360000` | First streamed-token timeout |
| `PANTHEON_EVIDENCE_ENRICHMENT` | `off` | Optional model clustering for evidence cards |
| `PANTHEON_ARTIFACT_MODEL_MODE` | `polish` | `polish` or `off` (deterministic fallback) |
| `PANTHEON_EMBED_PROVIDER` | `ollama` | Style embedding provider: `ollama`, `openai` |
| `OPENAI_API_KEY` | none | Required for OpenAI embeddings or OpenAI CLI |
| `ANTHROPIC_API_KEY` | none | Required for `provider=anthropic` |
| `ANTHROPIC_MODEL` | `claude-opus-4-7` | Model override for Anthropic |
| `OPENAI_MODEL` | none | Model override for `openai-cli` |
| `GEMINI_MODEL` | none | Model override for `gemini-cli` |
| `PANTHEON_MAX_TOKENS` | `64000` | Max output tokens per artifact |
| `PANTHEON_MAX_ITERATIONS` | `30` | Tool-loop cap for agentic providers |
| `PANTHEON_DISABLE_THINKING` | `0` | Set to `1` for models without thinking support |

---

## Architecture

```
MCP client (Claude Code)
    │
    └── pantheon_synthesize MCP tool
            │
            ├── synthesize-handler.ts   - Zod validation, blob slugify, citation round-trip
            └── spawns pantheon CLI subprocess with fixture or live provider
                    │
                    ├── workspace.ts    - scans folder, builds context summary
                    ├── pipeline.ts     - sequential artifact loop, validate/repair/rescue
                    │       │
                    │       ├── artifacts.ts        - artifact specs, PipelineMode filter
                    │       ├── ollama/http-client.ts - Ollama HTTP adapter
                    │       ├── cli-agent.ts        - shell-out for claude/openai/gemini CLIs
                    │       └── validator.ts        - deterministic quality checks
                    │
                    ├── prompt.ts       - Pantheon system prompt (PM operating model)
                    └── models.ts       - provider/model resolution
```

Each artifact in the pipeline is generated with the workspace brief, the context summary, and all previously completed artifacts as dependency context. The dependency chain (`prd-v1.md` informs `system-design.md`, which informs `evals.md`) is intentional. Skipping ahead breaks coherence.

`PipelineMode` (`"full"` or `"synthesize"`) filters which artifacts run. The synthesize path runs only the 4 PM-wedge artifacts.

---

## Project structure

```
agent/
├── src/
│   ├── index.ts                   - CLI entry, mode dispatch
│   ├── pipeline.ts                - artifact generation loop
│   ├── artifacts.ts               - artifact specs, PipelineMode
│   ├── validator.ts               - quality validation
│   ├── workspace.ts               - folder scanning
│   ├── prompt.ts                  - system prompt
│   ├── models.ts                  - provider/model resolution
│   ├── citations.ts               - citation round-trip logic
│   ├── briefs/                    - artifact brief generation
│   ├── evidence/                  - evidence card extraction
│   ├── health/doctor.ts           - preflight checks
│   ├── cli-output/                - terminal-friendly summaries
│   ├── ollama/                    - Ollama HTTP client
│   └── style/                     - style learning and retrieval
├── mcp-server/
│   ├── src/
│   │   ├── index.ts               - MCP server entry
│   │   ├── synthesize-handler.ts  - pantheon_synthesize implementation
│   │   ├── synthesize-summary.ts  - scorecard parser (bundled in MCP package)
│   │   ├── tools.ts               - tool registrations
│   │   └── pantheon.ts            - subprocess driver
│   └── test/                      - MCP unit and E2E tests
├── test/                          - agent unit and E2E tests
├── test-fixtures/                 - demo workspaces, style corpora
└── .github/workflows/ci.yml       - typecheck + tests on Node 20/22
```

---

## Development

```bash
# Type-check
npm run typecheck

# Build
npm run build

# Tests (72 total: 56 agent + 16 mcp-server)
npm test

# Test fixture-only (deterministic, no LLM)
PANTHEON_PROVIDER=fixture npm test
```

---

## Troubleshooting

Run `pantheon doctor` for a full readiness check. Common issues it catches:

- Ollama not running: `ollama serve`
- Generation model not pulled: `ollama pull <model>`
- Embedding model not pulled: `ollama pull nomic-embed-text`
- Missing API keys for hosted providers: set the relevant env var

`pantheon run` invokes the same readiness check before doing any work, so failures surface in seconds with no orphan output folders.

For MCP issues: type `/mcp` in Claude Code, check `~/Library/Logs/Claude/mcp.log`, and inspect the per-run log at `/tmp/pantheon-mcp-<runId>.log`.

---

## FAQ

**Why MCP instead of a standalone CLI?**
PMs do not organize folders, they live in Slack, Linear, Gong, and Notion. The MCP entry point lets PMs invoke Pantheon from inside Claude Code, where they already have evidence at their fingertips via other MCPs.

**Does my evidence leave my machine?**
With the default Ollama provider, no. Pantheon runs entirely locally. The MCP server passes evidence to the local CLI as a subprocess, the CLI calls Ollama on `localhost:11434`, and the result comes back in-process. If you set `PANTHEON_PROVIDER=anthropic`, evidence goes to Anthropic.

**Does Pantheon modify my files?**
No. Pantheon is read-only on your workspace for the folder path, and writes only to a temp directory (or `pantheon-output/`) for the MCP path.

**Can I use a cloud model?**
Yes. `--provider anthropic` (requires `ANTHROPIC_API_KEY`), `--provider claude-cli`, `--provider openai-cli`, `--provider gemini-cli`. Default is local Ollama for privacy.

**How long does `pantheon_synthesize` take?**
Roughly 1 to 3 minutes on the default local model for 4 artifacts. Full 13-artifact `pantheon_run` takes 25 to 35 minutes.

**What if a file type I use is not supported?**
v3 still ingests text-based files only for the folder path. Unsupported files (PDFs, Word docs, images) are listed in `context-summary.md` as evidence gaps. For the MCP path, the agent can extract text from PDFs or DOCX via other MCP tools and hand the raw text to `pantheon_synthesize` directly.

**Citation discipline: what happens to my evidence names?**
The `name` field you pass to `pantheon_synthesize` appears verbatim in every returned citation. Internal safe filenames are substituted out before returning. PMs see their own labels.

---

## License

MIT. See [LICENSE](LICENSE).

---

## Acknowledgements

Built on [Ollama](https://ollama.com) for local model serving, the [Qwen 2.5](https://qwenlm.github.io) model family, and the [Model Context Protocol](https://modelcontextprotocol.io). Inspired by the operating model of senior PMs at frontier AI labs who own the full feedback loop from discovery through eval.
