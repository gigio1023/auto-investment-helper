import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Repository } from 'typeorm';
import { AgentDecisionRecord } from '../../../entities/agent-decision-record.entity';
import { AgentEvaluationRun } from '../../../entities/agent-evaluation-run.entity';
import { createLinceiRuntime } from '../../../runtime/create-lincei-runtime';

describe('ActiveLlmPaperBridgeService', () => {
  it('routes active LLM decisions through paper order-plan reconciliation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'active-llm-paper-'));
    const runtime = await createLinceiRuntime({
      databasePath: join(dir, 'runtime.sqlite'),
      synchronize: true,
      dropSchema: true,
      loadEnv: false,
    });

    try {
      const now = new Date().toISOString();
      await seedRun(runtime.dataSource.getRepository(AgentEvaluationRun), {
        runId: 'agent-run-paper',
        startedAt: now,
        completedAt: now,
      });
      await seedDecision(
        runtime.dataSource.getRepository(AgentDecisionRecord),
        {
          id: 'decision-paper',
          runId: 'agent-run-paper',
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

      const result = await runtime.activeLlmPaperBridgeService.runPaperCycle({
        runId: 'agent-run-paper',
      });

      expect(result.status).toBe('passed');
      expect(result.paperPlan).toMatchObject({
        status: 'reconciled',
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      });
      expect(result.paperPlan?.idempotencyKey).toContain(
        'active-agent-paper:agent-run-paper:',
      );
      expect(result.evidenceRefs).toEqual(
        expect.arrayContaining([
          'agent-run:agent-run-paper',
          'agent-decision:decision-paper',
        ]),
      );
      expect(JSON.stringify(result.paperPlan)).not.toContain('apiKey');
      expect(JSON.stringify(result.paperPlan)).not.toContain('quantity":100');
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
      runId: overrides.runId ?? 'agent-run-paper',
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
      evidenceRefs: ['agent-decision:decision-paper'],
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
      id: 'decision-paper',
      runId: 'agent-run-paper',
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
