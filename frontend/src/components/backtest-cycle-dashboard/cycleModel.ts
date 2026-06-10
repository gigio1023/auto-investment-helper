import type {
  V1PilotSystemStatus,
  V1SystemStage,
  V1SystemStageScope,
  V1SystemStageStatus,
} from "../../types/v1Pilot";

export type CycleLane =
  | "research"
  | "data"
  | "alpha"
  | "validation"
  | "execution"
  | "learning"
  | "deferred";

export type CycleGate = "parallel" | "single-writer" | "deferred";

export interface CycleStageDefinition {
  key: string;
  label: string;
  lane: CycleLane;
  gate: CycleGate;
  sourceStageKey?: string;
  detail: string;
  command: string;
}

export interface CycleStageView extends CycleStageDefinition {
  status: V1SystemStageStatus;
  scope: V1SystemStageScope;
  blocksCurrentMilestone: boolean;
  artifactSummary: string;
  blockers: string[];
  refs: string[];
}

export interface CycleMetric {
  label: string;
  value: string;
  tone: "neutral" | "positive" | "warning" | "danger";
}

export const CYCLE_STAGES: CycleStageDefinition[] = [
  {
    key: "hypothesis_registry",
    label: "Hypothesis Registry",
    lane: "research",
    gate: "parallel",
    sourceStageKey: "hypothesis_registry",
    detail: "Stored research articles become testable strategy hypotheses.",
    command: "bun --cwd=backend run lincei -- research corpus",
  },
  {
    key: "variant_evidence",
    label: "Variant Evidence",
    lane: "research",
    gate: "parallel",
    sourceStageKey: "variant_evidence",
    detail: "Ablation, backtest, and Cloud-import variants are retained.",
    command: "bun --cwd=backend run lincei -- research selected-run-bias",
  },
  {
    key: "feature_store",
    label: "Point-in-Time Features",
    lane: "data",
    gate: "parallel",
    sourceStageKey: "feature_store",
    detail: "Numeric and text-derived features cite availability time.",
    command: "bun --cwd=backend run lincei -- alpha run",
  },
  {
    key: "semantic_data",
    label: "Text-Derived Features",
    lane: "data",
    gate: "parallel",
    detail: "Macro/news/filing text becomes replayable LLM-derived features.",
    command:
      "bun --cwd=backend run lincei -- data semantic-evidence --limit 80",
  },
  {
    key: "alpha_decisions",
    label: "Alpha Decisions",
    lane: "alpha",
    gate: "parallel",
    sourceStageKey: "alpha_decisions",
    detail: "Numeric, LLM-derived, and meta alpha decisions stay typed.",
    command: "bun --cwd=backend run lincei -- alpha run",
  },
  {
    key: "active_llm_agent",
    label: "Active LLM Agent",
    lane: "execution",
    gate: "single-writer",
    sourceStageKey: "active_llm_agent",
    detail: "LLM forecasts become risk-gated shadow and paper evidence.",
    command:
      "bun --cwd=backend run lincei -- agent decide --json && bun --cwd=backend run lincei -- agent shadow --json && bun --cwd=backend run lincei -- agent paper --json",
  },
  {
    key: "lean_backtest",
    label: "LEAN Backtest",
    lane: "validation",
    gate: "parallel",
    sourceStageKey: "lean_backtest",
    detail: "LEAN artifacts prove executable strategy behavior.",
    command:
      "bun --cwd=backend run lincei -- lean full-backtest --skip-alpha-cycle --skip-market-data-ingest --no-download-data",
  },
  {
    key: "cloud_import",
    label: "QuantConnect Cloud Import",
    lane: "validation",
    gate: "parallel",
    sourceStageKey: "cloud_import",
    detail: "Cloud backtest results anchor promotion evidence.",
    command:
      "bun --cwd=backend run lincei -- qc import-backtest --project-id <project-id> --backtest-id <backtest-id>",
  },
  {
    key: "portfolio_targets",
    label: "Portfolio Targets",
    lane: "execution",
    gate: "single-writer",
    sourceStageKey: "portfolio_targets",
    detail: "LEAN insights become one canonical target snapshot.",
    command: "bun --cwd=backend run lincei -- lean import latest",
  },
  {
    key: "paper_execution",
    label: "Paper Trading / Shadow Trading",
    lane: "execution",
    gate: "single-writer",
    sourceStageKey: "paper_execution",
    detail: "Targets become paper or shadow trading execution artifacts.",
    command:
      "bun --cwd=backend run lincei -- paper run && bun --cwd=backend run lincei -- shadow run",
  },
  {
    key: "broker_read_only",
    label: "Broker Read-Only",
    lane: "execution",
    gate: "single-writer",
    sourceStageKey: "broker_read_only",
    detail: "Read-only broker snapshots reconcile observed account state.",
    command: "bun --cwd=backend run lincei -- broker status",
  },
  {
    key: "open_orders",
    label: "Open Orders",
    lane: "execution",
    gate: "single-writer",
    sourceStageKey: "open_orders",
    detail: "Unknown or mismatched broker order state blocks advancement.",
    command: "bun --cwd=backend run lincei -- preflight run",
  },
  {
    key: "preflight",
    label: "Pre-Trade Risk Check",
    lane: "execution",
    gate: "single-writer",
    sourceStageKey: "live_preflight",
    detail: "Unknown, stale, or unsafe state stays blocked.",
    command: "bun --cwd=backend run lincei -- preflight run",
  },
  {
    key: "learning",
    label: "Learning Loop",
    lane: "learning",
    gate: "single-writer",
    detail: "Outcomes feed promotion, rejection, and model review.",
    command: "bun --cwd=backend run lincei -- learning run",
  },
  {
    key: "broker_write_spec",
    label: "Broker-Write Spec",
    lane: "deferred",
    gate: "deferred",
    sourceStageKey: "broker_write_spec",
    detail: "Account mutation needs a future user-approved spec.",
    command: "deferred",
  },
  {
    key: "self_funded_capital",
    label: "Self-Funded Capital Allocation",
    lane: "deferred",
    gate: "deferred",
    sourceStageKey: "self_funded_capital",
    detail: "Own-capital trading waits for promotion and reconciliation.",
    command: "deferred",
  },
  {
    key: "darwinex_zero",
    label: "Darwinex/Zero Track Record",
    lane: "deferred",
    gate: "deferred",
    sourceStageKey: "darwinex_zero",
    detail: "External-capital fees wait for a defensible track record.",
    command: "deferred",
  },
];

