import { V1PilotSystemStatus } from '../modules/v1-pilot/v1-pilot-status.types';
import { buildCapitalTriage } from './capital-triage';

describe('buildCapitalTriage', () => {
  it('routes broker read-only blockers to read-only broker commands', () => {
    const result = buildCapitalTriage(
      statusFixture({
        key: 'broker_read_only',
        blockers: ['Broker read-only snapshot is simulated.'],
      }),
    );

    expect(result.recommendedAction.key).toBe('broker-read-only');
    expect(result.recommendedAction.command).toContain('broker status');
    expect(result.recommendedAction.command).not.toContain('&&');
    expect(result.blockers).toEqual([
      'Broker read-only snapshot is simulated.',
    ]);
    expect(result.brokerBoundary.brokerWriteInScope).toBe(false);
  });

  it('routes Cloud import blockers to the QuantConnect Cloud listing command', () => {
    const result = buildCapitalTriage(
      statusFixture({
        key: 'cloud_import',
        blockers: ['QuantConnect Cloud backtest import is missing.'],
      }),
    );

    expect(result.recommendedAction.key).toBe('quantconnect-cloud-import');
    expect(result.recommendedAction.command).toContain('qc list-backtests');
    expect(result.recommendedAction.reason).toContain(
      'QuantConnect Cloud backtest results',
    );
  });
});

function statusFixture(stage: {
  key: string;
  blockers: string[];
}): V1PilotSystemStatus {
  return {
    checkedAt: '2026-05-31T00:00:00.000Z',
    verdict: 'blocked',
    currentMilestone: {
      key: 'self-funded-capital-evidence',
      label: 'Self-funded capital evidence',
      verdict: 'blocked',
      readyStageCount: 0,
      blockedStageCount: 1,
      missingStageCount: 0,
      currentStageCount: 1,
      deferredStageCount: 0,
    },
    leanRun: null,
    cloudRun: null,
    alpha: {
      featureSnapshotCount: 0,
      numericDecisionCount: 0,
      llmDecisionCount: 0,
      metaDecisionCount: 0,
      mlModelStatus: 'blocked',
    },
    research: {
      hypothesisCount: 0,
      p1CandidateCount: 0,
      outOfScopeCount: 0,
      variantJobCount: 0,
      passedVariantJobCount: 0,
      failedOrBlockedVariantJobCount: 0,
    },
    portfolioTarget: {
      targetCount: 0,
    },
    paper: {
      status: 'blocked',
      fillCount: 0,
    },
    activeAgent: {
      runStatus: 'missing',
      decisionCount: 0,
      proposedDecisionCount: 0,
      blockedDecisionCount: 0,
      abstainedDecisionCount: 0,
      labeledForecastCount: 0,
      wouldHaveTradedCount: 0,
      promotionBlockerCount: 0,
    },
    broker: {
      snapshotStatus: 'blocked',
      openOrderCount: 0,
    },
    livePilot: {
      realOrderSent: false,
    },
    preflight: {
      status: 'blocked',
      submitted: false,
      blockers: ['Broker-write path is blocked.'],
    } as unknown as V1PilotSystemStatus['preflight'],
    stages: [
      {
        key: stage.key,
        label: stage.key,
        status: 'blocked',
        scope: 'current',
        blocksCurrentMilestone: true,
        detail: 'blocked for test',
        blockers: stage.blockers,
        refs: ['test-ref'],
      },
    ],
    nextActions: ['Run triage.'],
  };
}
