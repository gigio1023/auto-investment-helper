import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { AlphaDecision } from '../../../entities/alpha-decision.entity';
import { AlphaOutcomeLabel } from '../../../entities/alpha-outcome-label.entity';
import { AgentDecisionRecord } from '../../../entities/agent-decision-record.entity';
import { AgentEvaluationRun } from '../../../entities/agent-evaluation-run.entity';
import { AgentForecastLabel } from '../../../entities/agent-forecast-label.entity';
import { LiveShadowRecord } from '../../../entities/live-shadow-record.entity';
import { MarketDataBar } from '../../../entities/market-data-bar.entity';
import { PaperOrderPlan } from '../../../entities/paper-order-plan.entity';
import { PromotionDecision } from '../../../entities/promotion-decision.entity';
import { hashObject } from '../../../shared/hash.util';
import { alphaHorizonHours } from '../contracts/spec-contracts';
import { LeanRunImportService } from '../lean/lean-run-import.service';
import { ResearchFactoryService } from '../research/research-factory.service';

@Injectable()
export class LearningLoopService {
  constructor(
    private readonly leanRunImportService: LeanRunImportService,
    @InjectRepository(AlphaDecision)
    private readonly alphaRepository: Repository<AlphaDecision>,
    @InjectRepository(AlphaOutcomeLabel)
    private readonly labelRepository: Repository<AlphaOutcomeLabel>,
    @InjectRepository(MarketDataBar)
    private readonly marketDataRepository: Repository<MarketDataBar>,
    @InjectRepository(LiveShadowRecord)
    private readonly liveShadowRepository: Repository<LiveShadowRecord>,
    @InjectRepository(PromotionDecision)
    private readonly promotionRepository: Repository<PromotionDecision>,
    @InjectRepository(AgentEvaluationRun)
    private readonly agentRunRepository: Repository<AgentEvaluationRun>,
    @InjectRepository(AgentDecisionRecord)
    private readonly agentDecisionRepository: Repository<AgentDecisionRecord>,
    @InjectRepository(AgentForecastLabel)
    private readonly agentLabelRepository: Repository<AgentForecastLabel>,
    @InjectRepository(PaperOrderPlan)
    private readonly paperPlanRepository: Repository<PaperOrderPlan>,
    private readonly researchFactoryService: ResearchFactoryService,
  ) {}

  async runLearningLoop(): Promise<{
    labelsCreated: number;
    promotionDecision: PromotionDecision;
    activeAgentPromotionDecision: PromotionDecision;
  }> {
    const labels = await this.labelAvailableAlphaOutcomes();
    const promotionDecision = await this.recordStrategyPromotionDecision();
    const activeAgentPromotionDecision =
      await this.recordActiveAgentPromotionDecision();
    return {
      labelsCreated: labels.length,
      promotionDecision,
      activeAgentPromotionDecision,
    };
  }

  async labelAvailableAlphaOutcomes(): Promise<AlphaOutcomeLabel[]> {
    const decisions = await this.alphaRepository.find({
      order: { asOf: 'DESC' },
      take: 250,
    });
    const created: AlphaOutcomeLabel[] = [];

    for (const decision of decisions) {
      const existing = await this.labelRepository.findOne({
        where: { alphaDecisionId: decision.id },
      });
      if (existing) {
        continue;
      }
      const label = await this.buildLabel(decision);
      if (label) {
        created.push(await this.labelRepository.save(label));
      }
    }

    return created;
  }

  async recordStrategyPromotionDecision(): Promise<PromotionDecision> {
    const latestRun = await this.leanRunImportService.getLatestStrategyRun();
    const liveShadow = await this.findLatestLeanOwnedShadowRecord(
      latestRun?.runId,
    );
    const decidedAt = new Date().toISOString();
    const blockers: string[] = [];

    if (!latestRun) {
      blockers.push('No LEAN run exists.');
    } else {
      if (latestRun.runtime !== 'quantconnect-cloud') {
        blockers.push('Latest LEAN run is not QuantConnect Cloud evidence.');
      }
      if (latestRun.status !== 'passed') {
        blockers.push(`Latest LEAN run status is ${latestRun.status}.`);
      }
      if (!latestRun.promotionEligible) {
        blockers.push('Latest LEAN run is not promotion eligible.');
      }
    }
    if (!liveShadow) {
      blockers.push('No shadow trading record exists.');
    } else if (liveShadow.status !== 'recorded') {
      blockers.push('Latest shadow trading record is blocked.');
    } else if (liveShadow.evidenceMode !== 'current_live_shadow') {
      blockers.push(
        `Latest shadow trading evidenceMode legacy field is ${liveShadow.evidenceMode}; current_live_shadow required for promotion.`,
      );
    }

    const evidenceRefs = [
      ...(latestRun ? [`lean-run:${latestRun.runId}`] : []),
      ...(liveShadow ? [`live-shadow:${liveShadow.id}`] : []),
    ];
    const targetRef = latestRun
      ? `strategy:${latestRun.projectName}:${latestRun.runId}`
      : 'strategy:missing-run';
    const selectedRunBias =
      await this.researchFactoryService.checkSelectedRunBias({
        targetRef,
      });
    if (selectedRunBias.status === 'blocked') {
      blockers.push(
        ...selectedRunBias.blockers.map(
          (blocker) => `Selected-run-bias check: ${blocker}`,
        ),
      );
    }
    evidenceRefs.push(...selectedRunBias.jobRefs);
    const metrics = {
      labels: await this.labelRepository.count(),
      cloudRuntime: latestRun?.runtime === 'quantconnect-cloud',
      liveShadowRecorded: liveShadow?.status === 'recorded',
      currentLiveShadow: liveShadow?.evidenceMode === 'current_live_shadow',
      selectedRunBiasStatus: selectedRunBias.status,
      attemptedVariantCount: selectedRunBias.attemptedVariantCount,
      failedOrBlockedVariantCount: selectedRunBias.failedOrBlockedVariantCount,
    };
    const payload = {
      scope: 'strategy' as const,
      targetRef,
      decidedAt,
      status: blockers.length ? ('blocked' as const) : ('accepted' as const),
      evidenceRefs,
      blockerReasons: blockers,
      metrics,
    };

    return this.promotionRepository.save(
      this.promotionRepository.create({
        id: this.promotionId('promotion', decidedAt, payload),
        decisionHash: hashObject(payload),
        ...payload,
      }),
    );
  }

