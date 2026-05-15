export type Provider = "anthropic" | "claude-cli" | "openai-cli" | "gemini-cli" | "ollama" | "fixture";

export interface ResolvedModel {
  provider: Provider;
  model: string;
  alias?: string;
}

const MODEL_ALIASES: Record<string, ResolvedModel> = {
  default: {
    provider: "ollama",
    model: "qwen3:14b",
    alias: "default",
  },
  local: {
    provider: "ollama",
    model: "qwen3:14b",
    alias: "local",
  },
  fast: {
    provider: "ollama",
    model: "qwen2.5:7b",
    alias: "fast",
  },
  best: {
    provider: "ollama",
    model: "qwen3:30b",
    alias: "best",
  },
  flagship: {
    provider: "ollama",
    model: "qwen3-coder:30b",
    alias: "flagship",
  },
  gemini: {
    provider: "gemini-cli",
    model: "gemini-3.1-pro-preview",
    alias: "gemini",
  },
};

const PROVIDER_DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: "claude-opus-4-7",
  "claude-cli": "claude-opus-4-7",
  "openai-cli": "gpt-5.5",
  "gemini-cli": "gemini-3.1-pro-preview",
  ollama: "qwen3:14b",
  fixture: "fixture-stub",
};

export function resolveModel(provider: Provider | "", requestedModel = ""): ResolvedModel {
  const envModel = process.env.PANTHEON_MODEL ?? "";
  const modelInput = requestedModel || envModel;

  if (modelInput && MODEL_ALIASES[modelInput]) {
    return MODEL_ALIASES[modelInput];
  }

  const resolvedProvider = provider || "ollama";
  const providerEnvModel =
    resolvedProvider === "claude-cli"
      ? process.env.CLAUDE_MODEL
      : resolvedProvider === "openai-cli"
        ? process.env.OPENAI_MODEL
        : resolvedProvider === "gemini-cli"
          ? process.env.GEMINI_MODEL
          : resolvedProvider === "ollama"
            ? process.env.OLLAMA_MODEL
            : undefined;

  return {
    provider: resolvedProvider,
    model: modelInput || providerEnvModel || PROVIDER_DEFAULT_MODELS[resolvedProvider],
  };
}

export function modelAliasesForHelp(): string {
  return Object.entries(MODEL_ALIASES)
    .map(([alias, value]) => `${alias}=${value.provider}/${value.model}`)
    .join(", ");
}
