import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BacktestCycleDashboard from "./BacktestCycleDashboard";

vi.mock("../services/api", () => ({
  v1PilotApi: {
    getStatus: vi.fn(() =>
      Promise.resolve({
        checkedAt: "2026-05-26T07:12:56.000Z",
        verdict: "blocked",
        currentMilestone: {
          key: "self-funded-capital-evidence",
          label: "Self-Funded Capital Evidence Milestone",
          verdict: "blocked",
          readyStageCount: 6,
          blockedStageCount: 2,
          missingStageCount: 1,
          currentStageCount: 9,
          deferredStageCount: 3,
        },
        leanRun: {
          runId: "qc-import-ecd033aae81e",
          status: "passed",
          projectName: "aggressive_llm_momentum",
          runtime: "quantconnect-cloud",
          cloudProjectId: "32077023",
          cloudBacktestId: "bt-1",
        },
        cloudRun: {
          runId: "qc-import-ecd033aae81e",
          status: "passed",
          projectName: "aggressive_llm_momentum",
          runtime: "quantconnect-cloud",
          cloudProjectId: "32077023",
          cloudBacktestId: "bt-1",
        },
        alpha: {
          featureSnapshotCount: 12,
          numericDecisionCount: 12,
          llmDecisionCount: 8,
          metaDecisionCount: 8,
          latestFeatureAsOf: "2025-12-31T16:00:00.000Z",
          latestAlphaAsOf: "2025-12-31T16:00:00.000Z",
          mlModelStatus: "ready",
          mlModelName: "lgbm-baseline",
        },
        research: {
          hypothesisCount: 40,
          p1CandidateCount: 15,
          outOfScopeCount: 6,
          latestJobId: "research-job-hypothesis-extraction-1",
          latestJobStatus: "passed",
          latestJobType: "hypothesis-extraction",
          variantJobCount: 4,
          passedVariantJobCount: 2,
          failedOrBlockedVariantJobCount: 2,
        },
        portfolioTarget: {
          id: "target-1",
          leanRunId: "qc-import-ecd033aae81e",
          targetCount: 6,
          grossExposurePct: 95,
          maxSingleNamePct: 20,
        },
        paper: {
          planId: 42,
          status: "filled",
          reconciliationStatus: "matched",
          fillCount: 6,
        },
        broker: {
          provider: "toss",
          snapshotStatus: "missing",
          openOrderCount: 0,
        },
        livePilot: { realOrderSent: false },
        preflight: {
          status: "blocked",
          checkedAt: "2026-05-26T07:12:56.000Z",
          maxPilotNotionalUsd: 10,
          broker: "toss",
          blockers: ["Broker writes require a future approved spec."],
          requiredFlags: {},
          openOrderRefs: [],
          credentialMode: "missing",
        },
        stages: [
          {
            key: "lean_backtest",
            label: "LEAN Backtest",
            status: "ready",
            scope: "current",
            blocksCurrentMilestone: true,
            detail: "qc-import-ecd033aae81e / passed",
            blockers: [],
            refs: ["qc-import-ecd033aae81e"],
          },
          {
            key: "live_preflight",
            label: "Pre-Trade Risk Check",
            status: "blocked",
            scope: "current",
            blocksCurrentMilestone: true,
            detail: "blocked",
            blockers: ["Broker writes require a future approved spec."],
            refs: [],
          },
        ],
        nextActions: [
          "Resolve Pre-Trade Risk Check: Broker writes require a future approved spec.",
        ],
      }),
    ),
  },
}));

describe("BacktestCycleDashboard", () => {
  it("renders_backtest_cycle_status_and_runbook", async () => {
    render(<BacktestCycleDashboard />);

    expect(
      screen.getByRole("heading", {
        name: "Self-Funded Capital Evidence Loop",
      }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getAllByText("qc-import-ecd033aae81e").length,
      ).toBeGreaterThan(0);
    });

    expect(
      screen.getAllByText("QuantConnect Cloud Import").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Operator Runbook")).toBeInTheDocument();
    expect(
      screen.getAllByText("bun --cwd=backend run lincei -- learning run")
        .length,
    ).toBeGreaterThan(0);
  });
});
