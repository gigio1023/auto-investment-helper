import type { LivePilotPreflightContract } from './contracts/v1-pilot.contracts';

export type V1SystemStageStatus = 'ready' | 'blocked' | 'missing';
export type V1SystemStageScope = 'current' | 'deferred';

export interface V1SystemStage {
  key: string;
  label: string;
  status: V1SystemStageStatus;
  scope: V1SystemStageScope;
  blocksCurrentMilestone: boolean;
  detail: string;
  blockers: string[];
  refs: string[];
}

export interface V1CurrentMilestoneStatus {
  key: 'self-funded-capital-evidence';
  label: string;
  verdict: V1SystemStageStatus;
  readyStageCount: number;
  blockedStageCount: number;
  missingStageCount: number;
  currentStageCount: number;
  deferredStageCount: number;
}

export interface V1PilotSystemStatus {
  checkedAt: string;
  verdict: V1SystemStageStatus;
  currentMilestone: V1CurrentMilestoneStatus;
  leanRun: {
    runId: string;
    status: string;
    projectName: string;
    runtime: string;
    cloudProjectId?: string;
    cloudBacktestId?: string;
  } | null;
  cloudRun: {
    runId: string;
    status: string;
    projectName: string;
    runtime: 'quantconnect-cloud';
    cloudProjectId?: string;
    cloudBacktestId?: string;
  } | null;
  alpha: {
    featureSnapshotCount: number;
    numericDecisionCount: number;
    llmDecisionCount: number;
    metaDecisionCount: number;
    latestFeatureAsOf?: string;
    latestAlphaAsOf?: string;
    mlModelStatus: string;
    mlModelName?: string;
    mlBlocker?: string;
  };
  research: {
    hypothesisCount: number;
    p1CandidateCount: number;
    outOfScopeCount: number;
    latestJobId?: string;
    latestJobStatus?: string;
    latestJobType?: string;
    variantJobCount: number;
    passedVariantJobCount: number;
    failedOrBlockedVariantJobCount: number;
    latestVariantJobId?: string;
    latestVariantJobStatus?: string;
    latestVariantJobType?: string;
  };
  portfolioTarget: {
    id?: string;
    leanRunId?: string;
    targetCount: number;
    grossExposurePct?: number;
    maxSingleNamePct?: number;
  };
  paper: {
    planId?: number | string;
    status: string;
    reconciliationStatus?: string;
    fillCount: number;
    replayPlanId?: number | string;
    replayStatus?: string;
    replayReconciliationStatus?: string;
    replayFillCount?: number;
  };
  activeAgent: {
    runId?: string;
    runStatus: string;
    strategyVariant?: string;
    decisionCount: number;
    proposedDecisionCount: number;
    blockedDecisionCount: number;
    abstainedDecisionCount: number;
    labeledForecastCount: number;
    latestShadowId?: string;
    latestShadowStatus?: string;
    wouldHaveTradedCount: number;
    paperPlanId?: number | string;
    paperPlanStatus?: string;
    paperReconciliationStatus?: string;
    promotionDecisionId?: string;
    promotionStatus?: string;
    promotionBlockerCount: number;
  };
  broker: {
    snapshotId?: number | string;
    provider?: string;
    snapshotStatus: string;
    snapshotReconciliationStatus?: string;
    orderStatusId?: number | string;
    openOrderCount: number;
    fillId?: number | string;
    fillReconciliationStatus?: string;
  };
  livePilot: {
    latestIntentId?: string;
    latestIntentStatus?: string;
    latestStatusRecordId?: number;
    realOrderSent: boolean;
  };
  preflight: LivePilotPreflightContract;
  stages: V1SystemStage[];
  nextActions: string[];
}
