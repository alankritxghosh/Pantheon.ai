#!/usr/bin/env node
import "./env.js";
import fs from "fs/promises";
import path from "path";
import { runAgent } from "./agent.js";
import { writeRunMetrics, type RunMetric } from "./briefs/briefs.js";
import { runCliAgent, type CliProvider } from "./cli-agent.js";
import { modelAliasesForHelp, resolveModel, type Provider } from "./models.js";
import { runOllamaAgent } from "./ollama-agent.js";
import { formatDoctorReport, runDoctor } from "./health/doctor.js";
import { regenerateQualityReport, rescueFailedArtifacts, runArtifactPipeline, runSynthesizePipeline } from "./pipeline.js";
import { SYNTHESIZE_ARTIFACTS } from "./artifacts.js";
import { parseOpportunityScorecard, renderTopN } from "./cli-output/synthesize-summary.js";
import { learnStyle } from "./style/learn-style.js";
import { runCitationAudit, writeCitationsReport } from "./citations.js";
import { STANDARD_PACKET_ARTIFACTS, validateRunFolder, writeValidationAwareQualityReport } from "./validator.js";
import {
  buildWorkspaceContext,
  buildWorkspaceRunBrief,
  makeWorkspaceOutputPaths,
  mirrorRunToLatest,
  renderDeterministicContextSummary,
  type WorkspaceContext,
} from "./workspace.js";

type Mode = "freeform" | "packet" | "critique" | "run" | "learn-style" | "doctor" | "synthesize";

interface ParsedArgs {
  mode: Mode;
  brief: string;
  workdir: string;
  provider: Provider | "";
  model: string;
  targetDir: string;
  company: string;
  embedProvider: string;
  topN: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let workdir = "";
  let providerInput = process.env.PANTHEON_PROVIDER ?? "";
  let model = "";
  let mode: Mode = "freeform";
  let targetDir = "";
  let company = "";
  let embedProvider = process.env.PANTHEON_EMBED_PROVIDER ?? "";
  let topN = 3;
  const briefParts: string[] = [];
  let sawCommand = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--out" || a === "-o") {
      workdir = args[++i] ?? "";
    } else if (a === "--provider" || a === "-p") {
      providerInput = args[++i] ?? "";
    } else if (a === "--model" || a === "-m") {
      model = args[++i] ?? "";
    } else if (a === "--brief-file" || a === "-f") {
      briefParts.push(`@FILE:${args[++i]}`);
    } else if (a === "--company") {
      company = args[++i] ?? "";
    } else if (a === "--embed-provider") {
      embedProvider = args[++i] ?? "";
    } else if (a === "--top") {
      const raw = args[++i] ?? "";
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10) {
        throw new Error(`--top expects an integer between 1 and 10; got "${raw}"`);
      }
      topN = parsed;
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else if (
      !sawCommand &&
      (a === "packet" ||
        a === "critique" ||
        a === "run" ||
        a === "learn-style" ||
        a === "doctor" ||
        a === "synthesize")
    ) {
      sawCommand = true;
      mode = a;
    } else if ((mode === "critique" || mode === "learn-style" || mode === "synthesize") && !targetDir) {
      targetDir = a;
    } else {
      briefParts.push(a);
    }
  }

  const provider = providerInput ? normalizeProvider(providerInput) : "";
  return { mode, brief: briefParts.join(" "), workdir, provider, model, targetDir, company, embedProvider, topN };
}

function normalizeProvider(value: string): Provider {
  switch (value) {
    case "":
    case "anthropic":
    case "anthropic-sdk":
      return "anthropic";
    case "claude":
    case "claude-cli":
      return "claude-cli";
    case "openai":
    case "openai-cli":
      return "openai-cli";
    case "gemini":
    case "gemini-cli":
      return "gemini-cli";
    case "ollama":
      return "ollama";
    case "fixture":
      return "fixture";
    default:
      throw new Error(
        `Unknown provider "${value}". Use anthropic, claude-cli, openai-cli, gemini-cli, ollama, or fixture.`,
      );
  }
}

