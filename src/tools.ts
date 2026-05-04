import fs from "fs/promises";
import path from "path";
import readline from "readline/promises";
import Anthropic from "@anthropic-ai/sdk";
import { isFlatMarkdownFilename } from "./validator.js";

export interface ToolContext {
  workdir: string;
}

export const customTools: Anthropic.Tool[] = [
  {
    name: "save_artifact",
    description:
      "Write a Markdown artifact to the working directory. Use this for every PRD, deconstruction, eval plan, system design doc, or decision packet you produce. Overwrites existing files with the same name. Returns the absolute path saved.",
    input_schema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description:
            "Kebab-case filename ending in .md, e.g. 'prd-billing.md'. No directories — files are written flat in the working directory.",
        },
        content: {
          type: "string",
          description: "The full Markdown content of the artifact.",
        },
      },
      required: ["filename", "content"],
    },
  },
  {
    name: "read_artifact",
    description:
      "Read back an artifact you previously saved, so you can revise it or build on it.",
    input_schema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Filename to read." },
      },
      required: ["filename"],
    },
  },
  {
    name: "list_artifacts",
    description: "List all artifacts saved so far in the working directory.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "ask_user",
    description:
      "Ask the user a clarifying question via the terminal. Use sparingly — only when a decision cannot be made without their input. Do not use this for questions you can resolve via web_search or your own judgment.",
    input_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "A single, focused question for the user.",
        },
      },
      required: ["question"],
    },
  },
];

function safeFilename(name: string): string {
  if (!isFlatMarkdownFilename(name) || name === "context-summary.md") {
    throw new Error(`Invalid filename: ${name}`);
  }
  return name;
}

export async function handleToolUse(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<string> {
  const args = input as Record<string, string>;
  switch (name) {
    case "save_artifact": {
      const filename = safeFilename(args.filename);
      const filepath = path.join(ctx.workdir, filename);
      await fs.writeFile(filepath, args.content, "utf8");
      return `Saved ${args.content.length} chars to ${filepath}`;
    }
    case "read_artifact": {
      const filename = safeFilename(args.filename);
      const filepath = path.join(ctx.workdir, filename);
      try {
        const content = await fs.readFile(filepath, "utf8");
        return content;
      } catch (e) {
        return `ERROR: could not read ${filename}: ${(e as Error).message}`;
      }
    }
    case "list_artifacts": {
      const entries = await fs.readdir(ctx.workdir);
      const md = entries.filter((f) => f.endsWith(".md")).sort();
      if (md.length === 0) return "No artifacts saved yet.";
      return md.join("\n");
    }
    case "ask_user": {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      console.log("\n[agent → user]");
      const answer = await rl.question(`${args.question}\n> `);
      rl.close();
      return answer.trim() || "(no answer provided)";
    }
    default:
      return `ERROR: unknown tool ${name}`;
  }
}
