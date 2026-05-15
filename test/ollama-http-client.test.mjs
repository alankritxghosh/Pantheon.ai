import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { postOllamaJsonStream } from "../dist/ollama/http-client.js";

async function withServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function request(baseUrl, overrides = {}) {
  return postOllamaJsonStream(
    baseUrl,
    "/api/chat",
    {
      model: "test",
      stream: true,
      messages: [{ role: "user", content: "hello" }],
      options: { num_ctx: 4096 },
    },
    { timeoutMs: 500, firstTokenTimeoutMs: 50, ...overrides },
  );
}

test("postOllamaJsonStream concatenates streamed chat content", async () => {
  await withServer((req, res) => {
    assert.equal(req.url, "/api/chat");
    res.writeHead(200, { "content-type": "application/x-ndjson" });
    res.write(`${JSON.stringify({ message: { content: "hel" } })}\n`);
    res.write(`${JSON.stringify({ message: { content: "lo" } })}\n`);
    res.end();
  }, async (baseUrl) => {
    const result = await request(baseUrl);
    assert.equal(result.content, "hello");
    assert.equal(result.events, 2);
    assert.match(result.raw, /hel/);
    assert.ok(result.firstTokenMs !== null);
  });
});

test("postOllamaJsonStream reports first-token timeout explicitly", async () => {
  await withServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/x-ndjson" });
  }, async (baseUrl) => {
    await assert.rejects(
      request(baseUrl, { timeoutMs: 500, firstTokenTimeoutMs: 20 }),
      (error) => {
        assert.equal(error.name, "OllamaTransportError");
        assert.equal(error.code, "first-token-timeout");
        assert.match(error.message, /first token timeout/i);
        return true;
      },
    );
  });
});

test("postOllamaJsonStream reports HTTP status and response body", async () => {
  await withServer((_req, res) => {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("boom");
  }, async (baseUrl) => {
    await assert.rejects(request(baseUrl), (error) => {
      assert.equal(error.name, "OllamaTransportError");
      assert.equal(error.code, "http-status");
      assert.match(error.message, /HTTP 500/);
      assert.match(error.message, /boom/);
      return true;
    });
  });
});

test("postOllamaJsonStream preserves raw malformed stream JSON", async () => {
  await withServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/x-ndjson" });
    res.write("{not-json}\n");
    res.end();
  }, async (baseUrl) => {
    await assert.rejects(request(baseUrl), (error) => {
      assert.equal(error.name, "OllamaTransportError");
      assert.equal(error.code, "malformed-json");
      assert.match(error.raw, /\{not-json\}/);
      return true;
    });
  });
});

test("postOllamaJsonStream surfaces model error events", async () => {
  await withServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/x-ndjson" });
    res.write(`${JSON.stringify({ error: "bad model" })}\n`);
    res.end();
  }, async (baseUrl) => {
    await assert.rejects(request(baseUrl), (error) => {
      assert.equal(error.name, "OllamaTransportError");
      assert.equal(error.code, "model-error");
      assert.match(error.message, /bad model/);
      return true;
    });
  });
});