function printHelp() {
  console.log(`pantheon — open-source agentic AI Product Manager

Usage:
  pantheon run [--model <alias-or-id>] [--provider <provider>]
  pantheon learn-style <dir> [--company <name>]
  pantheon "<brief>" [--out <dir>] [--model <alias-or-id>] [--provider <provider>]
  pantheon --brief-file <path> [--out <dir>] [--model <alias-or-id>] [--provider <provider>]
  pantheon packet "<product/topic>" [--out <dir>] [--model <alias-or-id>] [--provider <provider>]
  pantheon critique <run-folder> [--model <alias-or-id>] [--provider <provider>]

Primary folder-native workflow:

  cd /path/to/product-context
  pantheon run
  pantheon run --model fast
  pantheon run --model best
  pantheon learn-style ./style-samples --company "Acme"

Pantheon treats the current folder as context and writes outputs to:

  pantheon-output/latest/
  pantheon-output/runs/<timestamp>/

Advanced brief-based examples:

  pantheon "Deconstruct Cursor and propose its next AI feature."
  pantheon "User: small B2B SaaS founders. Problem: churn. Scope a feature."
  pantheon -f brief.md -o ./runs/cursor-2026-04
  pantheon --provider claude-cli "Scope an AI feature for B2B SaaS churn."
  pantheon --provider gemini-cli "Create evals for an AI support copilot."
  pantheon --provider openai-cli "Turn this idea into a decision packet."
  pantheon packet "Cursor for Product Managers" -o ./runs/cursor-for-pms
  pantheon critique ./runs/cursor-for-pms
  pantheon learn-style ./style-samples --company "Acme"

Output:
  pantheon run writes Markdown artifacts into ./pantheon-output/.
  Brief and packet modes write Markdown artifacts into --out (default: ./runs/<timestamp>).

Env:
  PANTHEON_PROVIDER  optional default provider: anthropic, claude-cli, openai-cli, gemini-cli, ollama (default: ollama)
  PANTHEON_MODEL     optional default model or alias
  OLLAMA_BASE_URL    optional Ollama URL, default: http://localhost:11434
  OLLAMA_MODEL       optional model override for provider=ollama
  ANTHROPIC_API_KEY  required only for provider=anthropic

Model aliases:
  ${modelAliasesForHelp()}
`);
}

async function resolveBrief(brief: string): Promise<string> {
  const parts = brief.split(/\s+/);
  const resolved: string[] = [];
  for (const p of parts) {
    if (p.startsWith("@FILE:")) {
      const file = p.slice("@FILE:".length);
      resolved.push(await fs.readFile(file, "utf8"));
    } else {
      resolved.push(p);
    }
  }
  return resolved.join(" ").trim();
}

