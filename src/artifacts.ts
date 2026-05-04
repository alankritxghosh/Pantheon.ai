import type { STANDARD_PACKET_ARTIFACTS } from "./validator.js";

export type StandardArtifact = (typeof STANDARD_PACKET_ARTIFACTS)[number];

export interface ArtifactSpec {
  filename: StandardArtifact;
  purpose: string;
  requiredSections: string[];
  dependencies: StandardArtifact[];
}

export const ARTIFACT_SPECS: ArtifactSpec[] = [
  {
    filename: "evidence-ledger.md",
    purpose: "Ground the run in source evidence from the workspace folder.",
    requiredSections: [
      "Evidence categories with Confirmed/Public signal/Inference/Assumption/Evidence gap labels",
      "Direct source-file references",
      "Contradictions and confidence",
      "What evidence would change the decision",
    ],
    dependencies: [],
  },
  {
    filename: "product-vision.md",
    purpose: "Define the product thesis, ICP, wedge, principles, and non-directions.",
    requiredSections: ["Thesis", "ICP", "Wedge", "Why now", "Differentiation", "Principles", "Non-directions"],
    dependencies: ["evidence-ledger.md"],
  },
  {
    filename: "user-personas-jtbd.md",
    purpose: "Describe target personas and jobs-to-be-done without claiming unvalidated stories are proven.",
    requiredSections: ["Primary persona", "Secondary personas", "JTBD", "Pain/current workaround", "Adoption blockers"],
    dependencies: ["evidence-ledger.md", "product-vision.md"],
  },
  {
    filename: "competitive-deconstruction.md",
    purpose: "Compare practical alternatives and extract implications for Pantheon.",
    requiredSections: ["Alternatives", "Strengths", "Weaknesses", "Why users choose them", "Why they fail", "Implications"],
    dependencies: ["evidence-ledger.md", "product-vision.md"],
  },
  {
    filename: "opportunity-scorecard.md",
    purpose: "Score 5-7 possible wedges and explain why the chosen wedge wins.",
    requiredSections: ["Scoring criteria", "5-7 wedges", "Score table", "Winner rationale", "Rejected alternatives"],
    dependencies: ["evidence-ledger.md", "product-vision.md", "competitive-deconstruction.md"],
  },
  {
    filename: "prd-v1.md",
    purpose: "Write the V1 PRD with scope, user stories, metrics, RAI/privacy constraints, and acceptance criteria.",
    requiredSections: [
      "Problem",
      "Target user/JTBD",
      "User stories with evidence status",
      "In scope",
      "Out of scope",
      "UX/workflow",
      "Metrics and counter-metrics",
      "RAI/privacy",
      "Acceptance criteria",
    ],
    dependencies: ["evidence-ledger.md", "user-personas-jtbd.md", "opportunity-scorecard.md"],
  },
  {
    filename: "system-design.md",
    purpose: "Design the technical workflow and provider/model layer without stale model claims.",
    requiredSections: [
      "Architecture choice",
      "Components",
      "Data flow",
      "Provider/model capability tier",
      "Context/retrieval",
      "Validation",
      "Privacy/permissions",
      "Observability/failure modes",
      "Rejected alternatives",
    ],
    dependencies: ["evidence-ledger.md", "prd-v1.md"],
  },
  {
    filename: "evals.md",
    purpose: "Define ship gates, golden sets, judges, adversarial tests, and regression bars.",
    requiredSections: ["Ship gates", "Golden set", "Rubrics", "Current judge model/capability", "Adversarial suite", "Regression bars", "Owners"],
    dependencies: ["evidence-ledger.md", "prd-v1.md", "system-design.md"],
  },
  {
    filename: "roadmap.md",
    purpose: "Lay out a phased roadmap with goals, dependencies, risks, exit criteria, and deferred scope.",
    requiredSections: ["Phase 1", "Phase 2", "Phase 3", "Phase 4", "Dependencies", "Risks", "Exit criteria"],
    dependencies: ["product-vision.md", "prd-v1.md", "system-design.md", "evals.md"],
  },
  {
    filename: "launch-plan.md",
    purpose: "Plan beta, activation, pricing, distribution, feedback loops, limits, and rollback triggers.",
    requiredSections: ["ICP", "Beta cohort", "Activation", "Aha moment", "Pricing", "Distribution", "Feedback loops", "Rollback"],
    dependencies: ["product-vision.md", "prd-v1.md", "roadmap.md"],
  },
  {
    filename: "risk-review.md",
    purpose: "Cover product, technical, data/privacy, RAI, security/abuse, GTM, competitive, and operational risks.",
    requiredSections: ["Product risks", "Technical risks", "Data/privacy", "RAI", "Security/abuse", "GTM", "Competitive", "Operational"],
    dependencies: ["evidence-ledger.md", "prd-v1.md", "system-design.md", "evals.md", "launch-plan.md"],
  },
  {
    filename: "decision-packet.md",
    purpose: "One-screen leadership packet under 500 words.",
    requiredSections: ["Recommendation", "Why now", "Why this wedge", "Top risks", "Asks", "Next decision"],
    dependencies: ["opportunity-scorecard.md", "prd-v1.md", "risk-review.md", "launch-plan.md"],
  },
  {
    filename: "quality-report.md",
    purpose: "Validation-aware self-review that agrees with deterministic validation results.",
    requiredSections: ["Readiness verdict", "Artifact scorecard", "Validation failures", "Evidence gaps", "Top fixes"],
    dependencies: [
      "evidence-ledger.md",
      "product-vision.md",
      "user-personas-jtbd.md",
      "competitive-deconstruction.md",
      "opportunity-scorecard.md",
      "prd-v1.md",
      "system-design.md",
      "evals.md",
      "roadmap.md",
      "launch-plan.md",
      "risk-review.md",
      "decision-packet.md",
    ],
  },
];
