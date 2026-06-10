/**
 * Routes active LLM decisions through the existing proposal, risk, paper execution,
 * and reconciliation ledgers. This proves order-plan plumbing only; broker writes
 * remain disabled and the compatibility research run is not backtest evidence.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentDecisionRecord } from '../../../entities/agent-decision-record.entity';
import { AgentEvaluationRun } from '../../../entities/agent-evaluation-run.entity';
import { LiveShadowRecord } from '../../../entities/live-shadow-record.entity';
import { PaperOrderPlan } from '../../../entities/paper-order-plan.entity';
import { hashObject } from '../../../shared/hash.util';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import type {
  CreateInvestmentProposalRequest,
  CreateResearchRunRequest,
} from '../../control-plane/control-plane.types';
import {
  ACTIVE_AGENT_MAX_GROSS_EXPOSURE_PCT,
  ACTIVE_AGENT_MAX_ORDER_NOTIONAL_USD,
  ACTIVE_AGENT_MAX_SINGLE_POSITION_PCT,
  ACTIVE_AGENT_ORDER_INTENT_MAPPER_VERSION,
  ACTIVE_AGENT_PAPER_EQUITY_USD,
  mapActiveAgentDecisionsToOrders,
} from '../agent/active-agent-order-intent.mapper';
import { ActiveLlmAgentShadowService } from '../agent/active-llm-agent-shadow.service';

const ACTIVE_AGENT_PAPER_BUDGET_NAME = 'Active LLM Paper Budget (ETF)';
const ACTIVE_AGENT_STRATEGY_ID = 'active-llm-agent';
const ACTIVE_AGENT_BRIDGE_ACTOR = 'system:active-llm-paper-bridge';

export interface ActiveAgentPaperBridgeOptions {
  runId?: string;
  maxActions?: number;
}

export interface ActiveAgentPaperBridgeResult {
  status: 'passed' | 'blocked' | 'failed';
  run: AgentEvaluationRun | null;
  decisions: AgentDecisionRecord[];
  shadowRecord: LiveShadowRecord | null;
  proposalId?: number;
  researchRunId?: number;
  paperPlan: PaperOrderPlan | null;
  idempotencyKey?: string;
  blockers: string[];
  evidenceRefs: string[];
}

@Injectable()
export class ActiveLlmPaperBridgeService {
  constructor(
    private readonly controlPlaneService: ControlPlaneService,
    private readonly activeLlmAgentShadowService: ActiveLlmAgentShadowService,
    @InjectRepository(AgentDecisionRecord)
    private readonly decisionRepository: Repository<AgentDecisionRecord>,
    @InjectRepository(AgentEvaluationRun)
    private readonly runRepository: Repository<AgentEvaluationRun>,
    @InjectRepository(PaperOrderPlan)
    private readonly paperPlanRepository: Repository<PaperOrderPlan>,
  ) {}

  async runPaperCycle(
    options: ActiveAgentPaperBridgeOptions = {},
  ): Promise<ActiveAgentPaperBridgeResult> {
    const run = await this.findAgentRun(options.runId);
    if (!run) {
      return this.blocked({
        run,
        decisions: [],
        shadowRecord: null,
        paperPlan: null,
        blockers: [
          options.runId
            ? `Active LLM agent run ${options.runId} was not found.`
            : 'No active LLM agent run found for paper bridge.',
        ],
      });
    }
    if (run.status === 'blocked') {
      return this.blocked({
        run,
        decisions: [],
        shadowRecord: null,
        paperPlan: null,
        blockers: run.blockerReasons,
      });
    }

    const decisions = await this.decisionRepository.find({
      where: { runId: run.runId, status: 'proposed' },
      order: { confidence: 'DESC' },
    });
    const mapped = mapActiveAgentDecisionsToOrders(decisions, {
      maxActions: options.maxActions,
    });
    const blockers = [...mapped.blockers];
    if (decisions.length === 0) {
      blockers.push('No proposed active LLM decisions are available.');
    }
    if (blockers.length > 0) {
      return this.blocked({
        run,
        decisions,
        shadowRecord: null,
        paperPlan: null,
        blockers,
        evidenceRefs: [`agent-run:${run.runId}`, ...mapped.evidenceRefs],
      });
    }

    const idempotencyKey = this.paperIdempotencyKey(run, decisions, {
      maxActions: options.maxActions,
    });
    const existingPlan = await this.findExistingPlan(idempotencyKey);
    if (existingPlan) {
      const reconciled = await this.reconcileFilledPlan(existingPlan);
      return {
        status: this.statusFromPlan(reconciled),
        run,
        decisions,
        shadowRecord: null,
        proposalId: reconciled.proposalId,
        researchRunId: reconciled.researchRunId,
        paperPlan: reconciled,
        idempotencyKey,
        blockers: reconciled.blockedReasons ?? [],
        evidenceRefs: [
          `agent-run:${run.runId}`,
          `paper-order-plan:${reconciled.id}`,
          ...mapped.evidenceRefs,
        ],
      };
    }

    const shadow = await this.activeLlmAgentShadowService.runShadowArena({
      runId: run.runId,
      maxActions: options.maxActions,
    });
    if (
      shadow.status !== 'recorded' ||
      shadow.riskDecision?.decision === 'DENY'
    ) {
      return this.blocked({
        run,
        decisions,
        shadowRecord: shadow.record,
        paperPlan: null,
        blockers: shadow.blockers.length
          ? shadow.blockers
          : ['Active LLM shadow risk gate did not record an allowed intent.'],
        idempotencyKey,
        evidenceRefs: [
          `agent-run:${run.runId}`,
          `live-shadow:${shadow.record.id}`,
          ...mapped.evidenceRefs,
        ],
      });
    }

    try {
      const budget = await this.ensureBudget();
      const paperAccount = await this.ensurePaperAccount(
        budget.id,
        idempotencyKey,
      );
      await this.ensureBrokerSnapshot(paperAccount.id);
      const now = new Date().toISOString();
      const marketDataTimestamp =
        latestTimestamp(decisions.map((decision) => decision.availableAt)) ??
        now;
      const researchRun = await this.controlPlaneService.createResearchRun(
        this.buildResearchRunRequest({
          budgetEnvelopeId: budget.id,
          run,
          decisions,
          orderCount: mapped.orders.length,
          shadowRecord: shadow.record,
          marketDataTimestamp,
          now,
        }),
      );
      const proposal = await this.controlPlaneService.createProposal(
        this.buildProposalRequest({
          budgetEnvelopeId: budget.id,
          researchRunId: researchRun.id,
          paperAccount,
          run,
          decisions,
          orders: mapped.orders,
          marketDataTimestamp,
          now,
        }),
      );
      const riskEvaluation = await this.controlPlaneService.evaluateProposal(
        proposal.id,
      );
      if (riskEvaluation.decision === 'DENY') {
        return this.blocked({
          run,
          decisions,
          shadowRecord: shadow.record,
          paperPlan: null,
          proposalId: proposal.id,
          researchRunId: researchRun.id,
          idempotencyKey,
          blockers: riskEvaluation.reasons,
          evidenceRefs: [
            `agent-run:${run.runId}`,
            `live-shadow:${shadow.record.id}`,
            `research-run:${researchRun.id}`,
            `investment-proposal:${proposal.id}`,
            ...mapped.evidenceRefs,
          ],
        });
      }

      const latestEvent = await this.latestPaperAccountEventHash(
        paperAccount.id,
      );
      const approval = await this.controlPlaneService.createOrderPlanApproval(
        proposal.id,
        {
          idempotencyKey,
          approver: ACTIVE_AGENT_BRIDGE_ACTOR,
          reason:
            'Auto-approve paper-only active LLM order-plan rehearsal; broker writes remain disabled.',
          expectedPaperAccountEventHash: latestEvent,
          approvalSource: 'paper_auto',
          autoApprovalPolicyRef: ACTIVE_AGENT_ORDER_INTENT_MAPPER_VERSION,
        },
      );
      const plan = await this.controlPlaneService.paperExecuteProposal(
        proposal.id,
        {
          idempotencyKey,
          orderPlanApprovalId: approval.id,
        },
      );
      const reconciled = await this.reconcileFilledPlan(plan);

      return {
        status: this.statusFromPlan(reconciled),
        run,
        decisions,
        shadowRecord: shadow.record,
        proposalId: proposal.id,
        researchRunId: researchRun.id,
        paperPlan: reconciled,
        idempotencyKey,
        blockers: reconciled.blockedReasons ?? [],
        evidenceRefs: [
          `agent-run:${run.runId}`,
          `live-shadow:${shadow.record.id}`,
          `research-run:${researchRun.id}`,
          `investment-proposal:${proposal.id}`,
          `paper-order-plan:${reconciled.id}`,
          ...mapped.evidenceRefs,
        ],
      };
    } catch (error) {
      return this.blocked({
        run,
        decisions,
        shadowRecord: shadow.record,
        paperPlan: null,
        idempotencyKey,
        blockers: [errorMessage(error)],
        evidenceRefs: [
          `agent-run:${run.runId}`,
          `live-shadow:${shadow.record.id}`,
          ...mapped.evidenceRefs,
        ],
      });
    }
  }

  private async findAgentRun(
    runId: string | undefined,
  ): Promise<AgentEvaluationRun | null> {
    if (runId) {
      return this.runRepository.findOne({ where: { runId } });
    }
    return this.runRepository.findOne({
      where: {},
      order: { startedAt: 'DESC' },
    });
  }

  private async findExistingPlan(
    idempotencyKey: string,
  ): Promise<PaperOrderPlan | null> {
    const plans = await this.paperPlanRepository.find({
      where: { idempotencyKey },
      order: { updatedAt: 'DESC' },
      take: 1,
    });
    return plans[0] ?? null;
  }

  private async reconcileFilledPlan(
    plan: PaperOrderPlan,
  ): Promise<PaperOrderPlan> {
    if (plan.status !== 'filled' || plan.reconciliation?.status === 'matched') {
      return plan;
    }
    return this.controlPlaneService.reconcilePaperOrderPlan(plan.id, {
      notes: ['Auto-reconciled by active LLM paper bridge.'],
    });
  }

  private async ensureBudget() {
    const budgets = await this.controlPlaneService.listBudgetEnvelopes();
    const existing = budgets.find(
      (budget) => budget.name === ACTIVE_AGENT_PAPER_BUDGET_NAME,
    );
    if (existing) {
      return existing;
    }
    return this.controlPlaneService.createBudgetEnvelope({
      name: ACTIVE_AGENT_PAPER_BUDGET_NAME,
      currency: 'USD',
      totalBudget: ACTIVE_AGENT_PAPER_EQUITY_USD,
      mode: 'paper',
      allowedAssetClasses: ['cash', 'foreign_etf', 'foreign_stock'],
      policy: {
        maxDataAgeMinutes: 10_080,
        maxOrderNotional: ACTIVE_AGENT_MAX_ORDER_NOTIONAL_USD,
        maxSinglePositionPct: ACTIVE_AGENT_MAX_SINGLE_POSITION_PCT,
        maxGrossExposurePct: ACTIVE_AGENT_MAX_GROSS_EXPOSURE_PCT,
      },
      notes:
        'Paper-only budget for active LLM decision rehearsal; broker writes disabled.',
    });
  }

  private async ensurePaperAccount(budgetEnvelopeId: number, cycleKey: string) {
    try {
      const existing = await this.controlPlaneService.getPaperAccountState();
      if (existing.budgetEnvelopeId === budgetEnvelopeId) {
        return existing;
      }
    } catch {
      // The explicit seed path below records first paper-account custody evidence.
    }

    const seeded = await this.controlPlaneService.seedPaperAccount({
      budgetEnvelopeId,
      cash: ACTIVE_AGENT_PAPER_EQUITY_USD,
      equity: ACTIVE_AGENT_PAPER_EQUITY_USD,
      currency: 'USD',
      actor: ACTIVE_AGENT_BRIDGE_ACTOR,
      reason: 'Seed paper account for active LLM paper bridge.',
      idempotencyKey: `${cycleKey}:seed:${budgetEnvelopeId}`,
    });
    const latestHash = await this.latestPaperAccountEventHash(seeded.id);
    return this.controlPlaneService.promotePaperAccount(seeded.id, {
      actor: ACTIVE_AGENT_BRIDGE_ACTOR,
      reason: 'Promote active LLM paper account.',
      idempotencyKey: `${cycleKey}:promote:${budgetEnvelopeId}`,
      expectedEventHash: latestHash,
    });
  }

  private async ensureBrokerSnapshot(paperAccountId: number): Promise<void> {
    const snapshots = await this.controlPlaneService.listBrokerSnapshots();
    if (snapshots.length > 0) {
      return;
    }
    await this.controlPlaneService.importBrokerSnapshot({
      provider: 'simulated',
      currency: 'USD',
      cash: ACTIVE_AGENT_PAPER_EQUITY_USD,
      equity: ACTIVE_AGENT_PAPER_EQUITY_USD,
      grossExposurePct: 0,
      positions: [],
      asOf: new Date().toISOString(),
      accountRef: `paper-${paperAccountId}`,
    });
  }

  private async latestPaperAccountEventHash(paperAccountId: number) {
    const events = await this.controlPlaneService.listPaperAccountEvents();
    const latest = events.find(
      (event) => event.paperAccountId === paperAccountId,
    );
    if (!latest?.eventHash) {
      throw new Error(
        `Paper account ${paperAccountId} has no custody event hash.`,
      );
    }
    return latest.eventHash;
  }

  private buildResearchRunRequest(input: {
    budgetEnvelopeId: number;
    run: AgentEvaluationRun;
    decisions: AgentDecisionRecord[];
    orderCount: number;
    shadowRecord: LiveShadowRecord;
    marketDataTimestamp: string;
    now: string;
  }): CreateResearchRunRequest {
    const windowStart = earliestTimestamp(
      input.decisions.map((decision) => decision.availableAt),
    );
    const windowEnd =
      latestTimestamp(
        input.decisions.map((decision) => decision.availableAt),
      ) ?? input.now;
    const artifactRefs = [
      `agent-run:${input.run.runId}`,
      `live-shadow:${input.shadowRecord.id}`,
      ...input.decisions.map((decision) => `agent-decision:${decision.id}`),
    ];
    return {
      budgetEnvelopeId: input.budgetEnvelopeId,
      objective: 'Active LLM agent paper order-plan rehearsal',
      strategyFamily: ACTIVE_AGENT_STRATEGY_ID,
      hypothesis:
        'Risk-gated active LLM decisions can produce paper order-plan, fill, and reconciliation artifacts without broker writes.',
      datasetRefs: [
        {
          id: 'active-llm-agent-decision-ledger',
          source: 'agent_decision_records',
          windowStart: windowStart ?? input.marketDataTimestamp,
          windowEnd,
          availabilityTimestamp: windowEnd,
          marketDataTimestamp: input.marketDataTimestamp,
          frequency: 'event',
          universe: input.run.symbols,
        },
      ],
      featureRefs: [
        ...new Set(
          input.decisions.flatMap((decision) => decision.sourceSnapshotRefs),
        ),
      ],
      timestampLagRules: [
        'Use AgentDecisionRecord.availableAt as the market-data timestamp for paper rehearsal.',
        'Do not use future outcome labels when creating the proposal.',
      ],
      noLookaheadChecked: true,
      benchmark: 'SPY',
      costModel: 'paper-sim-v1',
      slippageModel: 'paper-sim-v1',
      modelName: input.run.strategyVariant,
      modelCategory: 'llm_policy',
      trainingWindow: {
        start: windowStart ?? input.marketDataTimestamp,
        end: windowEnd,
      },
      validationWindow: {
        start: windowStart ?? input.marketDataTimestamp,
        end: windowEnd,
      },
      backtestMetrics: {
        startValue: ACTIVE_AGENT_PAPER_EQUITY_USD,
        endValue: ACTIVE_AGENT_PAPER_EQUITY_USD,
        totalReturnPct: 0,
        benchmarkReturnPct: 0,
        maxDrawdownPct: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        informationRatio: 0,
        turnoverPct: 0,
        totalFees: 0,
        tradeCount: input.orderCount,
        winRatePct: 0,
        profitFactor: 0,
      },
      artifactRefs,
      artifactHashes: Object.fromEntries(
        artifactRefs.map((ref) => [
          ref,
          ref.startsWith('agent-decision:')
            ? (input.decisions.find((decision) => ref.endsWith(decision.id))
                ?.outputHash ?? hashObject(ref))
            : ref === `agent-run:${input.run.runId}`
              ? (input.run.outputHash ?? input.run.inputHash)
              : input.shadowRecord.recordHash,
        ]),
      ),
      knownFailureModes: [
        'This research run is a compatibility wrapper for paper-order provenance, not a LEAN or QuantConnect Cloud backtest.',
        'Promotion to broker writes must ignore this artifact unless a separate broker-write spec approval exists.',
      ],
    };
  }

  private buildProposalRequest(input: {
    budgetEnvelopeId: number;
    researchRunId: number;
    paperAccount: {
      currency?: string;
      equity: number;
      cash: number;
      grossExposurePct: number;
      positions?: CreateInvestmentProposalRequest['portfolioSnapshot']['positions'];
    };
    run: AgentEvaluationRun;
    decisions: AgentDecisionRecord[];
    orders: CreateInvestmentProposalRequest['orders'];
    marketDataTimestamp: string;
    now: string;
  }): CreateInvestmentProposalRequest {
    return {
      budgetEnvelopeId: input.budgetEnvelopeId,
      researchRunId: input.researchRunId,
      strategyId: ACTIVE_AGENT_STRATEGY_ID,
      ruleId: ACTIVE_AGENT_ORDER_INTENT_MAPPER_VERSION,
      actor: 'llm',
      generatedAt: input.now,
      marketDataTimestamp: input.marketDataTimestamp,
      portfolioSnapshot: {
        currency: input.paperAccount.currency ?? 'USD',
        equity: input.paperAccount.equity,
        cash: input.paperAccount.cash,
        grossExposurePct: input.paperAccount.grossExposurePct,
        positions: input.paperAccount.positions ?? [],
      },
      orders: input.orders,
      thesis: `Paper-only rehearsal for active LLM run ${input.run.runId}; risk gate and paper ledgers decide execution intent.`,
      evidenceRefs: [
        `agent-run:${input.run.runId}`,
        ...input.decisions.map((decision) => `agent-decision:${decision.id}`),
        `mapper:${ACTIVE_AGENT_ORDER_INTENT_MAPPER_VERSION}`,
      ],
    };
  }

  private paperIdempotencyKey(
    run: AgentEvaluationRun,
    decisions: AgentDecisionRecord[],
    options: { maxActions?: number },
  ): string {
    const selected = mapActiveAgentDecisionsToOrders(decisions, {
      maxActions: options.maxActions,
    }).selectedDecisionIds;
    const selectedDecisions = decisions.filter((decision) =>
      selected.includes(decision.id),
    );
    const hash = hashObject({
      runId: run.runId,
      selectedDecisionIds: selected,
      hashes: selectedDecisions.map((decision) => ({
        id: decision.id,
        inputHash: decision.inputHash,
        outputHash: decision.outputHash,
      })),
      mapperVersion: ACTIVE_AGENT_ORDER_INTENT_MAPPER_VERSION,
      maxActions: options.maxActions ?? 3,
    })
      .replace('sha256:', '')
      .slice(0, 16);
    return `active-agent-paper:${run.runId}:${hash}`;
  }

  private statusFromPlan(
    plan: PaperOrderPlan,
  ): 'passed' | 'blocked' | 'failed' {
    if (['filled', 'reconciled'].includes(plan.status)) {
      return 'passed';
    }
    if (['failed', 'reconciliation_failed', 'killed'].includes(plan.status)) {
      return 'failed';
    }
    return 'blocked';
  }

  private blocked(input: {
    run: AgentEvaluationRun | null;
    decisions: AgentDecisionRecord[];
    shadowRecord: LiveShadowRecord | null;
    paperPlan: PaperOrderPlan | null;
    proposalId?: number;
    researchRunId?: number;
    idempotencyKey?: string;
    blockers: string[];
    evidenceRefs?: string[];
  }): ActiveAgentPaperBridgeResult {
    return {
      status: 'blocked',
      run: input.run,
      decisions: input.decisions,
      shadowRecord: input.shadowRecord,
      proposalId: input.proposalId,
      researchRunId: input.researchRunId,
      paperPlan: input.paperPlan,
      idempotencyKey: input.idempotencyKey,
      blockers: input.blockers,
      evidenceRefs: input.evidenceRefs ?? [],
    };
  }
}

function latestTimestamp(values: string[]): string | undefined {
  return validTimestamps(values).sort(
    (left, right) => new Date(right).getTime() - new Date(left).getTime(),
  )[0];
}

function earliestTimestamp(values: string[]): string | undefined {
  return validTimestamps(values).sort(
    (left, right) => new Date(left).getTime() - new Date(right).getTime(),
  )[0];
}

function validTimestamps(values: string[]): string[] {
  return values.filter((value) => Number.isFinite(new Date(value).getTime()));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown blocked condition.';
}