function buildPacketBrief(topic: string): string {
  return `Create the standard Pantheon product packet for: ${topic}

Current run date: ${new Date().toISOString().slice(0, 10)}.

Use the current Pantheon standard. Build around the existing product context the user gives, do not invent unnecessary process. Produce a complete but practical packet with these artifacts:

1. evidence-ledger.md — evidence labels: Confirmed, Public signal, Inference, Assumption, Evidence gap.
2. product-vision.md — product thesis, target users, wedge, why now, differentiation from generic AI tools.
3. user-personas-jtbd.md — primary/secondary personas, jobs-to-be-done, pains, current alternatives.
4. competitive-deconstruction.md — practical competitor/alternative analysis.
5. opportunity-scorecard.md — 5-7 possible wedges, scored, with why the chosen wedge wins.
6. prd-v1.md — crisp v1 PRD with problem, scope, user stories, metrics, non-goals, RAI constraints.
7. system-design.md — architecture, model/provider layer, data flow, permissions/privacy, observability.
8. evals.md — golden sets, rubrics, judges, regression bars, adversarial evals, and ship gates.
9. roadmap.md — phased roadmap from current workflow to productized experience.
10. launch-plan.md — beta plan, ICP, activation, pricing hypothesis, distribution, feedback loops.
11. risk-review.md — product, technical, data/privacy, RAI, GTM, and competitive risks with mitigations.
12. decision-packet.md — one-screen leadership packet under 500 words.
13. quality-report.md — self-review of the packet: readiness score, evidence strength, eval rigor, decision clarity, missing evidence, validation failures, and top fixes.

Quality bar:
- Make this useful for a founder/PM building the product, not generic PRD filler.
- Keep the standard realistic; it can be raised later once the product is a product.
- If browsing or sources are unavailable, label unsupported claims as assumptions or evidence gaps.
- Treat model names, provider capabilities, context windows, pricing, release dates, and benchmarks as time-sensitive. Do not use stale examples such as Claude 3.5 Sonnet or Gemini 1.5 Pro as current recommendations. Prefer capability tiers unless a specific current model is user-provided, runtime-provided, or verified from current official docs/changelogs.
- Critique your own artifacts once before finalizing and fix obvious failures.

Hard depth requirements:
- Do not produce shallow outline files. The packet is failed if most artifacts are only 5-20 lines.
- Every artifact except decision-packet.md must have 4+ meaningful sections and enough section-level depth to stand alone.
- Minimum useful depth by artifact:
  - evidence-ledger.md: 12+ labeled evidence items across Confirmed, Public signal, Inference, Assumption, Evidence gap.
  - product-vision.md: thesis, ICP, wedge, why-now, differentiation, principles, non-directions.
  - user-personas-jtbd.md: 3+ personas with triggers, pains, current workarounds, adoption blockers, JTBD.
  - competitive-deconstruction.md: 5+ alternatives/competitor categories with implications.
  - opportunity-scorecard.md: 5-7 wedges scored across pain, evidence, leverage, feasibility, risk, why-now.
  - prd-v1.md: problem, target user, user stories, scope, non-goals, UX flow, metrics, counter-metrics, RAI/privacy, open questions, acceptance criteria.
  - system-design.md: architecture, components, data flow, provider/model layer, retrieval/context, validator, privacy, observability, failure modes, rejected alternatives.
  - evals.md: ship-gate summary, golden set, rubrics, current judge model/capability tier, adversarial tests, regression bars, cadence/owners, numeric thresholds.
  - roadmap.md: 4+ phases with goals, capabilities, dependencies, risks, exit criteria, deferred scope.
  - launch-plan.md: ICP, beta cohort, activation, aha moment, pricing, distribution, feedback loop, limits, rollback triggers.
  - risk-review.md: severity/likelihood/mitigation/owner for product, tech, data/privacy, RAI, security/abuse, GTM, competitive, operational risks.
  - quality-report.md: score every artifact, call out failed depth checks, and mark demo readiness.
- decision-packet.md remains under 500 words.
- If you cannot meet the depth floor, explicitly mark the packet "Not demo-ready" in quality-report.md.`;
}

async function buildCritiqueBrief(targetDir: string): Promise<string> {
  const dir = path.resolve(targetDir);
  const entries = await fs.readdir(dir);
  const mdFiles = entries.filter((entry) => entry.endsWith(".md")).sort();
  if (mdFiles.length === 0) {
    throw new Error(`No Markdown artifacts found in ${dir}`);
  }

  const sections = await Promise.all(
    mdFiles.map(async (filename) => {
      const content = await fs.readFile(path.join(dir, filename), "utf8");
      return `# File: ${filename}\n\n${content}`;
    }),
  );

  return `Review this Pantheon run folder as a skeptical senior AI product-review reader.

Write exactly one artifact: quality-report.md.

The quality report must include:
- overall readiness verdict
- scorecard for evidence strength, product clarity, PRD completeness, system-design realism, eval rigor, roadmap realism, launch/GTM clarity, risk coverage, decision-packet quality
- concrete findings with file-specific references
- missing artifacts or missing sections
- claims that need evidence labels or citations
- the top 5 fixes before this packet is used as a product demo
- whether the run meets the current Pantheon standard

Be direct. Do not rewrite every artifact. Focus on what must improve.

Artifacts to review:

${sections.join("\n\n---\n\n")}`;
}

