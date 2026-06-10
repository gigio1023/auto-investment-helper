/**
 * Capital evidence vertical slice: runs the current alpha-to-promotion ladder and records
 * retained variant jobs before any future broker-write boundary can be considered.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { AlphaDecision } from '../../../entities/alpha-decision.entity';
import {
  ResearchJobRecord,
  ResearchJobStatus,
  ResearchJobType,
} from '../../../entities/research-job-record.entity';
import { hashObject } from '../../../shared/hash.util';
import { V1PilotOrchestratorService } from '../v1-pilot-orchestrator.service';
import { ActiveLlmAgentShadowService } from '../agent/active-llm-agent-shadow.service';
import { ActiveLlmAgentService } from '../agent/active-llm-agent.service';
import { ActiveLlmPaperBridgeService } from '../paper/active-llm-paper-bridge.service';
import { resolveUniverseSelection } from '../universe/universe-manifest';
import { ResearchFactoryService } from './research-factory.service';

export const DEFAULT_CAPITAL_HYPOTHESIS_ID =
  'research-hypothesis-alphaarchitect-08-rethinking-trend-following-optimal-regime-dependent-allocation';

export const DEFAULT_CAPITAL_UNIVERSE = ['SPY', 'QQQ', 'TLT', 'IEF'] as const;
export const DEFAULT_CAPITAL_STEP_TIMEOUT_MS = 5 * 60_000;

export const DEFAULT_CAPITAL_VARIANTS = [
  {
    id: 'trend-regime-numeric-v1',
    label: 'Trend regime numeric baseline',
    alphaSource: 'numeric',
  },
  {
    id: 'semantic-llm-v1',
    label: 'LLM-derived semantic alpha',
    alphaSource: 'llm',
  },
  {
    id: 'trend-regime-combined-v1',
    label: 'Numeric plus LLM-derived combined alpha',
    alphaSource: 'meta',
  },
] as const;

type CapitalVariantId = (typeof DEFAULT_CAPITAL_VARIANTS)[number]['id'];
type CapitalAlphaSource =
  (typeof DEFAULT_CAPITAL_VARIANTS)[number]['alphaSource'];

type CapitalEvidenceStepStatus = 'passed' | 'blocked' | 'failed' | 'skipped';
type CapitalVariantStatus = 'passed' | 'failed' | 'blocked' | 'flat/no-order';

export interface CapitalEvidenceRunOptions {
  hypothesisId?: string;
  universe?: string[];
  maxBacktestWorkers?: number;
  semanticEvidenceLimit?: number;
  stepTimeoutMs?: number;
  onProgress?: (event: CapitalEvidenceProgressEvent) => void;
}

export interface CapitalEvidenceStep<T = unknown> {
  key: string;
  label: string;
  status: CapitalEvidenceStepStatus;
  startedAt: string;
  completedAt: string;
  blockers: string[];
  evidenceRefs: string[];
  output?: T;
}

export interface CapitalEvidenceProgressEvent {
  type: 'started' | 'completed';
  key: string;
  label: string;
  at: string;
  status?: CapitalEvidenceStepStatus;
  blockers?: string[];
}

export interface CapitalVariantOutcome {
  id: CapitalVariantId;
  label: string;
  alphaSource: CapitalAlphaSource;
  status: CapitalVariantStatus;
  researchJobStatus: ResearchJobStatus;
  jobId: string;
  orderableDecisionCount: number;
  decisionCount: number;
  blockers: string[];
  evidenceRefs: string[];
}

export interface CapitalEvidenceSliceResult {
  status: 'passed' | 'blocked' | 'failed';
  runId: string;
  hypothesisId: string;
  universe: string[];
  maxBacktestWorkers: number;
  stepTimeoutMs: number;
  variants: CapitalVariantOutcome[];
  variantSummary: {
    passed: number;
    failed: number;
    blocked: number;
    flatNoOrder: number;
  };
  activeAgent: CapitalActiveAgentSummary;
  steps: CapitalEvidenceStep[];
  blockers: string[];
  promotionDecision?: unknown;
  brokerWriteCandidateStatus: {
    status: 'blocked';
    reason: string;
    blockers: string[];
  };
  researchStatus?: unknown;
}

export interface CapitalActiveAgentSummary {
  status: 'passed' | 'blocked' | 'failed' | 'skipped';
  runId?: string;
  strategyVariant?: string;
  horizonHours?: number;
  decisions: {
    total: number;
    proposed: number;
    abstained: number;
    blocked: number;
  };
  shadow: {
    status?: string;
    recordId?: string;
    riskDecision?: string;
    wouldHaveTradedCount: number;
  };
  paperBridge: {
    status?: string;
    proposalId?: number;
    paperPlanId?: number;
    paperPlanStatus?: string;
    reconciliationStatus?: string;
  };
  scoring: {
    status?: string;
    labeled: number;
    blocked: number;
    averageBrierScore?: number;
    averageLogScore?: number;
  };
  evidenceRefs: string[];
  blockers: string[];
}

@Injectable()
export class CapitalEvidenceSliceService {
  constructor(
    private readonly orchestrator: V1PilotOrchestratorService,
    private readonly researchFactoryService: ResearchFactoryService,
    @InjectRepository(ResearchJobRecord)
    private readonly jobRepository: Repository<ResearchJobRecord>,
    @InjectRepository(AlphaDecision)
    private readonly alphaRepository: Repository<AlphaDecision>,
    private readonly activeLlmAgentService: ActiveLlmAgentService,
    private readonly activeLlmAgentShadowService: ActiveLlmAgentShadowService,
    private readonly activeLlmPaperBridgeService: ActiveLlmPaperBridgeService,
  ) {}

  async run(
    options: CapitalEvidenceRunOptions = {},
  ): Promise<CapitalEvidenceSliceResult> {
    const universe = options.universe?.length
      ? options.universe
      : [...DEFAULT_CAPITAL_UNIVERSE];
    return this.withUniverseOverride(universe, async () =>
      this.runWithResolvedUniverse({ ...options, universe }),
    );
  }

  private async runWithResolvedUniverse(
    options: CapitalEvidenceRunOptions,
  ): Promise<CapitalEvidenceSliceResult> {
    const startedAt = new Date();
    const runId = this.runId(startedAt, options);
    const hypothesisId = options.hypothesisId ?? DEFAULT_CAPITAL_HYPOTHESIS_ID;
    const universeSelection = resolveUniverseSelection();
    const universe = universeSelection.activeSymbols;
    const maxBacktestWorkers = options.maxBacktestWorkers ?? 1;
    const stepTimeoutMs =
      options.stepTimeoutMs ?? DEFAULT_CAPITAL_STEP_TIMEOUT_MS;
    const stepOptions = {
      timeoutMs: stepTimeoutMs,
      onProgress: options.onProgress,
    };
    const steps: CapitalEvidenceStep[] = [];
    const blockers: string[] = [];
    let promotionDecision: unknown;

    steps.push(
      await this.runStep(
        'research-corpus',
        'Research corpus ingest',
        () => this.orchestrator.buildHypothesisRegistry({}),
        stepOptions,
      ),
    );

    steps.push(
      await this.runStep(
        'semantic-evidence',
        'Point-in-time text evidence ingest',
        () =>
          this.orchestrator.ingestSemanticEvidence({
            source: 'hf-fomc-statements-minutes',
            limit: options.semanticEvidenceLimit ?? 80,
          }),
        stepOptions,
      ),
    );

    const pointInTimeData = await this.runStep(
      'point-in-time-data',
      'Point-in-time market data and LEAN local data preparation',
      () =>
        this.orchestrator.prepareLeanLocalData({
          ingestUniverseBars: true,
        }),
      stepOptions,
    );
    steps.push(pointInTimeData);

    const alphaStartedAt = new Date();
    const alphaStep = await this.runStep(
      'alpha-cycle',
      'Alpha cycle',
      () => this.orchestrator.runAlphaCycle(),
      stepOptions,
    );
    steps.push(alphaStep);

    const variants = await this.recordVariantOutcomes({
      runId,
      hypothesisId,
      universe,
      alphaStartedAt,
      alphaStep,
    });

    const leanValidation =
      pointInTimeData.status === 'passed'
        ? await this.runStep(
            'lean-validation',
            'Local LEAN validation attempt',
            () =>
              this.orchestrator.runFullBacktest({
                skipAlphaCycle: true,
                downloadData: false,
                ingestUniverseBars: false,
                noStaticMeta: true,
                noStaticMl: true,
                backtestTimeoutMs: stepTimeoutMs,
              }),
            stepOptions,
          )
        : this.skippedStep('lean-validation', 'Local LEAN validation attempt', [
            'Skipped because point-in-time market data or local LEAN data preparation is blocked.',
          ]);
    steps.push(leanValidation);

    steps.push(
      await this.runStep(
        'quantconnect-cloud-credential-check',
        'QuantConnect Cloud credential and project access check',
        () => this.orchestrator.listQuantConnectCloudProjects({ limit: 5 }),
        stepOptions,
      ),
    );

    steps.push(
      await this.runStep(
        'selected-run-bias-check',
        'Retained variant and selected-run-bias check',
        () =>
          this.orchestrator.runSelectedRunBiasCheck({
            hypothesisId,
            minVariantCount: DEFAULT_CAPITAL_VARIANTS.length,
          }),
        stepOptions,
      ),
    );

    steps.push(
      await this.runStep(
        'paper-cycle',
        'Current paper trading cycle',
        () => this.orchestrator.runPaperCycle(),
        stepOptions,
      ),
    );

    steps.push(
      await this.runStep(
        'live-shadow',
        'Shadow trading record',
        () => this.orchestrator.runLiveShadow(),
        stepOptions,
      ),
    );

    const learningStep = await this.runStep(
      'learning-loop',
      'Outcome labeling and promotion decision',
      () => this.orchestrator.runLearningLoop(),
      stepOptions,
    );
    steps.push(learningStep);
    promotionDecision =
      learningStep.output &&
      typeof learningStep.output === 'object' &&
      'promotionDecision' in learningStep.output
        ? (learningStep.output as { promotionDecision?: unknown })
            .promotionDecision
        : undefined;

    const activeAgentDecide = await this.runStep(
      'active-agent-decide',
      'Active LLM prospective decision cycle',
      () =>
        this.activeLlmAgentService.runDecisionCycle({
          symbols: universe,
        }),
      stepOptions,
    );
    steps.push(activeAgentDecide);
    const activeAgentRunId = this.activeAgentRunId(activeAgentDecide);
    const activeAgentShadow = activeAgentRunId
      ? await this.runStep(
          'active-agent-shadow',
          'Active LLM risk-gated shadow arena',
          () =>
            this.activeLlmAgentShadowService.runShadowArena({
              runId: activeAgentRunId,
              maxActions: 3,
            }),
          stepOptions,
        )
      : this.skippedStep(
          'active-agent-shadow',
          'Active LLM risk-gated shadow arena',
          [
            'Skipped because active LLM decision cycle did not create a run id.',
          ],
        );
    steps.push(activeAgentShadow);
    const activeAgentPaper = activeAgentRunId
      ? await this.runStep(
          'active-agent-paper-bridge',
          'Active LLM paper order-plan rehearsal',
          () =>
            this.activeLlmPaperBridgeService.runPaperCycle({
              runId: activeAgentRunId,
              maxActions: 3,
            }),
          stepOptions,
        )
      : this.skippedStep(
          'active-agent-paper-bridge',
          'Active LLM paper order-plan rehearsal',
          [
            'Skipped because active LLM decision cycle did not create a run id.',
          ],
        );
    steps.push(activeAgentPaper);
    const activeAgentScore = activeAgentRunId
      ? await this.runStep(
          'active-agent-score',
          'Active LLM prospective scoring',
          () =>
            this.activeLlmAgentService.scoreForecasts({
              runId: activeAgentRunId,
            }),
          stepOptions,
        )
      : this.skippedStep(
          'active-agent-score',
          'Active LLM prospective scoring',
          [
            'Skipped because active LLM decision cycle did not create a run id.',
          ],
        );
    steps.push(activeAgentScore);
    const activeAgent = this.activeAgentSummary({
      decide: activeAgentDecide,
      shadow: activeAgentShadow,
      paper: activeAgentPaper,
      score: activeAgentScore,
    });

    steps.push(
      await this.runStep(
        'broker-write-preflight',
        'Broker-write pre-trade risk check',
        () => this.orchestrator.runLivePreflight(),
        stepOptions,
      ),
    );

    blockers.push(
      ...this.stepBlockers(steps),
      ...this.variantBlockers(variants),
    );
    const variantSummary = this.variantSummary(variants);
    const hasFailedStep = steps.some((step) => step.status === 'failed');
    const researchStatus = await this.researchFactoryService.getStatus();
    const resultStatus = hasFailedStep
      ? 'failed'
      : blockers.length > 0
        ? 'blocked'
        : 'passed';

    return {
      status: resultStatus,
      runId,
      hypothesisId,
      universe,
      maxBacktestWorkers,
      stepTimeoutMs,
      variants,
      variantSummary,
      activeAgent,
      steps,
      blockers,
      promotionDecision,
      brokerWriteCandidateStatus: {
        status: 'blocked',
        reason:
          'Real broker submit/cancel/replace/flatten remains outside the active spec until a separate broker-write approval exists.',
        blockers: [
          'Broker-write candidate cannot become executable in this milestone.',
          ...this.preflightBlockers(steps),
        ],
      },
      researchStatus,
    };
  }

  private async withUniverseOverride<T>(
    universe: string[] | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!universe?.length) {
      return fn();
    }

    const previousUniverseSymbols = process.env.V1_UNIVERSE_SYMBOLS;
    process.env.V1_UNIVERSE_SYMBOLS = universe
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean)
      .join(',');

    try {
      return await fn();
    } finally {
      if (previousUniverseSymbols === undefined) {
        delete process.env.V1_UNIVERSE_SYMBOLS;
      } else {
        process.env.V1_UNIVERSE_SYMBOLS = previousUniverseSymbols;
      }
    }
  }

  private async recordVariantOutcomes(input: {
    runId: string;
    hypothesisId: string;
    universe: string[];
    alphaStartedAt: Date;
    alphaStep: CapitalEvidenceStep;
  }): Promise<CapitalVariantOutcome[]> {
    const alphaDecisionIds = this.alphaDecisionIds(input.alphaStep);
    const decisions = alphaDecisionIds.length
      ? await this.alphaRepository.find({
          where: { id: In(alphaDecisionIds) },
          order: { createdAt: 'DESC' },
        })
      : await this.alphaRepository.find({
          where: {
            updatedAt: MoreThanOrEqual(input.alphaStartedAt),
          },
          order: { createdAt: 'DESC' },
        });

    const outcomes: CapitalVariantOutcome[] = [];
    for (const variant of DEFAULT_CAPITAL_VARIANTS) {
      const variantDecisions = decisions.filter(
        (decision) => decision.source === variant.alphaSource,
      );
      const orderableDecisionCount = variantDecisions.filter(
        (decision) =>
          decision.direction !== 'flat' && (decision.maxPositionPct ?? 0) > 0,
      ).length;
      const status = this.variantStatus(
        input.alphaStep,
        variantDecisions.length,
        orderableDecisionCount,
        variant.alphaSource,
      );
      const blockers = this.variantStatusBlockers(
        status,
        input.alphaStep,
        variant.alphaSource,
      );
      const researchJobStatus = this.researchJobStatus(status);
      const evidenceRefs = [
        `hypothesis:${input.hypothesisId}`,
        ...variantDecisions.map((decision) => `alpha-decision:${decision.id}`),
      ];
      const job = await this.recordResearchJob({
        runId: input.runId,
        jobType: 'ablation',
        partitionKey: input.hypothesisId,
        variantId: variant.id,
        inputRefs: [
          `hypothesis:${input.hypothesisId}`,
          `universe:${input.universe.join(',')}`,
        ],
        outputRefs: evidenceRefs,
        status: researchJobStatus,
        blockers,
      });
      outcomes.push({
        id: variant.id,
        label: variant.label,
        alphaSource: variant.alphaSource,
        status,
        researchJobStatus,
        jobId: job.jobId,
        orderableDecisionCount,
        decisionCount: variantDecisions.length,
        blockers,
        evidenceRefs,
      });
    }
    return outcomes;
  }

  private alphaDecisionIds(alphaStep: CapitalEvidenceStep): string[] {
    if (!alphaStep.output || typeof alphaStep.output !== 'object') {
      return [];
    }
    const output = alphaStep.output as Record<string, unknown>;
    return [
      ...this.stringArray(output.numericDecisionIds),
      ...this.stringArray(output.llmDecisionIds),
      ...this.stringArray(output.metaDecisionIds),
    ];
  }

  private async recordResearchJob(input: {
    runId: string;
    jobType: ResearchJobType;
    partitionKey: string;
    variantId: string;
    inputRefs: string[];
    outputRefs: string[];
    status: ResearchJobStatus;
    blockers: string[];
  }): Promise<ResearchJobRecord> {
    const completedAt = new Date().toISOString();
    const jobId = `${input.jobType}-${this.shortHash({
      runId: input.runId,
      variantId: input.variantId,
      status: input.status,
      blockers: input.blockers,
    })}`;
    const record = this.jobRepository.create({
      jobId,
      runId: input.runId,
      jobType: input.jobType,
      partitionKey: input.partitionKey,
      inputRefs: input.inputRefs,
      inputHash: hashObject(input.inputRefs),
      outputRefs: input.outputRefs,
      outputHash: hashObject({
        variantId: input.variantId,
        outputRefs: input.outputRefs,
        status: input.status,
      }),
      startedAt: completedAt,
      completedAt,
      status: input.status,
      blockerReasons: input.blockers,
    });
    await this.jobRepository.save(record);
    return record;
  }

  private async runStep<T>(
    key: string,
    label: string,
    run: () => Promise<T>,
    options: {
      timeoutMs: number;
      onProgress?: (event: CapitalEvidenceProgressEvent) => void;
    },
  ): Promise<CapitalEvidenceStep<T>> {
    const startedAt = new Date().toISOString();
    options.onProgress?.({
      type: 'started',
      key,
      label,
      at: startedAt,
    });
    try {
      const output = await this.withStepTimeout(
        Promise.resolve().then(run),
        options.timeoutMs,
        label,
      );
      const blockers = this.outputBlockers(output);
      const step = {
        key,
        label,
        status: blockers.length ? 'blocked' : 'passed',
        startedAt,
        completedAt: new Date().toISOString(),
        blockers,
        evidenceRefs: this.outputEvidenceRefs(output),
        output,
      } satisfies CapitalEvidenceStep<T>;
      options.onProgress?.({
        type: 'completed',
        key,
        label,
        at: step.completedAt,
        status: step.status,
        blockers: step.blockers,
      });
      return step;
    } catch (error) {
      const step = {
        key,
        label,
        status: 'blocked',
        startedAt,
        completedAt: new Date().toISOString(),
        blockers: [this.errorMessage(error)],
        evidenceRefs: [],
      } satisfies CapitalEvidenceStep<T>;
      options.onProgress?.({
        type: 'completed',
        key,
        label,
        at: step.completedAt,
        status: step.status,
        blockers: step.blockers,
      });
      return step;
    }
  }

  private async withStepTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    label: string,
  ): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return promise;
    }
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs} ms.`));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private skippedStep(
    key: string,
    label: string,
    blockers: string[],
  ): CapitalEvidenceStep {
    const timestamp = new Date().toISOString();
    return {
      key,
      label,
      status: 'skipped',
      startedAt: timestamp,
      completedAt: timestamp,
      blockers,
      evidenceRefs: [],
    };
  }

  private outputBlockers(output: unknown): string[] {
    if (!output || typeof output !== 'object') {
      return [];
    }
    const candidate = output as Record<string, unknown>;
    const blockers = [
      ...this.stringArray(candidate.blockers),
      ...this.stringArray(candidate.blockerReasons),
    ];
    if (candidate.status === 'blocked') {
      return blockers.length ? blockers : ['Step returned blocked status.'];
    }
    if (candidate.status === 'ready' || candidate.status === 'completed') {
      return blockers;
    }
    if (
      candidate.status &&
      ['failed', 'rejected'].includes(String(candidate.status))
    ) {
      return blockers.length
        ? blockers
        : [`Step returned ${String(candidate.status)} status.`];
    }
    const nestedRun = this.objectRecord(candidate.run);
    if (nestedRun?.status === 'blocked') {
      const nestedBlockers = [
        ...blockers,
        ...this.stringArray(nestedRun.blockerReasons),
      ].filter(Boolean);
      return nestedBlockers.length
        ? nestedBlockers
        : ['Nested run returned blocked status.'];
    }
    if (
      nestedRun?.status &&
      ['failed', 'rejected'].includes(String(nestedRun.status))
    ) {
      return [
        ...blockers,
        `Nested run returned ${String(nestedRun.status)} status.`,
      ];
    }
    if (
      candidate.promotionDecision &&
      typeof candidate.promotionDecision === 'object'
    ) {
      const promotionDecision = candidate.promotionDecision as Record<
        string,
        unknown
      >;
      return [
        ...blockers,
        ...this.stringArray(promotionDecision.blockerReasons),
      ];
    }
    return blockers;
  }

  private outputEvidenceRefs(output: unknown): string[] {
    if (!output || typeof output !== 'object') {
      return [];
    }
    const candidate = output as Record<string, unknown>;
    const nestedRun = this.objectRecord(candidate.run);
    const nestedRecord = this.objectRecord(candidate.record);
    const nestedPaperPlan = this.objectRecord(candidate.paperPlan);
    return [
      ...this.stringArray(candidate.evidenceRefs),
      ...this.stringArray(candidate.jobRefs),
      candidate.runId ? `run:${String(candidate.runId)}` : '',
      candidate.id ? `record:${String(candidate.id)}` : '',
      nestedRun?.runId ? `agent-run:${String(nestedRun.runId)}` : '',
      nestedRecord?.id ? `live-shadow:${String(nestedRecord.id)}` : '',
      nestedPaperPlan?.id
        ? `paper-order-plan:${String(nestedPaperPlan.id)}`
        : '',
    ].filter(Boolean);
  }

  private variantStatus(
    alphaStep: CapitalEvidenceStep,
    decisionCount: number,
    orderableDecisionCount: number,
    alphaSource: CapitalAlphaSource,
  ): CapitalVariantStatus {
    if (alphaStep.status === 'failed') {
      return 'failed';
    }
    if (alphaStep.status === 'blocked') {
      return 'blocked';
    }
    if (decisionCount === 0) {
      return alphaSource === 'llm' ? 'blocked' : 'flat/no-order';
    }
    return orderableDecisionCount > 0 ? 'passed' : 'flat/no-order';
  }

  private variantStatusBlockers(
    status: CapitalVariantStatus,
    alphaStep: CapitalEvidenceStep,
    alphaSource: CapitalAlphaSource,
  ): string[] {
    if (status === 'passed') {
      return [];
    }
    if (status === 'flat/no-order') {
      return [
        alphaSource === 'llm'
          ? 'LLM-derived features produced only flat/no-order decisions.'
          : 'Variant produced no orderable alpha decisions.',
      ];
    }
    if (status === 'blocked') {
      const alphaBlockers = alphaStep.blockers.length
        ? alphaStep.blockers
        : ['Alpha cycle did not produce retained variant evidence.'];
      return alphaSource === 'llm'
        ? [
            ...alphaBlockers,
            'LLM abstain or missing point-in-time text evidence blocked semantic alpha.',
          ]
        : alphaBlockers;
    }
    return ['Variant job failed.'];
  }

  private researchJobStatus(status: CapitalVariantStatus): ResearchJobStatus {
    if (status === 'passed') {
      return 'passed';
    }
    if (status === 'failed') {
      return 'failed';
    }
    return 'blocked';
  }

  private variantSummary(variants: CapitalVariantOutcome[]): {
    passed: number;
    failed: number;
    blocked: number;
    flatNoOrder: number;
  } {
    return {
      passed: variants.filter((variant) => variant.status === 'passed').length,
      failed: variants.filter((variant) => variant.status === 'failed').length,
      blocked: variants.filter((variant) => variant.status === 'blocked')
        .length,
      flatNoOrder: variants.filter(
        (variant) => variant.status === 'flat/no-order',
      ).length,
    };
  }

  private stepBlockers(steps: CapitalEvidenceStep[]): string[] {
    return steps.flatMap((step) =>
      step.blockers.map((blocker) => `${step.label}: ${blocker}`),
    );
  }

  private variantBlockers(variants: CapitalVariantOutcome[]): string[] {
    return variants.flatMap((variant) =>
      variant.blockers.map((blocker) => `${variant.id}: ${blocker}`),
    );
  }

  private preflightBlockers(steps: CapitalEvidenceStep[]): string[] {
    const preflight = steps.find(
      (step) => step.key === 'broker-write-preflight',
    );
    return preflight?.blockers ?? [];
  }

  private activeAgentRunId(step: CapitalEvidenceStep): string | undefined {
    const output = this.objectRecord(step.output);
    const run = this.objectRecord(output?.run);
    return typeof run?.runId === 'string' ? run.runId : undefined;
  }

  private activeAgentSummary(input: {
    decide: CapitalEvidenceStep;
    shadow: CapitalEvidenceStep;
    paper: CapitalEvidenceStep;
    score: CapitalEvidenceStep;
  }): CapitalActiveAgentSummary {
    const decideOutput = this.objectRecord(input.decide.output);
    const run = this.objectRecord(decideOutput?.run);
    const decisions = Array.isArray(decideOutput?.decisions)
      ? decideOutput.decisions
      : [];
    const shadowOutput = this.objectRecord(input.shadow.output);
    const shadowRecord = this.objectRecord(shadowOutput?.record);
    const riskDecision = this.objectRecord(shadowOutput?.riskDecision);
    const paperOutput = this.objectRecord(input.paper.output);
    const paperPlan = this.objectRecord(paperOutput?.paperPlan);
    const reconciliation = this.objectRecord(paperPlan?.reconciliation);
    const scoreOutput = this.objectRecord(input.score.output);
    const blockers = [
      ...input.decide.blockers,
      ...input.shadow.blockers,
      ...input.paper.blockers,
      ...input.score.blockers,
    ];
    const failed = [input.decide, input.shadow, input.paper, input.score].some(
      (step) => step.status === 'failed',
    );
    const skipped = [input.decide, input.shadow, input.paper, input.score].some(
      (step) => step.status === 'skipped',
    );

    return {
      status: failed
        ? 'failed'
        : blockers.length
          ? 'blocked'
          : skipped
            ? 'skipped'
            : 'passed',
      runId: typeof run?.runId === 'string' ? run.runId : undefined,
      strategyVariant:
        typeof run?.strategyVariant === 'string'
          ? run.strategyVariant
          : undefined,
      horizonHours:
        typeof run?.horizonHours === 'number' ? run.horizonHours : undefined,
      decisions: {
        total: decisions.length,
        proposed: decisions.filter(
          (decision) => this.objectRecord(decision)?.status === 'proposed',
        ).length,
        abstained: decisions.filter(
          (decision) => this.objectRecord(decision)?.status === 'abstained',
        ).length,
        blocked: decisions.filter(
          (decision) => this.objectRecord(decision)?.status === 'blocked',
        ).length,
      },
      shadow: {
        status:
          typeof shadowOutput?.status === 'string'
            ? shadowOutput.status
            : undefined,
        recordId:
          typeof shadowRecord?.id === 'string' ? shadowRecord.id : undefined,
        riskDecision:
          typeof riskDecision?.decision === 'string'
            ? riskDecision.decision
            : undefined,
        wouldHaveTradedCount: Array.isArray(shadowRecord?.wouldHaveTraded)
          ? shadowRecord.wouldHaveTraded.length
          : 0,
      },
      paperBridge: {
        status:
          typeof paperOutput?.status === 'string'
            ? paperOutput.status
            : undefined,
        proposalId:
          typeof paperOutput?.proposalId === 'number'
            ? paperOutput.proposalId
            : undefined,
        paperPlanId:
          typeof paperPlan?.id === 'number' ? paperPlan.id : undefined,
        paperPlanStatus:
          typeof paperPlan?.status === 'string' ? paperPlan.status : undefined,
        reconciliationStatus:
          typeof reconciliation?.status === 'string'
            ? reconciliation.status
            : undefined,
      },
      scoring: {
        status:
          typeof scoreOutput?.status === 'string'
            ? scoreOutput.status
            : undefined,
        labeled:
          typeof scoreOutput?.labeled === 'number' ? scoreOutput.labeled : 0,
        blocked:
          typeof scoreOutput?.blocked === 'number' ? scoreOutput.blocked : 0,
        averageBrierScore:
          typeof scoreOutput?.averageBrierScore === 'number'
            ? scoreOutput.averageBrierScore
            : undefined,
        averageLogScore:
          typeof scoreOutput?.averageLogScore === 'number'
            ? scoreOutput.averageLogScore
            : undefined,
      },
      evidenceRefs: [
        ...input.decide.evidenceRefs,
        ...input.shadow.evidenceRefs,
        ...input.paper.evidenceRefs,
        ...input.score.evidenceRefs,
      ],
      blockers,
    };
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }

  private objectRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Unknown blocked condition.';
  }

  private runId(startedAt: Date, options: CapitalEvidenceRunOptions): string {
    const runIdInput = {
      hypothesisId: options.hypothesisId,
      universe: options.universe,
      maxBacktestWorkers: options.maxBacktestWorkers,
      semanticEvidenceLimit: options.semanticEvidenceLimit,
      stepTimeoutMs: options.stepTimeoutMs,
    };
    return `capital-evidence-${startedAt
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14)}-${this.shortHash(runIdInput)}`;
  }

  private shortHash(payload: unknown): string {
    return hashObject(payload).replace('sha256:', '').slice(0, 12);
  }
}
