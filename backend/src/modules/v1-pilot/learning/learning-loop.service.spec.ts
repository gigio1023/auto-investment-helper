import { AlphaDecision } from '../../../entities/alpha-decision.entity';
import { LearningLoopService } from './learning-loop.service';

describe('LearningLoopService', () => {
  it('blocks_promotion_when_selected_run_bias_evidence_is_missing', async () => {
    const promotionRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const service = new LearningLoopService(
      { getLatestStrategyRun: jest.fn(async () => null) } as never,
      {} as never,
      { count: jest.fn(async () => 0) } as never,
      {} as never,
      { find: jest.fn(async () => []) } as never,
      promotionRepository as never,
      { findOne: jest.fn(async () => null) } as never,
      { find: jest.fn(async () => []) } as never,
      { find: jest.fn(async () => []) } as never,
      { find: jest.fn(async () => []) } as never,
      {
        checkSelectedRunBias: jest.fn(async () => ({
          status: 'blocked',
          checkedAt: '2026-05-27T00:00:00.000Z',
          targetRef: 'strategy:missing-run',
          attemptedVariantCount: 0,
          passedVariantCount: 0,
          failedOrBlockedVariantCount: 0,
          minVariantCount: 3,
          jobRefs: ['research-job:promotion-check'],
          blockers: ['Only 0 variant jobs are recorded.'],
        })),
      } as never,
    );

    const decision = await service.recordStrategyPromotionDecision();

    expect(decision.status).toBe('blocked');
    expect(decision.evidenceRefs).toContain('research-job:promotion-check');
    expect(decision.blockerReasons).toContain(
      'Selected-run-bias check: Only 0 variant jobs are recorded.',
    );
  });

  it('labels outcomes from availableAt for both symbol and benchmark', async () => {
    const labelRepository = {
      create: jest.fn((value) => value),
    };
    const service = new LearningLoopService(
      {} as never,
      {} as never,
      labelRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const firstBarAtOrAfter = jest.fn(
      async (symbol: string, timestamp: string) => ({
        id: `bar-${symbol}-${timestamp}`,
        close: timestamp === '2026-01-03T00:00:00.000Z' ? 100 : 110,
      }),
    );
    (
      service as unknown as { firstBarAtOrAfter: typeof firstBarAtOrAfter }
    ).firstBarAtOrAfter = firstBarAtOrAfter;

    const label = await (
      service as unknown as {
        buildLabel: (decision: AlphaDecision) => Promise<unknown>;
      }
    ).buildLabel({
      id: 'alpha-1',
      symbol: 'QQQ',
      asOf: '2026-01-01T00:00:00.000Z',
      availableAt: '2026-01-03T00:00:00.000Z',
      horizonHours: 24,
    } as AlphaDecision);

    expect(firstBarAtOrAfter).toHaveBeenNthCalledWith(
      1,
      'QQQ',
      '2026-01-03T00:00:00.000Z',
    );
    expect(firstBarAtOrAfter).toHaveBeenNthCalledWith(
      3,
      'SPY',
      '2026-01-03T00:00:00.000Z',
    );
    expect(label).toEqual(
      expect.objectContaining({
        alphaDecisionId: 'alpha-1',
        labelAt: '2026-01-04T00:00:00.000Z',
      }),
    );
  });

  it('does not let active-agent shadow evidence satisfy LEAN promotion', async () => {
    const promotionRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const service = new LearningLoopService(
      {
        getLatestStrategyRun: jest.fn(async () => ({
          runId: 'lean-run-1',
          projectName: 'aggressive_llm_momentum',
          runtime: 'quantconnect-cloud',
          status: 'passed',
          promotionEligible: true,
        })),
      } as never,
      {} as never,
      { count: jest.fn(async () => 1) } as never,
      {} as never,
      {
        find: jest.fn(async () => [
          {
            id: 'agent-shadow-1',
            status: 'recorded',
            evidenceMode: 'current_live_shadow',
            evidenceRefs: [
              'evidence-mode:active-llm-agent-shadow',
              'agent-run:agent-run-1',
            ],
          },
        ]),
      } as never,
      promotionRepository as never,
      { findOne: jest.fn(async () => null) } as never,
      { find: jest.fn(async () => []) } as never,
      { find: jest.fn(async () => []) } as never,
      { find: jest.fn(async () => []) } as never,
      {
        checkSelectedRunBias: jest.fn(async () => ({
          status: 'passed',
          checkedAt: '2026-05-27T00:00:00.000Z',
          targetRef: 'strategy:aggressive_llm_momentum:lean-run-1',
          attemptedVariantCount: 3,
          passedVariantCount: 3,
          failedOrBlockedVariantCount: 0,
          minVariantCount: 3,
          jobRefs: ['research-job:promotion-check'],
          blockers: [],
        })),
      } as never,
    );

    const decision = await service.recordStrategyPromotionDecision();

    expect(decision.status).toBe('blocked');
    expect(decision.blockerReasons).toContain(
      'No shadow trading record exists.',
    );
  });
});