async function main() {
  const {
    mode,
    brief: rawBrief,
    workdir: workdirArg,
    provider: providerArg,
    model: modelArg,
    targetDir,
    company,
    embedProvider,
    topN,
  } = parseArgs(process.argv);

  if (mode === "doctor") {
    const resolved = resolveModel(providerArg, modelArg);
    const report = await runDoctor({
      provider: resolved.provider,
      model: resolved.model,
      embedProvider: embedProvider || undefined,
    });
    console.log(formatDoctorReport(report));
    process.exit(report.allPass ? 0 : 1);
  }

  if (mode === "learn-style") {
    if (!targetDir) {
      console.error("ERROR: learn-style requires a style sample folder, e.g. pantheon learn-style ./style-samples");
      process.exit(1);
    }
    if (rawBrief) {
      console.error("ERROR: pantheon learn-style takes one folder argument plus optional --company.");
      process.exit(1);
    }

    const profile = await learnStyle(targetDir, process.cwd(), company ? { company } : {});
    console.error(
      `[pantheon] learn-style: learned ${Object.keys(profile.artifactStyles).length} artifact style${Object.keys(profile.artifactStyles).length === 1 ? "" : "s"}`,
    );
    return;
  }

  if (mode === "synthesize") {
    if (rawBrief) {
      console.error("ERROR: pantheon synthesize takes an optional folder path plus --top N. It is not a brief mode.");
      process.exit(1);
    }
    await runSynthesizeMode({
      workspaceDir: path.resolve(targetDir || process.cwd()),
      providerArg,
      modelArg,
      embedProvider,
      topN,
    });
    return;
  }

  const resolvedModel = resolveModel(providerArg, modelArg);
  const provider = resolvedModel.provider;
  const model = resolvedModel.model;

  if ((mode === "freeform" || mode === "packet") && !rawBrief) {
    printHelp();
    process.exit(1);
  }
  if (mode === "run" && rawBrief) {
    console.error("ERROR: pantheon run is folder-native and does not take a prompt. Put context files in the current folder and run `pantheon run`.");
    process.exit(1);
  }
  if (mode === "run" && workdirArg) {
    console.error("ERROR: pantheon run writes to ./pantheon-output inside the current folder. Do not pass --out.");
    process.exit(1);
  }
  if (mode === "critique" && !targetDir) {
    console.error("ERROR: critique requires a run folder, e.g. pantheon critique ./runs/my-run");
    process.exit(1);
  }
  if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY not set. Copy .env.example to .env.");
    process.exit(1);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const workspaceDir = process.cwd();

  if (mode === "run") {
    const preflight = await runDoctor({
      provider,
      model,
      embedProvider: embedProvider || undefined,
      workspaceDir,
    });
    if (!preflight.allPass) {
      console.error(formatDoctorReport(preflight));
      console.error(
        "Cannot start pantheon run until the above failures are resolved. Run `pantheon doctor` anytime to re-check.",
      );
      process.exit(1);
    }
  }

  const workspacePaths = mode === "run" ? makeWorkspaceOutputPaths(workspaceDir, stamp) : null;
  const workdir = path.resolve(
    mode === "run"
      ? workspacePaths?.runDir ?? ""
      : mode === "critique"
        ? workdirArg || targetDir
        : workdirArg || `./runs/${stamp}`,
  );
  await fs.mkdir(workdir, { recursive: true });

  const resolvedBrief = await resolveBrief(rawBrief);
  let deterministicContextSummary = "";
  let runWorkspaceFiles: string[] = [];
  let runWorkspaceContext: WorkspaceContext | undefined;
  const brief =
    mode === "packet"
      ? buildPacketBrief(resolvedBrief)
      : mode === "critique"
        ? await buildCritiqueBrief(targetDir)
        : mode === "run"
          ? await buildRunBrief(workspaceDir).then((result) => {
              deterministicContextSummary = result.contextSummary;
              runWorkspaceFiles = result.workspaceFiles;
              runWorkspaceContext = result.workspaceContext;
              return result.brief;
            })
          : resolvedBrief;

  if (mode === "run" && deterministicContextSummary) {
    await fs.writeFile(path.join(workdir, "context-summary.md"), deterministicContextSummary, "utf8");
  }

  console.error(`[pantheon] mode: ${mode}`);
  if (mode === "run") {
    console.error(`[pantheon] workspace: ${workspaceDir}`);
  }
  console.error(`[pantheon] workdir: ${workdir}`);
  console.error(`[pantheon] provider: ${provider}`);
  console.error(`[pantheon] model: ${model}${resolvedModel.alias ? ` (${resolvedModel.alias})` : ""}`);
  console.error(`[pantheon] brief: ${brief.slice(0, 200)}${brief.length > 200 ? "..." : ""}`);
  console.error("---");

  let invalidArtifactNames: string[] = [];
  let runMetrics: RunMetric[] = [];
  if (mode === "run") {
    const result = await runArtifactPipeline({ provider, model, workdir, workspaceBrief: brief, workspaceContext: runWorkspaceContext });
    invalidArtifactNames = result.invalidArtifactNames;
    runMetrics = result.metrics;
  } else if (provider === "anthropic") {
    await runAgent(brief, { workdir });
  } else if (provider === "ollama") {
    const result = await runOllamaAgent(brief, { workdir, model });
    invalidArtifactNames = result.invalidArtifactNames;
  } else {
    const result = await runCliAgent(brief, { workdir, provider: provider as CliProvider, model });
    invalidArtifactNames = result.invalidArtifactNames;
  }

  if (mode === "packet" || mode === "critique" || mode === "run") {
    const validationStart = Date.now();
    let validation = await validateRunFolder(workdir, {
      invalidArtifactNames,
      allowedExtraMarkdownFiles: mode === "run" ? ["context-summary.md", "evidence-report.md", "evidence-clusters.md", "run-metrics.md"] : [],
    });
    if (mode === "run") {
      runMetrics.push(metric("validation", undefined, validationStart, validation.passed ? "pass" : "fail"));
    }

    if (mode === "run" && !validation.passed) {
      const failedChecks = validation.checks.filter((check) => check.failures.length > 0);
      if (failedChecks.length > 0 && failedChecks.length <= 3) {
        const rescue = await rescueFailedArtifacts(
          { provider, model, workdir, workspaceBrief: brief, workspaceContext: runWorkspaceContext },
          failedChecks,
        );
        invalidArtifactNames = [...new Set([...invalidArtifactNames, ...rescue.invalidArtifactNames])];
        validation = await validateRunFolder(workdir, {
          invalidArtifactNames,
          allowedExtraMarkdownFiles: ["context-summary.md", "evidence-report.md", "evidence-clusters.md", "run-metrics.md"],
        });
        // The model review inside quality-report.md was generated before this
        // rescue pass. Regenerate it so it reflects the same post-rescue state
        // as the deterministic header (otherwise the report contradicts itself).
        const regenInvalid = await regenerateQualityReport(
          { provider, model, workdir, workspaceBrief: brief, workspaceContext: runWorkspaceContext },
          validation.checks,
          new Set(failedChecks.map((check) => check.filename)),
        );
        invalidArtifactNames = [...new Set([...invalidArtifactNames, ...regenInvalid])];
        validation = await validateRunFolder(workdir, {
          invalidArtifactNames,
          allowedExtraMarkdownFiles: ["context-summary.md", "evidence-report.md", "evidence-clusters.md", "run-metrics.md"],
        });
      } else if (failedChecks.length > 3) {
        console.error(`[pantheon] rescue: skipped because ${failedChecks.length} artifacts failed; max final rescue is 3`);
      }
    }

    if (mode === "run") {
      await writeValidationAwareQualityReport(workdir, validation);
      validation = await validateRunFolder(workdir, {
        invalidArtifactNames,
        allowedExtraMarkdownFiles: ["context-summary.md", "evidence-report.md", "evidence-clusters.md", "run-metrics.md"],
      });
      await writeValidationAwareQualityReport(workdir, validation);

      // Informational citation-resolution pass. Never blocks the run.
      const citationStart = Date.now();
      const citationAudit = await runCitationAudit(workdir, STANDARD_PACKET_ARTIFACTS, runWorkspaceFiles);
      const citationsReportPath = await writeCitationsReport(workdir, citationAudit);
      runMetrics.push(metric("citations", undefined, citationStart, "pass", `${citationAudit.totalResolved}/${citationAudit.totalCitations} resolved`));
      console.error(
        `[pantheon] citations: ${citationAudit.totalCitations} cited, ${citationAudit.totalResolved} resolved, ${citationAudit.totalUnresolved} unresolved, ${citationAudit.totalMalformed} malformed`,
      );
      console.error(`[pantheon] citations report: ${citationsReportPath}`);
    }

    console.error(
      `[pantheon] validation: ${validation.passed ? "pass" : "fail"} (${validation.demoReady ? "Demo-ready" : "Not demo-ready"})`,
    );
    if (validation.missingArtifacts.length > 0) {
      console.error(`[pantheon] missing artifacts: ${validation.missingArtifacts.join(", ")}`);
    }
    if (validation.shallowArtifacts.length > 0) {
      console.error(`[pantheon] shallow artifacts: ${validation.shallowArtifacts.join(", ")}`);
    }
    if (validation.invalidArtifactNames.length > 0) {
      console.error(`[pantheon] invalid artifact filenames: ${validation.invalidArtifactNames.join(", ")}`);
    }
    console.error(`[pantheon] validation report: ${validation.reportPath}`);
  }

  if (mode === "run" && workspacePaths) {
    const mirrorStart = Date.now();
    await mirrorRunToLatest(workdir, workspacePaths.latestDir);
    runMetrics.push(metric("mirror", undefined, mirrorStart, "pass"));
    await writeRunMetrics(workdir, runMetrics);
    await fs.copyFile(path.join(workdir, "run-metrics.md"), path.join(workspacePaths.latestDir, "run-metrics.md"));
    console.error(`[pantheon] latest mirror: ${workspacePaths.latestDir}`);
  }

  console.error(`---\n[pantheon] artifacts in: ${workdir}`);
}