  async recordActiveAgentPromotionDecision(): Promise<PromotionDecision> {
    const latestRun = await this.agentRunRepository.findOne({
      where: {},
      order: { startedAt: 'DESC' },
    });
    const decidedAt = new Date().toISOString();
    const blockers: string[] = [];
    const decisions = latestRun
      ? await this.agentDecisionRepository.find({
          where: { runId: latestRun.runId },
          order: { createdAt: 'DESC' },
        })
      : [];
    const labels = latestRun
      ? await this.agentLabelRepository.find({
          where: { runId: latestRun.runId, status: 'labeled' },
          order: { createdAt: 'DESC' },
        })
      : [];
    const shadow = latestRun
      ? await this.findLatestActiveAgentShadowRecord(latestRun.runId)
      : undefined;
    const paperPlan = latestRun
      ? await this.findLatestActiveAgentPaperPlan(latestRun.runId)
      : undefined;

    if (!latestRun) {
      blockers.push('No active LLM agent run exists.');
    } else {
      if (latestRun.status !== 'passed') {
        blockers.push(
          `Latest active LLM agent run status is ${latestRun.status}.`,
        );
      }
      if (!decisions.some((decision) => decision.status === 'proposed')) {
        blockers.push('No proposed active LLM decisions are available.');
      }
      if (labels.length === 0) {
        blockers.push('No labeled active LLM forecasts are available yet.');
      }
      if (!shadow || shadow.status !== 'recorded') {
        blockers.push('No recorded active LLM shadow arena exists.');
      }
      if (!paperPlan || !['filled', 'reconciled'].includes(paperPlan.status)) {
        blockers.push('No filled active LLM paper order-plan exists.');
      }
      if (paperPlan && paperPlan.reconciliation?.status !== 'matched') {
        blockers.push('Active LLM paper order-plan is not reconciled.');
      }
      blockers.push(
        'Active LLM promotion thresholds are not configured; recording evidence only.',
      );
    }

    const evidenceRefs = [
      ...(latestRun ? [`agent-run:${latestRun.runId}`] : []),
      ...decisions.map((decision) => `agent-decision:${decision.id}`),
      ...labels.map((label) => `agent-forecast-label:${label.id}`),
      ...(shadow ? [`live-shadow:${shadow.id}`] : []),
      ...(paperPlan ? [`paper-order-plan:${paperPlan.id}`] : []),
    ];
    const targetRef = latestRun
      ? `strategy:active-llm-agent:${latestRun.strategyVariant}:${latestRun.runId}`
      : 'strategy:active-llm-agent:missing-run';
    const metrics = {
      runPresent: Boolean(latestRun),
      decisionCount: decisions.length,
      proposedDecisionCount: decisions.filter(
        (decision) => decision.status === 'proposed',
      ).length,
      labeledForecastCount: labels.length,
      averageBrierScore: average(labels.map((label) => label.brierScore)),
      averageLogScore: average(labels.map((label) => label.logScore)),
      activeAgentShadowRecorded: shadow?.status === 'recorded',
      wouldHaveTradedCount: Array.isArray(shadow?.wouldHaveTraded)
        ? shadow.wouldHaveTraded.length
        : 0,
      paperPlanStatus: paperPlan?.status ?? null,
      reconciliationMatched: paperPlan?.reconciliation?.status === 'matched',
      brokerWriteAllowed: false,
      brokerWriteSpecApproved: false,
    };
    const payload = {
      scope: 'strategy' as const,
      targetRef,
      decidedAt,
      status: 'blocked' as const,
      evidenceRefs,
      blockerReasons: blockers,
      metrics,
    };

    return this.promotionRepository.save(
      this.promotionRepository.create({
        id: this.promotionId('active-agent-promotion', decidedAt, payload),
        decisionHash: hashObject(payload),
        ...payload,
      }),
    );
  }

