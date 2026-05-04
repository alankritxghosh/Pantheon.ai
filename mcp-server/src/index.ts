#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  handlePantheonCritique,
  handlePantheonListRuns,
  handlePantheonPacket,
  handlePantheonReadArtifact,
  handlePantheonRun,
  handlePantheonStatus,
  PantheonCritiqueInput,
  PantheonListRunsInput,
  PantheonPacketInput,
  PantheonReadArtifactInput,
  PantheonRunInput,
  PantheonStatusInput,
} from "./tools.js";

const TOOLS = [
  {
    name: "pantheon_run",
    description:
      "Start the folder-native Pantheon workflow on a directory. Generates 13 product artifacts. Returns a runId immediately; the run executes in the background. Use pantheon_status to poll for completion.",
    schema: PantheonRunInput,
    handler: handlePantheonRun,
  },
  {
    name: "pantheon_packet",
    description:
      "Generate a standard Pantheon product packet for a free-text topic without a local folder. Returns a runId; poll pantheon_status.",
    schema: PantheonPacketInput,
    handler: handlePantheonPacket,
  },
  {
    name: "pantheon_critique",
    description:
      "Run Pantheon's critique mode on an existing run folder to get a quality review. Returns a runId; poll pantheon_status.",
    schema: PantheonCritiqueInput,
    handler: handlePantheonCritique,
  },
  {
    name: "pantheon_status",
    description:
      "Get the status of a Pantheon run by runId. While running, returns recent progress lines. When completed, includes artifact list and validation summary.",
    schema: PantheonStatusInput,
    handler: handlePantheonStatus,
  },
  {
    name: "pantheon_read_artifact",
    description:
      "Read the full markdown content of a specific artifact (e.g. decision-packet.md) from a completed Pantheon run.",
    schema: PantheonReadArtifactInput,
    handler: handlePantheonReadArtifact,
  },
  {
    name: "pantheon_list_runs",
    description: "List all Pantheon runs started in this MCP server session, most recent first.",
    schema: PantheonListRunsInput,
    handler: handlePantheonListRuns,
  },
];

const server = new Server(
  { name: "pantheon-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.schema, { target: "openApi3" }),
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = TOOLS.find((t) => t.name === request.params.name);
  if (!tool) throw new Error(`Unknown tool: ${request.params.name}`);
  const args = tool.schema.parse(request.params.arguments ?? {});
  // @ts-expect-error - handler/schema pairing is checked by hand; runtime is fine
  const result = await tool.handler(args);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