interface SynthesizeOptions {
  workspaceDir: string;
  providerArg: Provider | "";
  modelArg: string;
  embedProvider: string;
  topN: number;
}

async function runSynthesizeMode(opts: SynthesizeOptions): Promise<void> {
  const resolved = resolveModel(opts.providerArg, opts.modelArg);
  const provider = resolved.provider;
  const model = resolved.model;

  const workspaceStat = await fs.stat(opts.workspaceDir).catch(() => null);
  if (!workspaceStat || !workspaceStat.isDirectory()) {
    console.error(`ERROR: synthesize target is not a directory: ${opts.workspaceDir}`);
    process.exit(1);
  }

  const preflight = await runDoctor({
    provider,
    model,
    embedProvider: opts.embedProvider || undefined,
    workspaceDir: opts.workspaceDir,
  });
  if (!preflight.allPass) {
    console.error(formatDoctorReport(preflight));
    console.error(
      "Cannot start pantheon synthesize until the above failures are resolved. Run `pantheon doctor` to re-check.",
    );
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const workspacePaths = makeWorkspaceOutputPaths(opts.workspaceDir, stamp);
  const workdir = path.resolve(workspacePaths.runDir);
  await fs.mkdir(workdir, { recursive: true });

  const { brief, contextSummary, workspaceContext } = await buildRunBrief(opts.workspaceDir);
  if (contextSummary) {
    await fs.writeFile(path.join(workdir, "context-summary.md"), contextSummary, "utf8");
  }

  console.error("[pantheon] mode: synthesize");
  console.error(`[pantheon] workspace: ${opts.workspaceDir}`);
  console.error(`[pantheon] workdir: ${workdir}`);
  console.error(`[pantheon] provider: ${provider}`);
  console.error(`[pantheon] model: ${model}${resolved.alias ? ` (${resolved.alias})` : ""}`);
  console.error(`[pantheon] artifacts: ${SYNTHESIZE_ARTIFACTS.join(", ")}`);
  console.error("---");

  const synthStart = Date.now();
  const result = await runSynthesizePipeline({
    provider,
    model,
    workdir,
    workspaceBrief: brief,
    workspaceContext,
  });
  const runMetrics: RunMetric[] = [...result.metrics];

  let invalidArtifactNames = result.invalidArtifactNames;
  const validationStart = Date.now();
  let validation = await validateRunFolder(workdir, {
    invalidArtifactNames,
    allowedExtraMarkdownFiles: ["context-summary.md", "evidence-report.md", "evidence-clusters.md", "run-metrics.md"],
    requiredArtifacts: SYNTHESIZE_ARTIFACTS,
  });
  runMetrics.push({
    phase: "validation",
    artifact: undefined,
    durationMs: Date.now() - validationStart,
    status: validation.passed ? "pass" : "fail",
  });

  if (!validation.passed) {
    console.error(
      `[pantheon] synthesize validation: ${validation.passed ? "pass" : "fail"}; missing=${validation.missingArtifacts.join(", ") || "-"}; shallow=${validation.shallowArtifacts.join(", ") || "-"}`,
    );
    console.error(`[pantheon] validation report: ${validation.reportPath}`);
  } else {
    console.error(`[pantheon] synthesize validation: pass (${validation.reportPath})`);
  }

  await mirrorRunToLatest(workdir, workspacePaths.latestDir);
  await writeRunMetrics(workdir, runMetrics);
  await fs.copyFile(
    path.join(workdir, "run-metrics.md"),
    path.join(workspacePaths.latestDir, "run-metrics.md"),
  );

  const scorecardPath = path.join(workspacePaths.latestDir, "opportunity-scorecard.md");
  const scorecard = await fs.readFile(scorecardPath, "utf8").catch(() => "");
  const ranked = parseOpportunityScorecard(scorecard);
  console.error(`---\n[pantheon] synthesize complete in ${Math.round((Date.now() - synthStart) / 1000)}s`);
  console.log(renderTopN(ranked, { topN: opts.topN }));
}

async function buildRunBrief(
  workspaceDir: string,
): Promise<{ brief: string; contextSummary: string; workspaceFiles: string[]; workspaceContext: WorkspaceContext }> {
  const workspaceContext = await buildWorkspaceContext(workspaceDir);
  const contextSummary = renderDeterministicContextSummary(workspaceContext);
  return {
    brief: buildWorkspaceRunBrief(workspaceContext),
    contextSummary,
    workspaceFiles: workspaceContext.supportedFiles.map((file) => file.relativePath),
    workspaceContext,
  };
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.message : e);
  process.exit(1);
});

function metric(
  phase: string,
  artifact: string | undefined,
  startedAt: number,
  status: string,
  detail?: string,
): RunMetric {
  return { phase, artifact, durationMs: Date.now() - startedAt, status, detail };
}