export const CYCLE_RUNBOOK = [
  {
    label: "Build hypothesis and variant ledger",
    command:
      "bun --cwd=backend run lincei -- research corpus && bun --cwd=backend run lincei -- research selected-run-bias",
    evidence:
      "research hypotheses, retained variants, multiple-testing bias blockers",
  },
  {
    label: "Refresh point-in-time features",
    command:
      "bun --cwd=backend run lincei -- data semantic-evidence --limit 80 && bun --cwd=backend run lincei -- alpha run",
    evidence: "feature snapshots, LLM-derived features, alpha decisions",
  },
  {
    label: "Run local LEAN smoke",
    command:
      "bun --cwd=backend run lincei -- lean full-backtest --skip-alpha-cycle --skip-market-data-ingest --no-download-data",
    evidence:
      "local LEAN artifacts, portfolio target import, paper-cycle blocker",
  },
  {
    label: "Import QuantConnect Cloud artifacts",
    command:
      "bun --cwd=backend run lincei -- qc list-backtests --project-id <project-id> --limit 10 && bun --cwd=backend run lincei -- qc import-backtest --project-id <project-id> --backtest-id <backtest-id>",
    evidence: "Cloud statistics, insights, orders, fills, hashes, blockers",
  },
  {
    label: "Advance single-writer evidence",
    command:
      "bun --cwd=backend run lincei -- paper run && bun --cwd=backend run lincei -- shadow run && bun --cwd=backend run lincei -- preflight run",
    evidence:
      "paper trading artifacts, shadow trading record, fail-closed pre-trade risk check",
  },
  {
    label: "Run active LLM paper arena",
    command:
      "bun --cwd=backend run lincei -- agent decide --json && bun --cwd=backend run lincei -- agent shadow --json && bun --cwd=backend run lincei -- agent paper --json",
    evidence:
      "active LLM decisions, risk-gated shadow, paper plan, reconciliation",
  },
  {
    label: "Review promotion state",
    command: "bun --cwd=backend run lincei -- learning run",
    evidence: "promotion decision, outcome labels, remaining blockers",
  },
];

