import { Repository } from 'typeorm';
import { AlphaDecision } from '../../../entities/alpha-decision.entity';
import { ResearchJobRecord } from '../../../entities/research-job-record.entity';
import { V1PilotOrchestratorService } from '../v1-pilot-orchestrator.service';
import {
  CapitalEvidenceProgressEvent,
  CapitalEvidenceSliceService,
  DEFAULT_CAPITAL_UNIVERSE,
} from './capital-evidence-slice.service';
import { ResearchFactoryService } from './research-factory.service';

describe('CapitalEvidenceSliceService', () => {
  const originalUniverseSymbols = process.env.V1_UNIVERSE_SYMBOLS;

  afterEach(() => {
    if (originalUniverseSymbols === undefined) {
      delete process.env.V1_UNIVERSE_SYMBOLS;
    } else {
      process.env.V1_UNIVERSE_SYMBOLS = originalUniverseSymbols;
    }
  });

  it('records retained blocked variants and promotion status when prerequisites are missing', async () => {
    const savedJobs: ResearchJobRecord[] = [];
    const service = new CapitalEvidenceSliceService(
      mockOrchestrator(),
      mockResearchFactory(),
      {
        create: (record: ResearchJobRecord) => record,
        save: async (record: ResearchJobRecord) => {
          savedJobs.push(record);
          return record;
        },
      } as unknown as Repository<ResearchJobRecord>,
      {
        find: async () => [],
      } as unknown as Repository<AlphaDecision>,
      mockActiveAgentService(),
      mockActiveAgentShadowService(),
      mockActiveLlmPaperBridgeService(),
    );

    const result = await service.run({ maxBacktestWorkers: 1 });

    expect(result.status).toBe('blocked');
    expect(result.variantSummary).toEqual({
      passed: 0,
      failed: 0,
      blocked: 3,
      flatNoOrder: 0,
    });
    expect(savedJobs).toHaveLength(3);
    expect(savedJobs.every((job) => job.jobType === 'ablation')).toBe(true);
    expect(result.brokerWriteCandidateStatus.status).toBe('blocked');
    expect(JSON.stringify(result.promotionDecision)).toContain('blocked');
    expect(result.universe).toEqual([...DEFAULT_CAPITAL_UNIVERSE]);
    expect(process.env.V1_UNIVERSE_SYMBOLS).toBe(originalUniverseSymbols);
  });

  it('runs and reports the same explicit universe override', async () => {
    const orchestrator = mockOrchestrator();
    const service = new CapitalEvidenceSliceService(
      orchestrator,
      mockResearchFactory(),
      {
        create: (record: ResearchJobRecord) => record,
        save: async (record: ResearchJobRecord) => record,
      } as unknown as Repository<ResearchJobRecord>,
      {
        find: async () => [],
      } as unknown as Repository<AlphaDecision>,
      mockActiveAgentService(),
      mockActiveAgentShadowService(),
      mockActiveLlmPaperBridgeService(),
    );

    const result = await service.run({
      universe: ['SPY', 'QQQ'],
      maxBacktestWorkers: 1,
    });

    expect(result.universe).toEqual(['SPY', 'QQQ']);
    expect(orchestrator.prepareLeanLocalData).toHaveBeenCalled();
    expect(process.env.V1_UNIVERSE_SYMBOLS).toBe(originalUniverseSymbols);
  });

  it('records a blocked step and progress events when a step times out', async () => {
    const events: CapitalEvidenceProgressEvent[] = [];
    const orchestrator = mockOrchestrator({
      buildHypothesisRegistry: jest.fn(() => new Promise(() => undefined)),
    });
    const service = new CapitalEvidenceSliceService(
      orchestrator,
      mockResearchFactory(),
      {
        create: (record: ResearchJobRecord) => record,
        save: async (record: ResearchJobRecord) => record,
      } as unknown as Repository<ResearchJobRecord>,
      {
        find: async () => [],
      } as unknown as Repository<AlphaDecision>,
      mockActiveAgentService(),
      mockActiveAgentShadowService(),
      mockActiveLlmPaperBridgeService(),
    );

    const result = await service.run({
      maxBacktestWorkers: 1,
      stepTimeoutMs: 5,
      onProgress: (event) => events.push(event),
    });

    const researchCorpus = result.steps.find(
      (step) => step.key === 'research-corpus',
    );
    expect(researchCorpus?.status).toBe('blocked');
    expect(researchCorpus?.blockers).toContain(
      'Research corpus ingest timed out after 5 ms.',
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'started',
          key: 'research-corpus',
        }),
        expect.objectContaining({
          type: 'completed',
          key: 'research-corpus',
          status: 'blocked',
        }),
      ]),
    );
  });
});