  private async findLatestLeanOwnedShadowRecord(
    leanRunId: string | undefined,
  ): Promise<LiveShadowRecord | undefined> {
    if (!leanRunId) {
      return undefined;
    }
    const candidates = await this.liveShadowRepository.find({
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return candidates.find(
      (record) =>
        record.leanRunId === leanRunId &&
        Boolean(record.portfolioTargetSnapshotId) &&
        record.evidenceRefs.includes(`lean-run:${leanRunId}`) &&
        record.evidenceRefs.some((ref) =>
          ref.startsWith('portfolio-target:'),
        ) &&
        !record.evidenceRefs.includes('evidence-mode:active-llm-agent-shadow'),
    );
  }

  private async findLatestActiveAgentShadowRecord(
    runId: string,
  ): Promise<LiveShadowRecord | undefined> {
    const candidates = await this.liveShadowRepository.find({
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return candidates.find(
      (record) =>
        record.evidenceRefs.includes(`agent-run:${runId}`) &&
        record.evidenceRefs.includes('evidence-mode:active-llm-agent-shadow'),
    );
  }

  private async findLatestActiveAgentPaperPlan(
    runId: string,
  ): Promise<PaperOrderPlan | undefined> {
    const plans = await this.paperPlanRepository.find({
      order: { updatedAt: 'DESC' },
      take: 50,
    });
    return plans.find((plan) =>
      plan.idempotencyKey.startsWith(`active-agent-paper:${runId}:`),
    );
  }

  private promotionId(prefix: string, decidedAt: string, payload: unknown) {
    const time = decidedAt.replace(/[-:TZ.]/g, '').slice(0, 14);
    const suffix = hashObject(payload).replace('sha256:', '').slice(0, 10);
    return `${prefix}-${time}-${suffix}`;
  }

  private async buildLabel(
    decision: AlphaDecision,
  ): Promise<AlphaOutcomeLabel | null> {
    const horizonHours = alphaHorizonHours(decision);
    const labelStart = this.labelStart(decision);
    const labelAt = new Date(
      new Date(labelStart).getTime() + horizonHours * 60 * 60 * 1000,
    ).toISOString();
    const startBar = await this.firstBarAtOrAfter(decision.symbol, labelStart);
    const endBar = await this.firstBarAtOrAfter(decision.symbol, labelAt);
    const startBenchmark = await this.firstBarAtOrAfter('SPY', labelStart);
    const endBenchmark = await this.firstBarAtOrAfter('SPY', labelAt);
    if (!startBar || !endBar || !startBenchmark || !endBenchmark) {
      return null;
    }

    const forwardReturnBps = this.returnBps(startBar.close, endBar.close);
    const benchmarkReturnBps = this.returnBps(
      startBenchmark.close,
      endBenchmark.close,
    );
    const payload = {
      alphaDecisionId: decision.id,
      symbol: decision.symbol,
      asOf: decision.asOf,
      availableAt: decision.availableAt,
      horizonHours,
      labelAt,
      forwardReturnBps,
      benchmarkReturnBps,
      relativeReturnBps: Number(
        (forwardReturnBps - benchmarkReturnBps).toFixed(4),
      ),
      sourceRefs: [
        `market-data-bar:${startBar.id}`,
        `market-data-bar:${endBar.id}`,
        `market-data-bar:${startBenchmark.id}`,
        `market-data-bar:${endBenchmark.id}`,
      ],
    };
    return this.labelRepository.create({
      id: `label-${decision.id}-${horizonHours}h`,
      labelHash: hashObject(payload),
      ...payload,
    });
  }

  private async firstBarAtOrAfter(
    symbol: string,
    timestamp: string,
  ): Promise<MarketDataBar | null> {
    const records = await this.marketDataRepository.find({
      where: {
        datasetId: 'v1-lean-universe',
        timeframe: '1d',
        symbol,
        timestamp: MoreThanOrEqual(timestamp),
      },
      order: { timestamp: 'ASC' },
      take: 1,
    });
    return records[0] ?? null;
  }

  private labelStart(decision: AlphaDecision): string {
    const asOf = new Date(decision.asOf).getTime();
    const availableAt = new Date(decision.availableAt).getTime();
    if (!Number.isFinite(asOf)) {
      return new Date(0).toISOString();
    }
    return new Date(
      Math.max(asOf, Number.isFinite(availableAt) ? availableAt : asOf),
    ).toISOString();
  }

  private returnBps(startPrice: number, endPrice: number): number {
    if (startPrice <= 0) {
      return 0;
    }
    return Number(((endPrice / startPrice - 1) * 10_000).toFixed(4));
  }
}

function average(values: Array<number | undefined>): number | null {
  const finite = values.filter(
    (value): value is number =>
      typeof value === 'number' && Number.isFinite(value),
  );
  if (!finite.length) {
    return null;
  }
  return Number(
    (finite.reduce((sum, value) => sum + value, 0) / finite.length).toFixed(6),
  );
}
