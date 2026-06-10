import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import OpenAI from 'openai';
import {
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import {
  AgentDecisionDirection,
  AgentDecisionRecord,
  AgentDecisionStatus,
} from '../../../entities/agent-decision-record.entity';
import {
  AgentEvaluationMode,
  AgentEvaluationRun,
  AgentEvaluationStatus,
} from '../../../entities/agent-evaluation-run.entity';
import { AgentForecastLabel } from '../../../entities/agent-forecast-label.entity';
import { LiveShadowRecord } from '../../../entities/live-shadow-record.entity';
import { MarketDataBar } from '../../../entities/market-data-bar.entity';
import { hashObject } from '../../../shared/hash.util';
import { loadOpenAiEnv } from '../../../shared/openai-env.loader';
import { FeatureSnapshotContract } from '../contracts/v1-pilot.contracts';
import { FeatureSnapshotService } from '../alpha/feature-snapshot.service';

export interface ActiveAgentDecisionOptions {
  mode?: AgentEvaluationMode;
  strategyVariant?: string;
  horizonHours?: number;
  symbols?: string[];
}

export interface ActiveAgentScoreOptions {
  runId?: string;
  strategyVariant?: string;
}

export interface ActiveAgentDecisionResult {
  run: AgentEvaluationRun;
  decisions: AgentDecisionRecord[];
}

export interface ActiveAgentScoreResult {
  status: 'passed' | 'blocked';
  labeled: number;
  blocked: number;
  averageBrierScore: number | null;
  averageLogScore: number | null;
  labels: AgentForecastLabel[];
  blockers: string[];
}

export interface ActiveAgentStatusResult {
  status: 'passed' | 'blocked';
  latestRun: AgentEvaluationRun | null;
  latestShadowRecord: LiveShadowRecord | null;
  counts: {
    runs: number;
    decisions: number;
    proposedDecisions: number;
    abstainedDecisions: number;
    blockedDecisions: number;
    labels: number;
    labeledForecasts: number;
    blockedLabels: number;
    shadowRecords: number;
  };
  blockers: string[];
}

type ActiveAgentModelDecision = {
  symbol: string;
  direction?: AgentDecisionDirection;
  forecastProbabilityUp?: number;
  expectedReturnBps?: number;
  confidence?: number;
  thesis?: string;
  counterThesis?: string;
  invalidationCondition?: string;
  proposedAction?: Record<string, unknown>;
  riskNotes?: string[];
  evidenceRefs?: string[];
  abstainReason?: string;
};

type ActiveAgentModelResponse = {
  decisions?: ActiveAgentModelDecision[];
};

const DEFAULT_STRATEGY_VARIANT = 'active-llm-agent-v1';
const PROMPT_VERSION = 'active-llm-agent-decision-v1';
const POLICY_VERSION = 'llm-proposes-risk-gate-decides-v1';
const TOOL_POLICY_VERSION = 'no-broker-tools-v1';
const MEMORY_POLICY_VERSION = 'stateless-snapshot-v1';
const DEFAULT_HORIZON_HOURS = 5 * 24;
const DEFAULT_PROSPECTIVE_MAX_BAR_AGE_HOURS = 7 * 24;
const SAFE_ACTIONS = new Set([
  'increase_exposure',
  'reduce_exposure',
  'hold',
  'avoid',
]);

@Injectable()
export class ActiveLlmAgentService {
  private readonly logger = new Logger(ActiveLlmAgentService.name);

  constructor(
    @InjectRepository(AgentDecisionRecord)
    private readonly decisionRepository: Repository<AgentDecisionRecord>,
    @InjectRepository(AgentEvaluationRun)
    private readonly runRepository: Repository<AgentEvaluationRun>,
    @InjectRepository(AgentForecastLabel)
    private readonly labelRepository: Repository<AgentForecastLabel>,
    @InjectRepository(LiveShadowRecord)
    private readonly liveShadowRepository: Repository<LiveShadowRecord>,
    @InjectRepository(MarketDataBar)
    private readonly marketDataRepository: Repository<MarketDataBar>,
    private readonly featureSnapshotService: FeatureSnapshotService,
  ) {}

  async runDecisionCycle(
    options: ActiveAgentDecisionOptions = {},
  ): Promise<ActiveAgentDecisionResult> {
    const startedAt = new Date().toISOString();
    const strategyVariant = options.strategyVariant ?? DEFAULT_STRATEGY_VARIANT;
    const horizonHours = options.horizonHours ?? DEFAULT_HORIZON_HOURS;
    const mode = options.mode ?? 'prospective-paper-arena';
    const runId = this.runId(mode, strategyVariant, startedAt);

    let snapshots: FeatureSnapshotContract[];
    try {
      snapshots = await this.featureSnapshotService.buildSnapshotsForUniverse(
        undefined,
        {
          symbols: options.symbols,
          maxBarAgeHours:
            mode === 'prospective-paper-arena'
              ? prospectiveMaxBarAgeHours()
              : undefined,
        },
      );
      if (snapshots.length === 0) {
        throw new Error('No feature snapshots matched the requested symbols.');
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Feature snapshots unavailable for LLM agent decision.';
      const run = await this.saveRun({
        runId,
        mode,
        strategyVariant,
        startedAt,
        completedAt: new Date().toISOString(),
        horizonHours,
        symbols: options.symbols ?? [],
        status: 'blocked',
        decisionCount: 0,
        blockedCount: 0,
        abstainedCount: 0,
        evidenceRefs: [],
        blockerReasons: [message],
        inputHash: hashObject({ strategyVariant, options, message }),
      });
      return { run, decisions: [] };
    }

    const env = loadOpenAiEnv();
    const inputHash = hashObject({
      strategyVariant,
      horizonHours,
      mode,
      promptVersion: PROMPT_VERSION,
      policyVersion: POLICY_VERSION,
      snapshots: snapshots.map((snapshot) => ({
        symbol: snapshot.symbol,
        asOf: snapshot.asOf,
        availableAt: snapshot.availableAt,
        inputHash: snapshot.inputHash,
      })),
    });

    if (
      !env.apiKey ||
      env.apiKey.includes('your_openai') ||
      env.apiKey.startsWith('test-')
    ) {
      const decisions = await this.saveDecisions(
        snapshots.map((snapshot) =>
          this.blockedDecision({
            runId,
            strategyVariant,
            horizonHours,
            snapshot,
            model: env.model ?? 'llm-unavailable',
            reason: 'OPENAI_API_KEY missing; active LLM agent abstained.',
          }),
        ),
      );
      const run = await this.saveRunForDecisions({
        runId,
        mode,
        strategyVariant,
        startedAt,
        horizonHours,
        snapshots,
        decisions,
        inputHash,
        blockerReasons: ['OPENAI_API_KEY missing.'],
      });
      return { run, decisions };
    }

    let modelResponse: ActiveAgentModelResponse;
    const model = env.model ?? 'gpt-4.1-nano';
    try {
      const client = new OpenAI({
        apiKey: env.apiKey,
        baseURL: env.baseUrl,
        timeout: (env.requestTimeoutS ?? 30) * 1000,
      });
      const reasoningModel = /^gpt-5/i.test(model) || /^o\d/i.test(model);
      const response = await client.chat.completions.create({
        model,
        ...(reasoningModel ? {} : { temperature: 0.1 }),
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Return strict JSON with key decisions. You may propose an action plan, but you must not produce broker payloads, final order quantities, credentials, or account identifiers.',
          },
          {
            role: 'user',
            content: this.buildPrompt({
              snapshots,
              horizonHours,
              strategyVariant,
            }),
          },
        ],
      });
      modelResponse = JSON.parse(
        response.choices[0]?.message?.content ?? '{"decisions":[]}',
      ) as ActiveAgentModelResponse;
    } catch (error) {
      const reason = `Active LLM agent call failed: ${
        error instanceof Error ? error.message : 'unknown error'
      }`;
      this.logger.warn(reason);
      const decisions = await this.saveDecisions(
        snapshots.map((snapshot) =>
          this.blockedDecision({
            runId,
            strategyVariant,
            horizonHours,
            snapshot,
            model,
            reason,
          }),
        ),
      );
      const run = await this.saveRunForDecisions({
        runId,
        mode,
        strategyVariant,
        startedAt,
        horizonHours,
        snapshots,
        decisions,
        inputHash,
        blockerReasons: [reason],
      });
      return { run, decisions };
    }

    const decisions = await this.saveDecisions(
      snapshots.map((snapshot) =>
        this.normalizeDecision({
          runId,
          strategyVariant,
          horizonHours,
          snapshot,
          model,
          entry: modelResponse.decisions?.find(
            (decision) => decision.symbol === snapshot.symbol,
          ),
        }),
      ),
    );
    const run = await this.saveRunForDecisions({
      runId,
      mode,
      strategyVariant,
      startedAt,
      horizonHours,
      snapshots,
      decisions,
      inputHash,
      outputHash: hashObject(modelResponse),
      blockerReasons: [],
    });
    return { run, decisions };
  }

  async scoreForecasts(
    options: ActiveAgentScoreOptions = {},
  ): Promise<ActiveAgentScoreResult> {
    const where: FindOptionsWhere<AgentDecisionRecord> = {};
    if (options.runId) {
      where.runId = options.runId;
    }
    if (options.strategyVariant) {
      where.strategyVariant = options.strategyVariant;
    }
    const decisions = await this.decisionRepository.find({
      where,
      order: { asOf: 'ASC' },
    });
    if (decisions.length === 0) {
      return {
        status: 'blocked',
        labeled: 0,
        blocked: 0,
        averageBrierScore: null,
        averageLogScore: null,
        labels: [],
        blockers: ['No active LLM agent decisions found to score.'],
      };
    }

    const labels: AgentForecastLabel[] = [];
    for (const decision of decisions) {
      labels.push(await this.labelDecision(decision));
    }
    const labeled = labels.filter((label) => label.status === 'labeled');
    const brierValues = labeled
      .map((label) => label.brierScore)
      .filter((value): value is number => value !== undefined);
    const logValues = labeled
      .map((label) => label.logScore)
      .filter((value): value is number => value !== undefined);
    return {
      status: labeled.length > 0 ? 'passed' : 'blocked',
      labeled: labeled.length,
      blocked: labels.length - labeled.length,
      averageBrierScore: averageOrNull(brierValues),
      averageLogScore: averageOrNull(logValues),
      labels,
      blockers:
        labeled.length > 0
          ? []
          : ['No decisions reached a labelable horizon with market data.'],
    };
  }

  async getStatus(): Promise<ActiveAgentStatusResult> {
    const [
      latestRun,
      latestShadowRecord,
      runs,
      decisions,
      proposedDecisions,
      abstainedDecisions,
      blockedDecisions,
      labels,
      labeledForecasts,
      blockedLabels,
      shadowRecords,
    ] = await Promise.all([
      this.runRepository.findOne({ where: {}, order: { startedAt: 'DESC' } }),
      this.liveShadowRepository.findOne({
        where: {},
        order: { asOf: 'DESC' },
      }),
      this.runRepository.count(),
      this.decisionRepository.count(),
      this.decisionRepository.countBy({ status: 'proposed' }),
      this.decisionRepository.countBy({ status: 'abstained' }),
      this.decisionRepository.countBy({ status: 'blocked' }),
      this.labelRepository.count(),
      this.labelRepository.countBy({ status: 'labeled' }),
      this.labelRepository.countBy({ status: 'blocked' }),
      this.liveShadowRepository.count(),
    ]);
    const blockers = latestRun
      ? latestRun.blockerReasons
      : ['No active LLM agent evaluation runs found.'];
    return {
      status:
        latestRun && latestRun.status !== 'blocked' ? 'passed' : 'blocked',
      latestRun,
      latestShadowRecord,
      counts: {
        runs,
        decisions,
        proposedDecisions,
        abstainedDecisions,
        blockedDecisions,
        labels,
        labeledForecasts,
        blockedLabels,
        shadowRecords,
      },
      blockers,
    };
  }

  private normalizeDecision(input: {
    runId: string;
    strategyVariant: string;
    horizonHours: number;
    snapshot: FeatureSnapshotContract;
    model: string;
    entry?: ActiveAgentModelDecision;
  }): AgentDecisionRecord {
    const { snapshot, entry } = input;
    if (!entry) {
      return this.blockedDecision({
        ...input,
        reason: 'LLM response omitted this symbol.',
      });
    }

    const direction = this.direction(entry.direction);
    const probabilityUp = clamp01(
      entry.forecastProbabilityUp ??
        (direction === 'up' ? 0.6 : direction === 'down' ? 0.4 : 0.5),
    );
    const confidence = clamp01(entry.confidence ?? 0);
    const abstainReason =
      entry.abstainReason ??
      (direction === 'flat' || confidence <= 0
        ? 'LLM agent abstained from a directional view.'
        : undefined);
    const status: AgentDecisionStatus = abstainReason
      ? 'abstained'
      : 'proposed';
    return this.decisionRepository.create({
      id: `${input.runId}:${snapshot.symbol}`,
      runId: input.runId,
      strategyVariant: input.strategyVariant,
      agentId: 'active-llm-investment-committee',
      symbol: snapshot.symbol,
      asOf: snapshot.asOf,
      availableAt: snapshot.availableAt,
      horizonHours: input.horizonHours,
      status,
      direction,
      forecastProbabilityUp: probabilityUp,
      expectedReturnBps: finiteNumber(entry.expectedReturnBps),
      confidence,
      thesis: entry.thesis ?? 'LLM active agent emitted a directional view.',
      counterThesis:
        entry.counterThesis ?? 'The view can be wrong under regime shift.',
      invalidationCondition:
        entry.invalidationCondition ??
        'Invalidate if realized market data contradicts the stated thesis.',
      proposedAction: this.safeProposedAction(entry.proposedAction, direction),
      riskNotes: entry.riskNotes ?? [],
      sourceSnapshotRefs: [`feature-snapshot:${snapshot.id}`],
      evidenceRefs: entry.evidenceRefs?.length
        ? entry.evidenceRefs
        : snapshot.sourceRefs,
      model: input.model,
      promptVersion: PROMPT_VERSION,
      policyVersion: POLICY_VERSION,
      toolPolicyVersion: TOOL_POLICY_VERSION,
      memoryPolicyVersion: MEMORY_POLICY_VERSION,
      inputHash: hashObject({
        snapshot: snapshot.inputHash,
        promptVersion: PROMPT_VERSION,
        policyVersion: POLICY_VERSION,
      }),
      outputHash: hashObject(entry),
      blockerReasons: abstainReason ? [abstainReason] : [],
    });
  }

  private blockedDecision(input: {
    runId: string;
    strategyVariant: string;
    horizonHours: number;
    snapshot: FeatureSnapshotContract;
    model: string;
    reason: string;
  }): AgentDecisionRecord {
    return this.decisionRepository.create({
      id: `${input.runId}:${input.snapshot.symbol}`,
      runId: input.runId,
      strategyVariant: input.strategyVariant,
      agentId: 'active-llm-investment-committee',
      symbol: input.snapshot.symbol,
      asOf: input.snapshot.asOf,
      availableAt: input.snapshot.availableAt,
      horizonHours: input.horizonHours,
      status: 'blocked',
      direction: 'flat',
      forecastProbabilityUp: 0.5,
      confidence: 0,
      thesis: 'Active LLM agent did not produce a tradable view.',
      counterThesis: input.reason,
      invalidationCondition: 'Blocked decisions cannot advance to execution.',
      proposedAction: {
        action: 'hold',
        brokerWriteAllowed: false,
        finalOrderQuantityAllowed: false,
      },
      riskNotes: ['Blocked beats ready; no broker write can be derived.'],
      sourceSnapshotRefs: [`feature-snapshot:${input.snapshot.id}`],
      evidenceRefs: input.snapshot.sourceRefs,
      model: input.model,
      promptVersion: PROMPT_VERSION,
      policyVersion: POLICY_VERSION,
      toolPolicyVersion: TOOL_POLICY_VERSION,
      memoryPolicyVersion: MEMORY_POLICY_VERSION,
      inputHash: hashObject({
        snapshot: input.snapshot.inputHash,
        reason: input.reason,
      }),
      outputHash: hashObject({
        status: 'blocked',
        reason: input.reason,
      }),
      blockerReasons: [input.reason],
    });
  }

  private async labelDecision(
    decision: AgentDecisionRecord,
  ): Promise<AgentForecastLabel> {
    const labelAsOf = new Date().toISOString();
    const horizonEnd = new Date(
      new Date(decision.asOf).getTime() + decision.horizonHours * 3_600_000,
    ).toISOString();
    const run = await this.runRepository.findOne({
      where: { runId: decision.runId },
    });
    if (decision.status === 'blocked' || decision.status === 'abstained') {
      return this.saveLabel({
        decision,
        labelAsOf,
        horizonEnd,
        status: 'blocked',
        actualDirection: 'unknown',
        blockerReasons: [
          decision.status === 'abstained'
            ? 'Abstained decisions are not scored as directional forecasts.'
            : 'Blocked decisions are not scored.',
        ],
      });
    }
    if (
      run?.mode === 'prospective-paper-arena' &&
      new Date(labelAsOf).getTime() < new Date(horizonEnd).getTime()
    ) {
      return this.saveLabel({
        decision,
        labelAsOf,
        horizonEnd,
        status: 'blocked',
        actualDirection: 'unknown',
        blockerReasons: [
          'Prospective forecast horizon has not elapsed; label remains blocked.',
        ],
      });
    }

    const startBar = await this.marketDataRepository.findOne({
      where: {
        symbol: decision.symbol,
        timestamp: LessThanOrEqual(decision.asOf),
        availabilityTimestamp: LessThanOrEqual(decision.availableAt),
      },
      order: { timestamp: 'DESC' },
    });
    const endBar = await this.marketDataRepository.findOne({
      where: {
        symbol: decision.symbol,
        timestamp: MoreThanOrEqual(horizonEnd),
        availabilityTimestamp: LessThanOrEqual(labelAsOf),
      },
      order: { timestamp: 'ASC' },
    });
    if (!startBar || !endBar) {
      return this.saveLabel({
        decision,
        labelAsOf,
        horizonEnd,
        status: 'blocked',
        actualDirection: 'unknown',
        blockerReasons: [
          `Missing market bars for ${decision.symbol} at decision or horizon time.`,
        ],
      });
    }

    const base = startBar.close || startBar.adjustedClose;
    const terminal = endBar.close || endBar.adjustedClose;
    const realizedReturn = base === 0 ? 0 : terminal / base - 1;
    const realizedReturnBps = Number((realizedReturn * 10_000).toFixed(4));
    const actualDirection: 'up' | 'down' | 'flat' =
      realizedReturnBps > 0 ? 'up' : realizedReturnBps < 0 ? 'down' : 'flat';
    const outcome = actualDirection === 'up' ? 1 : 0;
    const probability = clampProbability(decision.forecastProbabilityUp);
    const brierScore = Number(((probability - outcome) ** 2).toFixed(8));
    const logScore = Number(
      (-(
        outcome * Math.log(probability) +
        (1 - outcome) * Math.log(1 - probability)
      )).toFixed(8),
    );
    return this.saveLabel({
      decision,
      labelAsOf,
      horizonEnd,
      status: 'labeled',
      actualDirection,
      realizedReturnBps,
      brierScore,
      logScore,
      evidenceRefs: [
        `market-data-bar:${startBar.id}`,
        `market-data-bar:${endBar.id}`,
      ],
      blockerReasons: [],
    });
  }

  private async saveLabel(input: {
    decision: AgentDecisionRecord;
    labelAsOf: string;
    horizonEnd: string;
    status: 'labeled' | 'blocked';
    actualDirection: 'up' | 'down' | 'flat' | 'unknown';
    realizedReturnBps?: number;
    brierScore?: number;
    logScore?: number;
    evidenceRefs?: string[];
    blockerReasons: string[];
  }): Promise<AgentForecastLabel> {
    const label = this.labelRepository.create({
      id: `agent-label:${input.decision.id}`,
      decisionId: input.decision.id,
      runId: input.decision.runId,
      symbol: input.decision.symbol,
      labelAsOf: input.labelAsOf,
      horizonEnd: input.horizonEnd,
      status: input.status,
      actualDirection: input.actualDirection,
      realizedReturnBps: input.realizedReturnBps,
      forecastProbabilityUp: input.decision.forecastProbabilityUp,
      brierScore: input.brierScore,
      logScore: input.logScore,
      evidenceRefs: input.evidenceRefs ?? [],
      blockerReasons: input.blockerReasons,
    });
    await this.labelRepository.upsert(label, ['id']);
    return label;
  }

  private async saveDecisions(
    decisions: AgentDecisionRecord[],
  ): Promise<AgentDecisionRecord[]> {
    if (decisions.length) {
      await this.decisionRepository.upsert(decisions, ['id']);
    }
    return decisions;
  }

  private async saveRunForDecisions(input: {
    runId: string;
    mode: AgentEvaluationMode;
    strategyVariant: string;
    startedAt: string;
    horizonHours: number;
    snapshots: FeatureSnapshotContract[];
    decisions: AgentDecisionRecord[];
    inputHash: string;
    outputHash?: string;
    blockerReasons: string[];
  }): Promise<AgentEvaluationRun> {
    const blockedCount = input.decisions.filter(
      (decision) => decision.status === 'blocked',
    ).length;
    const abstainedCount = input.decisions.filter(
      (decision) => decision.status === 'abstained',
    ).length;
    const proposedCount = input.decisions.filter(
      (decision) => decision.status === 'proposed',
    ).length;
    const status: AgentEvaluationStatus =
      proposedCount > 0 ? 'passed' : 'blocked';
    return this.saveRun({
      runId: input.runId,
      mode: input.mode,
      strategyVariant: input.strategyVariant,
      startedAt: input.startedAt,
      completedAt: new Date().toISOString(),
      horizonHours: input.horizonHours,
      symbols: input.snapshots.map((snapshot) => snapshot.symbol),
      status,
      decisionCount: input.decisions.length,
      blockedCount,
      abstainedCount,
      evidenceRefs: input.decisions.map(
        (decision) => `agent-decision:${decision.id}`,
      ),
      blockerReasons: [
        ...input.blockerReasons,
        ...(proposedCount === 0
          ? ['No proposed active LLM agent decisions were produced.']
          : []),
        ...input.decisions.flatMap((decision) => decision.blockerReasons),
      ],
      inputHash: input.inputHash,
      outputHash:
        input.outputHash ??
        hashObject(input.decisions.map((decision) => decision.outputHash)),
    });
  }

  private async saveRun(input: {
    runId: string;
    mode: AgentEvaluationMode;
    strategyVariant: string;
    startedAt: string;
    completedAt?: string;
    horizonHours: number;
    symbols: string[];
    status: AgentEvaluationStatus;
    decisionCount: number;
    blockedCount: number;
    abstainedCount: number;
    evidenceRefs: string[];
    blockerReasons: string[];
    inputHash: string;
    outputHash?: string;
  }): Promise<AgentEvaluationRun> {
    const run = this.runRepository.create({
      ...input,
      promptVersion: PROMPT_VERSION,
      policyVersion: POLICY_VERSION,
    });
    await this.runRepository.upsert(run, ['runId']);
    return run;
  }

  private buildPrompt(input: {
    snapshots: FeatureSnapshotContract[];
    horizonHours: number;
    strategyVariant: string;
  }): string {
    return JSON.stringify({
      task: 'Act as an investment committee for a prospective paper/shadow evaluation. Produce forecast probabilities and a risk-gated action plan only. Do not produce broker payloads or final order quantities.',
      promptVersion: PROMPT_VERSION,
      policyVersion: POLICY_VERSION,
      toolPolicyVersion: TOOL_POLICY_VERSION,
      memoryPolicyVersion: MEMORY_POLICY_VERSION,
      strategyVariant: input.strategyVariant,
      horizonHours: input.horizonHours,
      outputSchema: {
        decisions: [
          {
            symbol: 'string',
            direction: 'up | down | flat',
            forecastProbabilityUp: 'number between 0 and 1',
            expectedReturnBps: 'optional number',
            confidence: 'number between 0 and 1',
            thesis: 'string',
            counterThesis: 'string',
            invalidationCondition: 'string',
            proposedAction: {
              action: 'increase_exposure | reduce_exposure | hold | avoid',
              maxPositionPctHint: 'optional number; hint only',
            },
            riskNotes: ['string'],
            evidenceRefs: ['string'],
            abstainReason: 'optional string',
          },
        ],
      },
      snapshots: input.snapshots.map((snapshot) => ({
        symbol: snapshot.symbol,
        asOf: snapshot.asOf,
        availableAt: snapshot.availableAt,
        timeframe: snapshot.timeframe,
        features: snapshot.features,
        sourceRefs: snapshot.sourceRefs,
        inputHash: snapshot.inputHash,
      })),
    });
  }

  private safeProposedAction(
    proposedAction: Record<string, unknown> | undefined,
    direction: AgentDecisionDirection,
  ): Record<string, unknown> {
    const candidateAction =
      proposedAction && typeof proposedAction.action === 'string'
        ? proposedAction.action
        : undefined;
    const action = SAFE_ACTIONS.has(candidateAction ?? '')
      ? candidateAction
      : direction === 'up'
        ? 'increase_exposure'
        : direction === 'down'
          ? 'reduce_exposure'
          : 'hold';
    const maxPositionPctHint = finiteNumber(proposedAction?.maxPositionPctHint);
    return {
      action,
      ...(maxPositionPctHint !== undefined && maxPositionPctHint >= 0
        ? { maxPositionPctHint: Math.min(maxPositionPctHint, 1) }
        : {}),
      brokerWriteAllowed: false,
      finalOrderQuantityAllowed: false,
    };
  }

  private direction(value: unknown): AgentDecisionDirection {
    return value === 'up' || value === 'down' || value === 'flat'
      ? value
      : 'flat';
  }

  private runId(
    mode: AgentEvaluationMode,
    strategyVariant: string,
    startedAt: string,
  ): string {
    return `agent-eval-${mode}-${strategyVariant}-${startedAt.replace(/[:.]/g, '-')}`;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, Number(value.toFixed(6))));
}

function clampProbability(value: number): number {
  return Math.max(0.000001, Math.min(0.999999, value));
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function averageOrNull(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  return Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(8),
  );
}

function prospectiveMaxBarAgeHours(): number {
  const value = Number(process.env.ACTIVE_AGENT_MAX_BAR_AGE_HOURS);
  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_PROSPECTIVE_MAX_BAR_AGE_HOURS;
}