export const buildCycleStages = (
  status: V1PilotSystemStatus | null,
): CycleStageView[] =>
  CYCLE_STAGES.map((stage) => {
    const sourceStage = findSourceStage(status, stage.sourceStageKey);
    const derived = deriveStageStatus(status, stage);
    return {
      ...stage,
      status: sourceStage?.status ?? derived.status,
      scope: sourceStage?.scope ?? derived.scope,
      blocksCurrentMilestone:
        sourceStage?.blocksCurrentMilestone ?? derived.blocksCurrentMilestone,
      artifactSummary: sourceStage?.detail ?? derived.artifactSummary,
      blockers: sourceStage?.blockers ?? derived.blockers,
      refs: sourceStage?.refs ?? derived.refs,
    };
  });

export const buildCycleMetrics = (
  status: V1PilotSystemStatus | null,
): CycleMetric[] => [
  {
    label: "Current Milestone",
    value: status?.currentMilestone.verdict ?? "missing",
    tone: statusTone(status?.currentMilestone.verdict),
  },
  {
    label: "Current Stages",
    value: status
      ? `${status.currentMilestone.readyStageCount}/${status.currentMilestone.currentStageCount}`
      : `0/${CYCLE_STAGES.filter((stage) => stage.gate !== "deferred").length}`,
    tone: status?.currentMilestone.verdict === "ready" ? "positive" : "warning",
  },
  {
    label: "Variants",
    value: status
      ? `${status.research.variantJobCount} total / ${status.research.failedOrBlockedVariantJobCount} rejected`
      : "0 total",
    tone:
      status && status.research.variantJobCount >= 3 ? "positive" : "warning",
  },
  {
    label: "Cloud Import",
    value: status?.cloudRun?.runId ?? "missing",
    tone: status?.cloudRun ? "positive" : "warning",
  },
  {
    label: "Alpha N/L/M",
    value: status
      ? `${status.alpha.numericDecisionCount}/${status.alpha.llmDecisionCount}/${status.alpha.metaDecisionCount}`
      : "0/0/0",
    tone:
      status &&
      status.alpha.numericDecisionCount > 0 &&
      status.alpha.llmDecisionCount > 0 &&
      status.alpha.metaDecisionCount > 0
        ? "positive"
        : "warning",
  },
  {
    label: "Paper / Shadow",
    value: paperMetricValue(status),
    tone:
      status?.paper.reconciliationStatus === "matched" ? "positive" : "warning",
  },
  {
    label: "Active Agent",
    value: activeAgentMetricValue(status),
    tone:
      status?.activeAgent?.paperReconciliationStatus === "matched"
        ? "positive"
        : status?.activeAgent?.runId
          ? "warning"
          : "danger",
  },
  {
    label: "Pre-Trade Check",
    value: status?.preflight.status ?? "blocked",
    tone: status?.preflight.status === "ready" ? "positive" : "danger",
  },
];

export const splitCycleStages = (stages: CycleStageView[]) => ({
  parallel: stages.filter((stage) => stage.gate === "parallel"),
  singleWriter: stages.filter((stage) => stage.gate === "single-writer"),
  deferred: stages.filter((stage) => stage.gate === "deferred"),
});

