const ARTIFACT_TYPES = [
  "system-design",
  "prd",
  "eval-plan",
  "launch-plan",
  "competitive",
  "personas-jtbd",
  "roadmap",
  "decision-packet",
  "product-vision",
  "opportunity-scorecard",
  "risk-review",
  "evidence-ledger",
  "unknown",
] as const;

type ArtifactType = (typeof ARTIFACT_TYPES)[number];

interface Heuristic {
  type: ArtifactType;
  patterns: RegExp[];
}

const FILENAME_HEURISTICS: Heuristic[] = [
  { type: "system-design", patterns: [/\bsystem[-_\s]?design\b/i, /\bdesign[-_\s]?doc\b/i, /\barchitecture\b/i] },
  { type: "prd", patterns: [/\bprd\b/i, /\brfc\b/i, /\bspec\b/i, /\brequirements?\b/i, /\bproduct[-_\s]?requirements?\b/i] },
  { type: "eval-plan", patterns: [/\bevals?\b/i, /\bevaluation\b/i, /\btest[-_\s]?plan\b/i] },
  { type: "launch-plan", patterns: [/\blaunch\b/i, /\bgo[-_\s]?to[-_\s]?market\b/i, /\bgtm\b/i] },
  { type: "competitive", patterns: [/\bcompetitive\b/i, /\bcompetitor\b/i, /\balternatives?\b/i] },
  { type: "personas-jtbd", patterns: [/\bpersonas?\b/i, /\bjtbd\b/i, /\bjobs[-_\s]?to[-_\s]?be[-_\s]?done\b/i] },
  { type: "roadmap", patterns: [/\broadmap\b/i] },
  { type: "decision-packet", patterns: [/\bdecision[-_\s]?packet\b/i, /\bleadership[-_\s]?packet\b/i] },
  { type: "product-vision", patterns: [/\bvision\b/i, /\bstrategy\b/i, /\bpr[-_\s]?faq\b/i, /\b6[-_\s]?pager\b/i] },
  { type: "opportunity-scorecard", patterns: [/\bopportunity\b/i, /\bscorecard\b/i] },
  { type: "risk-review", patterns: [/\brisk[-_\s]?review\b/i, /\brisk\b/i] },
  { type: "evidence-ledger", patterns: [/\bevidence[-_\s]?ledger\b/i, /\bevidence\b/i] },
];

const CONTENT_HEURISTICS: Heuristic[] = [
  {
    type: "system-design",
    patterns: [/#\s*system design/i, /\barchitecture\b/i, /\bdetailed design\b/i, /\bdata flow\b/i, /\bnon-goals\b/i],
  },
  {
    type: "product-vision",
    patterns: [/\bworking backwards\b/i, /\bpr\/faq\b/i, /\btenets\b/i, /\bproduct thesis\b/i, /\bwhy now\b/i],
  },
  {
    type: "prd",
    patterns: [/#\s*prd\b/i, /\bproduct requirements\b/i, /\buser stories\b/i, /\bacceptance criteria\b/i],
  },
  {
    type: "eval-plan",
    patterns: [/\beval plan\b/i, /\bship gates?\b/i, /\bgolden set\b/i, /\brubric\b/i],
  },
  {
    type: "launch-plan",
    patterns: [/\bbeta cohort\b/i, /\bactivation\b/i, /\brollback\b/i, /\bpricing\b/i],
  },
  {
    type: "competitive",
    patterns: [/\bcompetitive analysis\b/i, /\bcompetitor\b/i, /\balternatives?\b/i],
  },
  {
    type: "personas-jtbd",
    patterns: [/\bpersona\b/i, /\bjtbd\b/i, /\bjobs to be done\b/i],
  },
  {
    type: "roadmap",
    patterns: [/\broadmap\b/i, /\bphase 1\b/i, /\bphase 2\b/i],
  },
  {
    type: "decision-packet",
    patterns: [/\brecommendation\b/i, /\bnext decision\b/i, /\bleadership\b/i],
  },
  {
    type: "opportunity-scorecard",
    patterns: [/\bscoring criteria\b/i, /\bwinner rationale\b/i, /\bopportunity scorecard\b/i],
  },
  {
    type: "risk-review",
    patterns: [/\brisk review\b/i, /\bseverity\b/i, /\blikelihood\b/i, /\bmitigation\b/i],
  },
  {
    type: "evidence-ledger",
    patterns: [/\bconfirmed\b/i, /\binference\b/i, /\bassumption\b/i, /\bevidence gap\b/i],
  },
];

export function classifyArtifactType(filename: string, content: string): string {
  const normalizedFilename = filename.toLowerCase();
  const filenameMatch = firstHeuristicMatch(normalizedFilename, FILENAME_HEURISTICS);
  if (filenameMatch) {
    return filenameMatch;
  }

  const head = content.slice(0, 1000);
  const contentMatch = firstHeuristicMatch(head, CONTENT_HEURISTICS);
  if (contentMatch) {
    return contentMatch;
  }

  return "unknown";
}

function firstHeuristicMatch(value: string, heuristics: Heuristic[]): ArtifactType | null {
  for (const heuristic of heuristics) {
    if (heuristic.patterns.some((pattern) => pattern.test(value))) {
      return heuristic.type;
    }
  }
  return null;
}
