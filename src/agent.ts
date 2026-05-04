import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./prompt.js";
import { customTools, handleToolUse, type ToolContext } from "./tools.js";

const MODEL = process.env.PANTHEON_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
const MAX_TOKENS = Number(process.env.PANTHEON_MAX_TOKENS ?? 64000);
const MAX_ITERATIONS = Number(process.env.PANTHEON_MAX_ITERATIONS ?? 30);

export async function runAgent(brief: string, ctx: ToolContext): Promise<void> {
  const client = new Anthropic();

  const tools: Anthropic.Messages.ToolUnion[] = [
    { type: "web_search_20260209", name: "web_search" },
    { type: "web_fetch_20260209", name: "web_fetch" },
    ...customTools,
  ];

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: brief },
  ];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const thinking =
      process.env.PANTHEON_DISABLE_THINKING === "1"
        ? undefined
        : ({ type: "adaptive" } as const);

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      ...(thinking ? { thinking } : {}),
      system: [
        {
          type: "text",
          text: `${SYSTEM_PROMPT}

# Runtime freshness

Current run date: ${new Date().toISOString().slice(0, 10)}.
Selected runtime model: ${MODEL}.
Model/provider claims are time-sensitive. Use current official evidence when naming specific models, pricing, context windows, release dates, or benchmark claims. If current evidence is unavailable, use capability tiers and mark exact model selection as an evidence gap.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools,
      messages,
    });

    stream.on("text", (delta) => process.stdout.write(delta));

    const message = await stream.finalMessage();
    process.stdout.write("\n");

    messages.push({ role: "assistant", content: message.content });

    if (message.stop_reason === "end_turn") {
      const usage = message.usage;
      console.error(
        `\n[done] input=${usage.input_tokens} output=${usage.output_tokens} cache_read=${usage.cache_read_input_tokens ?? 0} cache_write=${usage.cache_creation_input_tokens ?? 0}`,
      );
      return;
    }

    if (message.stop_reason === "pause_turn") {
      // Server-side tool (web_search/web_fetch) hit its iteration cap.
      // Re-send to resume — no extra user message.
      continue;
    }

    if (message.stop_reason === "tool_use") {
      const toolUses = message.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        // Server tools are handled by Anthropic; only dispatch our custom ones.
        const isCustom = customTools.some((t) => t.name === tu.name);
        if (!isCustom) continue;
        try {
          const out = await handleToolUse(tu.name, tu.input, ctx);
          results.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: out,
          });
        } catch (e) {
          results.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `ERROR: ${(e as Error).message}`,
            is_error: true,
          });
        }
      }

      if (results.length === 0) {
        // No custom tool calls but stop_reason was tool_use — server tool only.
        continue;
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    if (message.stop_reason === "refusal") {
      console.error("\n[agent refused]");
      return;
    }

    if (message.stop_reason === "max_tokens") {
      console.error("\n[hit max_tokens — stopping]");
      return;
    }

    console.error(`\n[unexpected stop_reason: ${message.stop_reason}]`);
    return;
  }

  console.error(`\n[hit MAX_ITERATIONS=${MAX_ITERATIONS}]`);
}
