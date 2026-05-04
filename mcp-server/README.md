# Pantheon MCP Server

Use Pantheon as tools inside Claude Code (or any MCP-compatible client).

## What this gives you

After installing, you can ask Claude Code things like:
- "Run Pantheon on this folder."
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
| `pantheon_run` | Start a folder-native run on a directory. Returns a runId. |
| `pantheon_packet` | Generate a packet from a free-text topic. |
| `pantheon_critique` | Critique an existing run folder. |
| `pantheon_status` | Poll the status of a run by runId. |
| `pantheon_read_artifact` | Read a specific artifact from a completed run. |
| `pantheon_list_runs` | List all runs in this session. |

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
