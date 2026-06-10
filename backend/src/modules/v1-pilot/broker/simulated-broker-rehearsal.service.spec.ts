import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Repository } from 'typeorm';
import { AgentDecisionRecord } from '../../../entities/agent-decision-record.entity';
import { AgentEvaluationRun } from '../../../entities/agent-evaluation-run.entity';
import { BrokerFill } from '../../../entities/broker-fill.entity';
import { BrokerSnapshot } from '../../../entities/broker-snapshot.entity';
import { createLinceiRuntime } from '../../../runtime/create-lincei-runtime';

describe('SimulatedBrokerRehearsalService', () => {
  it('blocks when no paper order plan exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sim-broker-empty-'));
    const runtime = await createLinceiRuntime({
      databasePath: join(dir, 'runtime.sqlite'),
      synchronize: true,
      dropSchema: true,
      loadEnv: false,
    });

    try {
      const result = await runtime.simulatedBrokerRehearsalService.run();

      expect(result).toMatchObject({
        status: 'blocked',
        mode: 'simulated-broker-rehearsal',
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      });
      expect(result.blockers.join(' ')).toContain(
        'No filled or reconciled paper order plan',
      );
    } finally {
      await runtime.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('replays a paper plan into matched simulated fills and snapshot', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sim-broker-paper-'));
    const runtime = await createLinceiRuntime({
      databasePath: join(dir, 'runtime.sqlite'),
      synchronize: true,
      dropSchema: true,
      loadEnv: false,
    });

    try {
      const now = new Date().toISOString();
      await seedRun(runtime.dataSource.getRepository(AgentEvaluationRun), {
        runId: 'agent-run-sim-broker',
        startedAt: now,
        completedAt: now,
      });
      await seedDecision(
        runtime.dataSource.getRepository(AgentDecisionRecord),
        {
          id: 'decision-sim-broker',
          runId: 'agent-run-sim-broker',
          asOf: now,
          availableAt: now,
        },
      );
      const paper = await runtime.activeLlmPaperBridgeService.runPaperCycle({
        runId: 'agent-run-sim-broker',
      });

      expect(paper.status).toBe('passed');
      expect(paper.paperPlan?.status).toBe('reconciled');

      const result = await runtime.simulatedBrokerRehearsalService.run({
        paperOrderPlanId: paper.paperPlan?.id,
      });

      expect(result).toMatchObject({
        status: 'passed',
        mode: 'simulated-broker-rehearsal',
        paperOrderPlanId: paper.paperPlan?.id,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      });
      expect(result.brokerOrderCommandStatus).toBe('blocked');
      expect(result.simulatedBrokerSnapshotStatus).toBe('matched');
      expect(result.simulatedBrokerFillIds.length).toBeGreaterThan(0);
      expect(result.matchedBrokerFillCount).toBe(
        result.simulatedBrokerFillIds.length,
      );
      expect(result.brokerOrderStatusDryRunMismatchCount).toBeGreaterThan(0);
      expect(result.brokerOrderStatusShapeMismatchCount).toBe(0);
      await expect(
        runtime.dataSource.getRepository(BrokerFill).count({
          where: { provider: 'simulated', status: 'matched' },
        }),
      ).resolves.toBe(result.simulatedBrokerFillIds.length);
      await expect(
        runtime.dataSource.getRepository(BrokerSnapshot).count({
          where: { provider: 'simulated', status: 'matched' },
        }),
      ).resolves.toBe(1);
    } finally {
      await runtime.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

async function seedRun(
  repository: Repository<AgentEvaluationRun>,
  overrides: Partial<AgentEvaluationRun> = {},
) {
  await repository.save(
    repository.create({
      runId: 'agent-run-sim-broker',
      mode: 'prospective-paper-arena',
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
      evidenceRefs: ['agent-decision:decision-sim-broker'],
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
      id: 'decision-sim-broker',
      runId: 'agent-run-sim-broker',
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
      proposedAction: {
        action: 'increase_exposure',
        maxPositionPctHint: 0.05,
        brokerWriteAllowed: false,
        finalOrderQuantityAllowed: false,
      },
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
