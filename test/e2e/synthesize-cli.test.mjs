import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile, mkdir, cp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const CLI = path.join(repoRoot, "dist", "index.js");
const FIXTURE_DIR = path.join(repoRoot, "test", "fixtures", "llm-recordings", "synthesize");
const DEMO_WORKSPACE = path.join(repoRoot, "test-fixtures", "demo-context-yc");

async function makeIsolatedWorkspace() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "pantheon-e2e-"));
  await cp(DEMO_WORKSPACE, tmp, { recursive: true });
  // Drop any prior outputs the demo fixture may carry.
  await rm(path.join(tmp, "pantheon-output"), { recursive: true, force: true });
  return tmp;
}

function runCli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [CLI, ...args], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`pantheon synthesize timed out; stderr was: ${stderr.slice(-500)}`));
    }, 60_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

test("pantheon synthesize runs end-to-end against demo workspace with fixture provider", async () => {
  const workspace = await makeIsolatedWorkspace();
  try {
    const { code, stdout, stderr } = await runCli(["synthesize", workspace], {
      PANTHEON_PROVIDER: "fixture",
      PANTHEON_FIXTURE_DIR: FIXTURE_DIR,
    });
    assert.equal(code, 0, `CLI exited non-zero; stderr was: ${stderr.slice(-500)}`);
    assert.match(stdout, /Top 3 opportunities:/, `stdout missing top-3 summary; stdout was: ${stdout}`);
    assert.match(stdout, /MCP-native synthesis layer/, "top opportunity missing from stdout");
    assert.match(stdout, /score: 9\.2\/10/, "top opportunity score missing from stdout");
    assert.match(stdout, /Full artifacts written to/, "stdout missing artifact location pointer");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("pantheon synthesize produces exactly the four-artifact subset", async () => {
  const workspace = await makeIsolatedWorkspace();
  try {
    const { code, stderr } = await runCli(["synthesize", workspace], {
      PANTHEON_PROVIDER: "fixture",
      PANTHEON_FIXTURE_DIR: FIXTURE_DIR,
    });
    assert.equal(code, 0, `CLI exited non-zero; stderr was: ${stderr.slice(-500)}`);

    const latestDir = path.join(workspace, "pantheon-output", "latest");
    for (const artifact of [
      "evidence-ledger.md",
      "product-vision.md",
      "competitive-deconstruction.md",
      "opportunity-scorecard.md",
    ]) {
      const content = await readFile(path.join(latestDir, artifact), "utf8");
      assert.ok(content.length > 0, `${artifact} should not be empty`);
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("pantheon synthesize --top 1 emits a single-opportunity summary", async () => {
  const workspace = await makeIsolatedWorkspace();
  try {
    const { code, stdout } = await runCli(["synthesize", workspace, "--top", "1"], {
      PANTHEON_PROVIDER: "fixture",
      PANTHEON_FIXTURE_DIR: FIXTURE_DIR,
    });
    assert.equal(code, 0);
    assert.match(stdout, /Top 1 opportunity:/);
    assert.match(stdout, /MCP-native synthesis layer/);
    assert.doesNotMatch(stdout, /Cited research synthesis from raw blobs/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("pantheon synthesize --top with invalid value exits non-zero with helpful message", async () => {
  const workspace = await makeIsolatedWorkspace();
  try {
    const { code, stderr } = await runCli(["synthesize", workspace, "--top", "0"], {
      PANTHEON_PROVIDER: "fixture",
      PANTHEON_FIXTURE_DIR: FIXTURE_DIR,
    });
    assert.notEqual(code, 0, "expected non-zero exit on invalid --top");
    assert.match(stderr, /--top expects an integer between 1 and 10/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("pantheon synthesize on a non-existent directory fails clearly", async () => {
  const bogus = path.join(os.tmpdir(), `pantheon-bogus-${Date.now()}`);
  const { code, stderr } = await runCli(["synthesize", bogus], {
    PANTHEON_PROVIDER: "fixture",
    PANTHEON_FIXTURE_DIR: FIXTURE_DIR,
  });
  assert.notEqual(code, 0);
  assert.match(stderr, /synthesize target is not a directory/);
});
