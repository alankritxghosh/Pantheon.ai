import http from "http";
import https from "https";
import { URL } from "url";

export interface OllamaStreamEvent {
  message?: { content?: string };
  response?: string;
  error?: string;
}

export interface OllamaStreamResult {
  content: string;
  raw: string;
  events: number;
  firstTokenMs: number | null;
  totalMs: number;
}

export interface OllamaHttpOptions {
  timeoutMs: number;
  firstTokenTimeoutMs: number;
  onLog?: (message: string) => void;
}

export class OllamaTransportError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "connection"
      | "http-status"
      | "first-token-timeout"
      | "call-timeout"
      | "malformed-json"
      | "model-error",
    public readonly raw = "",
  ) {
    super(message);
    this.name = "OllamaTransportError";
  }
}

export async function postOllamaJsonStream(
  baseUrl: string,
  pathname: string,
  payload: unknown,
  options: OllamaHttpOptions,
): Promise<OllamaStreamResult> {
  const startedAt = Date.now();
  const url = new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const body = JSON.stringify(payload);
  const client = url.protocol === "https:" ? https : http;
  let raw = "";
  let content = "";
  let events = 0;
  let firstTokenMs: number | null = null;
  let streamStarted = false;

  options.onLog?.(`ollama http: request start ${url.toString()}`);

  return new Promise((resolve, reject) => {
    let settled = false;
    let firstTokenTimer: NodeJS.Timeout | null = null;
    let callTimer: NodeJS.Timeout | null = null;
    let req: http.ClientRequest;

    const cleanup = () => {
      if (firstTokenTimer) clearTimeout(firstTokenTimer);
      if (callTimer) clearTimeout(callTimer);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      req.destroy();
      reject(error);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const totalMs = Date.now() - startedAt;
      options.onLog?.(`ollama http: stream complete total_ms=${totalMs} events=${events}`);
      resolve({ content, raw, events, firstTokenMs, totalMs });
    };
    const startFirstTokenTimer = () => {
      if (firstTokenTimer) return;
      firstTokenTimer = setTimeout(() => {
        options.onLog?.(`ollama http: first token timeout ${options.firstTokenTimeoutMs}ms`);
        fail(
          new OllamaTransportError(
            `Ollama first token timeout after ${options.firstTokenTimeoutMs}ms`,
            "first-token-timeout",
            raw,
          ),
        );
      }, options.firstTokenTimeoutMs);
    };
    const parseOrFail = (line: string): OllamaStreamEvent | null => {
      try {
        return parseStreamEvent(line, raw);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
        return null;
      }
    };

    req = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const headersMs = Date.now() - startedAt;
        options.onLog?.(`ollama http: headers received status=${res.statusCode} headers_ms=${headersMs}`);

        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          let errorBody = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            errorBody += chunk;
          });
          res.on("end", () => {
            fail(
              new OllamaTransportError(
                `Ollama request failed with HTTP ${res.statusCode}: ${errorBody.slice(0, 500)}`,
                "http-status",
                errorBody,
              ),
            );
          });
          return;
        }

        res.setEncoding("utf8");
        let buffer = "";
        res.on("data", (chunk) => {
          streamStarted = true;
          buffer += chunk;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            raw += `${line}\n`;
            const event = parseOrFail(line);
            if (!event) return;
            if (event.error) {
              fail(new OllamaTransportError(`Ollama model error: ${event.error}`, "model-error", raw));
              return;
            }
            const delta = event.message?.content ?? event.response ?? "";
            if (delta && firstTokenMs === null) {
              firstTokenMs = Date.now() - startedAt;
              if (firstTokenTimer) clearTimeout(firstTokenTimer);
              firstTokenTimer = null;
              options.onLog?.(`ollama http: first token received first_token_ms=${firstTokenMs}`);
            }
            content += delta;
            events++;
          }
        });
        res.on("end", () => {
          const tail = buffer.trim();
          if (tail) {
            raw += `${tail}\n`;
            const event = parseOrFail(tail);
            if (!event) return;
            if (event.error) {
              fail(new OllamaTransportError(`Ollama model error: ${event.error}`, "model-error", raw));
              return;
            }
            const delta = event.message?.content ?? event.response ?? "";
            if (delta && firstTokenMs === null) {
              firstTokenMs = Date.now() - startedAt;
              options.onLog?.(`ollama http: first token received first_token_ms=${firstTokenMs}`);
            }
            content += delta;
            events++;
          }
          finish();
        });
        res.on("error", (error) => {
          fail(new OllamaTransportError(`Ollama stream error: ${error.message}`, "connection", raw));
        });
      },
    );

    callTimer = setTimeout(() => {
      options.onLog?.(`ollama http: full call timeout ${options.timeoutMs}ms`);
      fail(
        new OllamaTransportError(
          `Ollama call timeout after ${options.timeoutMs}ms`,
          "call-timeout",
          raw,
        ),
      );
    }, options.timeoutMs);

    req.on("error", (error) => {
      fail(new OllamaTransportError(`Ollama connection error: ${error.message}`, "connection", raw));
    });
    req.write(body, () => {
      options.onLog?.("ollama http: request body sent");
      startFirstTokenTimer();
    });
    req.end();
  });
}

function parseStreamEvent(line: string, raw: string): OllamaStreamEvent {
  try {
    return JSON.parse(line) as OllamaStreamEvent;
  } catch {
    throw new OllamaTransportError(
      `Ollama returned malformed JSON stream event: ${line.slice(0, 200)}`,
      "malformed-json",
      raw,
    );
  }
}