export const currentMilestoneBlockers = (stages: CycleStageView[]): string[] =>
  [
    ...new Set(
      stages
        .filter(
          (stage) => stage.blocksCurrentMilestone && stage.status !== "ready",
        )
        .flatMap((stage) =>
          (stage.blockers.length
            ? stage.blockers
            : [stage.artifactSummary]
          ).map((blocker) => `${stage.label}: ${blocker}`),
        ),
    ),
  ].slice(0, 6);

const statusTone = (
  status: V1SystemStageStatus | undefined,
): CycleMetric["tone"] => {
  if (status === "ready") {
    return "positive";
  }
  if (status === "blocked") {
    return "danger";
  }
  return "warning";
};

const paperMetricValue = (status: V1PilotSystemStatus | null): string => {
  if (!status) {
    return "missing";
  }
  if (status.paper.planId) {
    return `${status.paper.status}/${status.paper.reconciliationStatus ?? "unknown"}`;
  }
  if (status.paper.replayPlanId) {
    return `replay/${status.paper.replayReconciliationStatus ?? "unknown"}`;
  }
  return "missing";
};

const activeAgentMetricValue = (status: V1PilotSystemStatus | null): string => {
  if (!status?.activeAgent?.runId) {
    return "missing";
  }
  return `${status.activeAgent.proposedDecisionCount}/${status.activeAgent.decisionCount} decisions / ${status.activeAgent.paperReconciliationStatus ?? "paper missing"}`;
};

const findSourceStage = (
  status: V1PilotSystemStatus | null,
  sourceStageKey: string | undefined,
): V1SystemStage | undefined =>
  sourceStageKey
    ? status?.stages.find((stage) => stage.key === sourceStageKey)
    : undefined;

const deriveStageStatus = (
  status: V1PilotSystemStatus | null,
  stage: CycleStageDefinition,
): {
  status: V1SystemStageStatus;
  scope: V1SystemStageScope;
  blocksCurrentMilestone: boolean;
  artifactSummary: string;
  blockers: string[];
  refs: string[];
} => {
  if (!status) {
    return {
      status: "missing",
      scope: stage.gate === "deferred" ? "deferred" : "current",
      blocksCurrentMilestone: stage.gate !== "deferred",
      artifactSummary: "Status API has not returned yet.",
      blockers: ["Load /v1-pilot/status."],
      refs: [],
    };
  }

  if (stage.key === "semantic_data") {
    return status.alpha.llmDecisionCount > 0
      ? {
          status: "ready",
          scope: "current",
          blocksCurrentMilestone: true,
          artifactSummary: `${status.alpha.llmDecisionCount} LLM-derived alpha decisions available`,
          blockers: [],
          refs: status.alpha.latestAlphaAsOf
            ? [status.alpha.latestAlphaAsOf]
            : [],
        }
      : {
          status: "blocked",
          scope: "current",
          blocksCurrentMilestone: true,
          artifactSummary: "No LLM-derived alpha decisions are available yet.",
          blockers: ["Ingest timestamped text evidence and rerun alpha."],
          refs: [],
        };
  }

  if (stage.key === "learning") {
    const ready =
      status.cloudRun &&
      status.portfolioTarget.targetCount > 0 &&
      status.paper.reconciliationStatus === "matched";
    return ready
      ? {
          status: "ready",
          scope: "current",
          blocksCurrentMilestone: true,
          artifactSummary: "Learning loop can review retained evidence.",
          blockers: [],
          refs: status.leanRun?.runId ? [status.leanRun.runId] : [],
        }
      : {
          status: "blocked",
          scope: "current",
          blocksCurrentMilestone: true,
          artifactSummary:
            "Learning loop waits for Cloud import, targets, and current paper/shadow artifacts.",
          blockers: status.nextActions.slice(0, 2),
          refs: [],
        };
  }

  return {
    status: stage.gate === "deferred" ? "missing" : "missing",
    scope: stage.gate === "deferred" ? "deferred" : "current",
    blocksCurrentMilestone: stage.gate !== "deferred",
    artifactSummary: "No mapped artifacts.",
    blockers: [],
    refs: [],
  };
};
