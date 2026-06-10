import {
  buildV1CurrentMilestoneStatus,
  buildV1NextActions,
  buildV1SystemStages,
} from './v1-pilot-status-stage.builder';
import { V1SystemStageInput } from './v1-pilot-status-stage.builder';

const baseInput = (): V1SystemStageInput => ({
  research: {
    hypothesisCount: 40,
    p1CandidateCount: 12,
    outOfScopeCount: 4,
    latestJobId: 'hypothesis-extraction-1',
    latestJobStatus: 'passed',
    latestJobType: 'hypothesis-extraction',
    variantJobCount: 4,
    passedVariantJobCount: 2,
    failedOrBlockedVariantJobCount: 2,
    latestVariantJobId: 'backtest-variant-1',
    latestVariantJobStatus: 'passed',
    latestVariantJobType: 'backtest',
  },
  alpha: {
    featureSnapshotCount: 5,
    numericDecisionCount: 5,
    llmDecisionCount: 5,
    metaDecisionCount: 5,
    latestFeatureAsOf: '2026-05-27T00:00:00.000Z',
    latestAlphaAsOf: '2026-05-27T00:00:00.000Z',
    mlModelStatus: 'ready',
  },
  latestLeanRun: {
    runId: 'qc-import-1',
    status: 'passed',
    runtime: 'quantconnect-cloud',
    cloudProjectId: '123',
    cloudBacktestId: 'bt-1',
  } as V1SystemStageInput['latestLeanRun'],
  latestCloudRun: {
    runId: 'qc-import-1',
    status: 'passed',
    runtime: 'quantconnect-cloud',
    cloudProjectId: '123',
    cloudBacktestId: 'bt-1',
  } as V1SystemStageInput['latestCloudRun'],
  portfolioTarget: {
    id: 'targets-1',
    leanRunId: 'qc-import-1',
    targetCount: 3,
    grossExposurePct: 80,
    maxSingleNamePct: 30,
  },
  paper: {
    planId: 1,
    status: 'reconciled',
    reconciliationStatus: 'matched',
    fillCount: 3,
  },
  activeAgent: {
    runId: 'agent-run-1',
    runStatus: 'passed',
    strategyVariant: 'active-llm-agent-v1',
    decisionCount: 2,
    proposedDecisionCount: 2,
    blockedDecisionCount: 0,
    abstainedDecisionCount: 0,
    labeledForecastCount: 2,
    latestShadowId: 'agent-shadow-1',
    latestShadowStatus: 'recorded',
    wouldHaveTradedCount: 1,
    paperPlanId: 2,
    paperPlanStatus: 'reconciled',
    paperReconciliationStatus: 'matched',
    promotionDecisionId: 'active-agent-promotion-1',
    promotionStatus: 'accepted',
    promotionBlockerCount: 0,
  },
  broker: {
    snapshotId: 'broker-snapshot-1',
    provider: 'toss',
    snapshotStatus: 'matched',
    snapshotReconciliationStatus: 'matched',
    openOrderCount: 0,
  },
  preflight: {
    status: 'ready',
    checkedAt: '2026-05-27T00:00:00.000Z',
    maxPilotNotionalUsd: 10,
    broker: 'toss',
    blockers: [],
    requiredFlags: {
      brokerWriteEnabled: false,
      liveTradingEnabled: false,
      maxPilotNotionalUsd: true,
      tossOrderSchemaVerified: false,
      tossOpenApiSchemaVerified: false,
      cancelFlattenReady: false,
      brokerOpenOrderPollVerified: false,
      tossWriteAdapterReady: false,
    },
    latestLeanRunId: 'qc-import-1',
    latestPaperPlanId: 1,
    latestBrokerSnapshotId: 1,
    openOrderRefs: [],
    credentialMode: 'external-secret',
  },
  livePilot: {
    realOrderSent: false,
  },
});

describe('V1 status stage builder', () => {
  it('does not let deferred broker-write stages block the current milestone', () => {
    const stages = buildV1SystemStages(baseInput());
    const milestone = buildV1CurrentMilestoneStatus(stages);

    expect(milestone.verdict).toBe('ready');
    expect(milestone.deferredStageCount).toBeGreaterThan(0);
    expect(
      stages.find((stage) => stage.key === 'broker_write_spec'),
    ).toMatchObject({
      scope: 'deferred',
      blocksCurrentMilestone: false,
      status: 'missing',
    });
    expect(buildV1NextActions(stages)[0]).toContain(
      'current validation milestone is ready',
    );
  });

  it('blocks the current milestone when retained variants are missing', () => {
    const input = baseInput();
    input.research = {
      ...input.research,
      variantJobCount: 1,
      passedVariantJobCount: 1,
      failedOrBlockedVariantJobCount: 0,
    };

    const stages = buildV1SystemStages(input);
    const variantStage = stages.find(
      (stage) => stage.key === 'variant_evidence',
    );

    expect(variantStage).toMatchObject({
      status: 'blocked',
      blocksCurrentMilestone: true,
    });
    expect(variantStage?.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('At least three retained'),
        expect.stringContaining('No failed or blocked variant job'),
      ]),
    );
    expect(buildV1CurrentMilestoneStatus(stages).verdict).toBe('blocked');
  });
});
