type EmbedProvider = "ollama" | "openai" | "anthropic";

const OLLAMA_EMBED_MODEL = "nomic-embed-text";
const OPENAI_EMBED_MODEL = "text-embedding-3-small";
const OPENAI_BATCH_SIZE = 100;

interface OllamaEmbeddingResponse {
  embedding?: number[];
  error?: string;
}

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
  error?: { message?: string };
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const provider = embedProvider();
  if (provider === "anthropic") {
    throw new Error("PANTHEON_EMBED_PROVIDER=anthropic is not yet supported because Anthropic does not currently expose an embeddings API.");
  }
  if (provider === "openai") {
    return embedTextsWithOpenAI(texts);
  }
  return embedTextsWithOllama(texts);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aMagnitude += a[i] * a[i];
    bMagnitude += b[i] * b[i];
  }

  if (aMagnitude === 0 || bMagnitude === 0) {
    return 0;
  }
  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

export function embeddingDimension(): number {
  return embedProvider() === "openai" ? 1536 : 768;
}

export function embeddingProviderName(): string {
  return embedProvider();
}

async function embedTextsWithOllama(texts: string[]): Promise<number[][]> {
  const baseUrl = ollamaBaseUrl();
  const vectors: number[][] = [];

  for (const text of texts) {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text }),
      });
    } catch {
      throw ollamaEmbeddingError(baseUrl);
    }

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`${ollamaEmbeddingError(baseUrl).message} Ollama returned HTTP ${response.status}: ${body.slice(0, 300)}`);
    }

    let parsed: OllamaEmbeddingResponse;
    try {
      parsed = JSON.parse(body) as OllamaEmbeddingResponse;
    } catch {
      throw new Error(`${ollamaEmbeddingError(baseUrl).message} Ollama returned non-JSON output.`);
    }

    if (parsed.error) {
      throw new Error(`${ollamaEmbeddingError(baseUrl).message} Ollama error: ${parsed.error}`);
    }
    if (!parsed.embedding) {
      throw new Error(`${ollamaEmbeddingError(baseUrl).message} Ollama response did not include an embedding.`);
    }
    vectors.push(validateVector(parsed.embedding));
  }

  return vectors;
}

async function embedTextsWithOpenAI(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required when PANTHEON_EMBED_PROVIDER=openai.");
  }

  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += OPENAI_BATCH_SIZE) {
    const batch = texts.slice(i, i + OPENAI_BATCH_SIZE);
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: OPENAI_EMBED_MODEL, input: batch }),
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI embeddings request failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
    }

    let parsed: OpenAIEmbeddingResponse;
    try {
      parsed = JSON.parse(body) as OpenAIEmbeddingResponse;
    } catch {
      throw new Error("OpenAI embeddings API returned non-JSON output.");
    }

    if (parsed.error?.message) {
      throw new Error(`OpenAI embeddings API error: ${parsed.error.message}`);
    }
    const embeddings = parsed.data?.map((entry) => entry.embedding).filter((vector): vector is number[] => Array.isArray(vector));
    if (!embeddings || embeddings.length !== batch.length) {
      throw new Error("OpenAI embeddings API returned an unexpected number of embeddings.");
    }
    vectors.push(...embeddings.map(validateVector));
  }

  return vectors;
}

function embedProvider(): EmbedProvider {
  const provider = (process.env.PANTHEON_EMBED_PROVIDER ?? "ollama").toLowerCase();
  if (provider === "ollama" || provider === "openai" || provider === "anthropic") {
    return provider;
  }
  throw new Error(`Unknown PANTHEON_EMBED_PROVIDER "${provider}". Use ollama, openai, or anthropic.`);
}

function ollamaBaseUrl(): string {
  return (process.env.OLLAMA_HOST ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
}

function ollamaEmbeddingError(baseUrl: string): Error {
  return new Error(
    `Could not reach Ollama at ${baseUrl}. Is Ollama running and is the nomic-embed-text model pulled? Run: ollama pull nomic-embed-text`,
  );
}

function validateVector(vector: number[]): number[] {
  if (vector.length !== embeddingDimension()) {
    throw new Error(
      `Embedding dimension mismatch for provider ${embeddingProviderName()}: expected ${embeddingDimension()}, got ${vector.length}.`,
    );
  }
  return vector;
}
