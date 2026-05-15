# Pantheon MCP Server

Use Pantheon as tools inside Claude Code (or any MCP-compatible client).

## What this gives you

After installing, you can ask Claude Code things like:
- "Run Pantheon on this folder."
- "Learn this team's doc style from these examples."
- "Check the status of the last Pantheon run."
- "Show me the PRD from the most recent run."

Behind the scenes, the MCP server invokes the Pantheon CLI as a subprocess and returns structured results.

## Install

```bash
# From the Pantheon repo root
cd mcp-server
npm install
```

The `prepare` script auto-builds `dist/`.

## Configure Claude Code

Add this to `~/.claude.json` (or your project's `.mcp.json`):

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

Restart Claude Code. Type `/mcp` to confirm the `pantheon` server is loaded.

## Tools

| Tool | Purpose |
| --- | --- |
| `pantheon_synthesize` | **Primary tool.** Synthesize raw evidence blobs from any source into a ranked, cited opportunity list. No folder required. |
| `learn-style` | Ingest example docs and write `.pantheon/style.json` plus `.pantheon/style-index.json` into a workspace. |
| `pantheon_run` | Start a folder-native run on a directory. Returns a runId. |
| `pantheon_packet` | Generate a packet from a free-text topic. |
| `pantheon_critique` | Critique an existing run folder. |
| `pantheon_status` | Poll the status of a run by runId. |
| `pantheon_read_artifact` | Read a specific artifact from a completed run. |
| `pantheon_list_runs` | List all runs in this session. |

### `pantheon_synthesize`

The primary entry point. Give Pantheon any pile of raw evidence (Linear tickets, Slack threads, Granola or
Gong transcripts, Notion pages, manual notes) and get back a ranked list of opportunities with citations
preserved back to your provided names.

Inputs:

- `evidence`: array of `{ name, content, source_type? }`. `name` becomes the citation handle the PM sees.
  Up to 200 blobs. The agent typically gathers these from other MCP servers.
- `top_n`: how many ranked opportunities to return (default 3, max 10).
- `workspace_id`: reserved for persistent memory in a later phase; safely ignored today.

Returns a synchronous result with `ranked_opportunities`, the full `evidence_ledger_markdown`, the full
`opportunity_scorecard_markdown`, validation status, and a `run_id` for follow-up. Citations in returned
markdown reference your evidence `name` values, never the on-disk safe filenames.

Typical Claude Code phrasing:

> "Pull the last two weeks of customer signals from Linear and Slack, then run pantheon_synthesize on them."

### `learn-style`

Use this before `pantheon_run` when the target workspace should follow a team's house style.

Inputs:

- `input_dir`: relative or absolute path to example product docs (`.md`, `.markdown`, or `.txt`).
- `workdir`: where `.pantheon/` should be written; defaults to the MCP server's current working directory.
- `company`: optional company or team name stored in the style profile.

The tool returns the written `style.json` path, `style-index.json` path, and a concise summary of the artifact styles learned.

## Notes

- A full `pantheon_run` takes 25-35 minutes on the default Pantheon model. The MCP server uses fire-and-poll: `pantheon_run` returns immediately, `pantheon_status` reports progress.
- Run state is held in memory for the duration of the MCP server process (one Claude Code session). Restarting Claude Code clears the run history but does not affect the on-disk artifacts.
- The MCP server writes a per-run log to `/tmp/pantheon-mcp-<runId>.log`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Tools don't appear in Claude Code | Run `/mcp` in Claude Code; check `~/Library/Logs/Claude/mcp.log`. |
| `pantheon_run` immediately fails | Ensure `PANTHEON_MCP_BIN` points to a valid `dist/index.js` and that `npm install` was run in the agent root. |
| Run never reaches `completed` | Check the log file at `/tmp/pantheon-mcp-<runId>.log` for errors. Likely Ollama is not running or the model is not pulled. |