function mockOrchestrator(
  overrides: Partial<Record<keyof V1PilotOrchestratorService, unknown>> = {},
): V1PilotOrchestratorService {
  return {
    buildHypothesisRegistry: jest.fn(async () => ({
      status: 'completed',
      runId: 'corpus-run',
      blockers: [],
    })),
    ingestSemanticEvidence: jest.fn(async () => ({
      status: 'completed',
      blockers: [],
    })),
    prepareLeanLocalData: jest.fn(async () => ({
      status: 'blocked',
      blockers: ['Market data is missing.'],
    })),
    runAlphaCycle: jest.fn(async () => {
      throw new Error('Insufficient market data for SPY.');
    }),
    listQuantConnectCloudProjects: jest.fn(async () => ({
      status: 'blocked',
      blockers: ['QuantConnect REST credentials are missing.'],
    })),
    runSelectedRunBiasCheck: jest.fn(async () => ({
      status: 'blocked',
      attemptedVariantCount: 3,
      passedVariantCount: 0,
      failedOrBlockedVariantCount: 3,
      blockers: [
        'No passed ablation, backtest, or Cloud-import variant is recorded.',
      ],
    })),
    runPaperCycle: jest.fn(async () => {
      throw new Error('No accepted LEAN strategy run imported.');
    }),
    runLiveShadow: jest.fn(async () => ({
      status: 'blocked',
      blockerReasons: ['No portfolio target snapshot is available.'],
    })),
    runLearningLoop: jest.fn(async () => ({
      labelsCreated: 0,
      promotionDecision: {
        status: 'blocked',
        blockerReasons: ['Latest LEAN run is not QuantConnect Cloud evidence.'],
      },
    })),
    runLivePreflight: jest.fn(async () => ({
      status: 'blocked',
      blockers: ['Broker read-only snapshot is missing.'],
    })),
    ...overrides,
  } as unknown as V1PilotOrchestratorService;
}

function mockActiveAgentService() {
  return {
    runDecisionCycle: jest.fn(async () => ({
      run: {
        runId: 'agent-run-capital',
        status: 'blocked',
        strategyVariant: 'active-llm-agent-v1',
        horizonHours: 24,
        blockerReasons: ['LLM provider is unavailable.'],
      },
      decisions: [],
    })),
    scoreForecasts: jest.fn(async () => ({
      status: 'blocked',
      labeled: 0,
      blocked: 0,
      blockers: ['No proposed active LLM decisions are available.'],
    })),
  } as never;
}

function mockActiveAgentShadowService() {
  return {
    runShadowArena: jest.fn(async () => ({
      status: 'blocked',
      blockers: ['No proposed active LLM decisions are available.'],
      record: {
        id: 'agent-shadow-capital',
        status: 'blocked',
        wouldHaveTraded: [],
      },
    })),
  } as never;
}

function mockActiveLlmPaperBridgeService() {
  return {
    runPaperCycle: jest.fn(async () => ({
      status: 'blocked',
      blockers: ['No proposed active LLM decisions are available.'],
      paperPlan: null,
    })),
  } as never;
}

function mockResearchFactory(): ResearchFactoryService {
  return {
    getStatus: jest.fn(async () => ({
      hypothesisCount: 1,
      p1CandidateCount: 1,
      outOfScopeCount: 0,
      variantJobCount: 3,
      passedVariantJobCount: 0,
      failedOrBlockedVariantJobCount: 3,
    })),
  } as unknown as ResearchFactoryService;
}
