import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Repository } from 'typeorm';
import { createLinceiRuntime } from '../../../runtime/create-lincei-runtime';
import { AgentDecisionRecord } from '../../../entities/agent-decision-record.entity';
import { AgentEvaluationRun } from '../../../entities/agent-evaluation-run.entity';
import { MarketDataBar } from '../../../entities/market-data-bar.entity';

describe('ActiveLlmAgentService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('records blocked prospective decisions when the LLM provider is unavailable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lincei-agent-'));
    const openAiEnvPath = join(dir, 'openai.env');
    writeFileSync(openAiEnvPath, 'OPENAI_API_KEY=test-openai-key\n');
    process.env.LINCEI_OPENAI_ENV_FILE = openAiEnvPath;
    process.env.V1_UNIVERSE_SYMBOLS = 'SPY';
    const runtime = await createLinceiRuntime({
      databasePath: join(dir, 'runtime.sqlite'),
      synchronize: true,
      dropSchema: true,
      loadEnv: false,
    });

    try {
      await seedCurrentBars(runtime.dataSource.getRepository(MarketDataBar));

      const result = await runtime.activeLlmAgentService.runDecisionCycle({
        horizonHours: 24,
        symbols: ['spy'],
      });

      expect(result.run).toMatchObject({
        mode: 'prospective-paper-arena',
        status: 'blocked',
        decisionCount: 1,
        blockedCount: 1,
      });
      expect(result.decisions[0]).toMatchObject({
        symbol: 'SPY',
        status: 'blocked',
        direction: 'flat',
        forecastProbabilityUp: 0.5,
        proposedAction: {
          action: 'hold',
          brokerWriteAllowed: false,
          finalOrderQuantityAllowed: false,
        },
      });
    } finally {
      await runtime.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('scores proposed forecasts with proper scoring rules', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lincei-agent-score-'));
    process.env.V1_UNIVERSE_SYMBOLS = 'SPY';
    const runtime = await createLinceiRuntime({
      databasePath: join(dir, 'runtime.sqlite'),
      synchronize: true,
      dropSchema: true,
      loadEnv: false,
    });

    try {
      const marketDataRepository =
        runtime.dataSource.getRepository(MarketDataBar);
      await seedHistoricalBars(marketDataRepository);
      await seedRun(runtime.dataSource.getRepository(AgentEvaluationRun), {
        runId: 'agent-run-1',
        mode: 'historical-episode-replay',
      });
      await seedDecision(runtime.dataSource.getRepository(AgentDecisionRecord));

      const result = await runtime.activeLlmAgentService.scoreForecasts({
        runId: 'agent-run-1',
      });

      expect(result).toMatchObject({
        status: 'passed',
        labeled: 1,
        blocked: 0,
        averageBrierScore: 0.09,
      });
      expect(result.labels[0]).toMatchObject({
        decisionId: 'decision-1',
        actualDirection: 'up',
        brierScore: 0.09,
      });
      expect(result.labels[0].logScore).toBeCloseTo(0.35667494, 6);
    } finally {
      await runtime.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks prospective forecast labels until the horizon has elapsed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lincei-agent-future-score-'));
    process.env.V1_UNIVERSE_SYMBOLS = 'SPY';
    const runtime = await createLinceiRuntime({
      databasePath: join(dir, 'runtime.sqlite'),
      synchronize: true,
      dropSchema: true,
      loadEnv: false,
    });

    try {
      await seedFutureBars(runtime.dataSource.getRepository(MarketDataBar));
      await seedRun(runtime.dataSource.getRepository(AgentEvaluationRun), {
        runId: 'agent-run-future',
        mode: 'prospective-paper-arena',
      });
      await seedDecision(
        runtime.dataSource.getRepository(AgentDecisionRecord),
        {
          id: 'decision-future',
          runId: 'agent-run-future',
          asOf: new Date().toISOString(),
          availableAt: new Date().toISOString(),
          horizonHours: 24,
        },
      );

      const result = await runtime.activeLlmAgentService.scoreForecasts({
        runId: 'agent-run-future',
      });

      expect(result).toMatchObject({
        status: 'blocked',
        labeled: 0,
        blocked: 1,
      });
      expect(result.labels[0].blockerReasons).toContain(
        'Prospective forecast horizon has not elapsed; label remains blocked.',
      );
    } finally {
      await runtime.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists only whitelisted action-plan fields from LLM output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lincei-agent-sanitize-'));
    const runtime = await createLinceiRuntime({
      databasePath: join(dir, 'runtime.sqlite'),
      synchronize: true,
      dropSchema: true,
      loadEnv: false,
    });

    try {
      const service = runtime.activeLlmAgentService as unknown as {
        safeProposedAction(
          proposedAction: Record<string, unknown>,
          direction: 'up' | 'down' | 'flat',
        ): Record<string, unknown>;
      };

      const action = service.safeProposedAction(
        {
          action: 'increase_exposure',
          maxPositionPctHint: 0.2,
          quantity: 100,
          orderPayload: { side: 'buy' },
          accountId: 'acct-123',
          apiKey: 'secret',
        },
        'up',
      );

      expect(action).toEqual({
        action: 'increase_exposure',
        maxPositionPctHint: 0.2,
        brokerWriteAllowed: false,
        finalOrderQuantityAllowed: false,
      });
    } finally {
      await runtime.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('risk-gates proposed active LLM decisions into shadow evidence', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lincei-agent-shadow-'));
    const runtime = await createLinceiRuntime({
      databasePath: join(dir, 'runtime.sqlite'),
      synchronize: true,
      dropSchema: true,
      loadEnv: false,
    });

    try {
      const now = new Date().toISOString();
      await seedRun(runtime.dataSource.getRepository(AgentEvaluationRun), {
        runId: 'agent-run-shadow',
        mode: 'prospective-paper-arena',
        startedAt: now,
        completedAt: now,
      });
      await seedDecision(
        runtime.dataSource.getRepository(AgentDecisionRecord),
        {
          id: 'decision-shadow',
          runId: 'agent-run-shadow',
          asOf: now,
          availableAt: now,
          proposedAction: {
            action: 'increase_exposure',
            maxPositionPctHint: 0.05,
            brokerWriteAllowed: false,
            finalOrderQuantityAllowed: false,
          },
        },
      );

      const result = await runtime.activeLlmAgentShadowService.runShadowArena({
        runId: 'agent-run-shadow',
      });

      expect(result.status).toBe('recorded');
      expect(result.riskDecision).toMatchObject({
        decision: 'ALLOW',
        brokerExecutionEnabled: false,
      });
      expect(result.record).toMatchObject({
        status: 'recorded',
        evidenceMode: 'current_live_shadow',
      });
      expect(result.record.wouldHaveTraded).toEqual([
        expect.objectContaining({
          symbol: 'SPY',
          side: 'buy',
          estimatedNotionalUsd: 500,
          brokerWriteEnabled: false,
        }),
      ]);
      expect(JSON.stringify(result.record)).not.toContain('quantity');
    } finally {
      await runtime.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

async function seedCurrentBars(repository: Repository<MarketDataBar>) {
  const now = Date.now();
  const rows: Array<[string, number]> = [2, 1, 0].map(
    (daysAgo, index): [string, number] => [
      new Date(now - daysAgo * 86_400_000).toISOString(),
      100 + index,
    ],
  );
  await saveBars(repository, rows);
}

async function seedHistoricalBars(repository: Repository<MarketDataBar>) {
  await saveBars(repository, [
    ['2026-01-01T00:00:00.000Z', 100],
    ['2026-01-02T00:00:00.000Z', 110],
    ['2026-01-03T00:00:00.000Z', 111],
  ]);
}

async function seedFutureBars(repository: Repository<MarketDataBar>) {
  const now = Date.now();
  await saveBars(repository, [
    [new Date(now - 3_600_000).toISOString(), 100],
    [new Date(now + 25 * 3_600_000).toISOString(), 110],
  ]);
}

async function saveBars(
  repository: Repository<MarketDataBar>,
  rows: Array<[string, number]>,
) {
  const bars = rows.map(([timestamp, close], index) =>
    repository.create({
      datasetId: 'v1-lean-universe',
      provider: 'manual' as const,
      sourceRef: `test:SPY:${index}`,
      symbol: 'SPY',
      timeframe: '1d',
      timestamp: String(timestamp),
      availabilityTimestamp: String(timestamp),
      currency: 'USD',
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      adjustedClose: close,
      volume: 1_000_000 + index,
      notes: [],
      brokerExecutionEnabled: false,
      liveTradingEnabled: false,
    }),
  );
  await repository.save(bars);
}

async function seedRun(
  repository: Repository<AgentEvaluationRun>,
  overrides: Partial<AgentEvaluationRun> = {},
) {
  await repository.save(
    repository.create({
      runId: overrides.runId ?? 'agent-run-1',
      mode: overrides.mode ?? 'historical-episode-replay',
      strategyVariant: 'active-llm-agent-v1',
      status: 'passed',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      horizonHours: 24,
      symbols: ['SPY'],
      promptVersion: 'active-llm-agent-decision-v1',
      policyVersion: 'llm-proposes-risk-gate-decides-v1',
      inputHash: 'sha256:run-input',
      outputHash: 'sha256:run-output',
      decisionCount: 1,
      blockedCount: 0,
      abstainedCount: 0,
      evidenceRefs: ['agent-decision:decision-1'],
      blockerReasons: [],
      ...overrides,
    }),
  );
}

async function seedDecision(
  repository: Repository<AgentDecisionRecord>,
  overrides: Partial<AgentDecisionRecord> = {},
) {
  await repository.save(
    repository.create({
      id: 'decision-1',
      runId: 'agent-run-1',
      strategyVariant: 'active-llm-agent-v1',
      agentId: 'active-llm-investment-committee',
      symbol: 'SPY',
      asOf: '2026-01-01T00:00:00.000Z',
      availableAt: '2026-01-01T00:00:00.000Z',
      horizonHours: 24,
      status: 'proposed',
      direction: 'up',
      forecastProbabilityUp: 0.7,
      expectedReturnBps: 25,
      confidence: 0.7,
      thesis: 'SPY should rise.',
      counterThesis: 'The view can be wrong.',
      invalidationCondition: 'Price fails to confirm.',
      proposedAction: { action: 'increase_exposure' },
      riskNotes: [],
      sourceSnapshotRefs: ['feature-snapshot:test'],
      evidenceRefs: ['market-data-bar:1'],
      model: 'test-model',
      promptVersion: 'active-llm-agent-decision-v1',
      policyVersion: 'llm-proposes-risk-gate-decides-v1',
      toolPolicyVersion: 'no-broker-tools-v1',
      memoryPolicyVersion: 'stateless-snapshot-v1',
      inputHash: 'sha256:input',
      outputHash: 'sha256:output',
      blockerReasons: [],
      ...overrides,
    }),
  );
}
