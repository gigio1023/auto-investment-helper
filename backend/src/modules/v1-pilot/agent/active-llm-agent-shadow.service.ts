import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgentDecisionRecord,
  AgentDecisionStatus,
} from '../../../entities/agent-decision-record.entity';
import { AgentEvaluationRun } from '../../../entities/agent-evaluation-run.entity';
import { LiveShadowRecord } from '../../../entities/live-shadow-record.entity';
import { hashObject } from '../../../shared/hash.util';
import { RiskGateService } from '../../risk-gate/risk-gate.service';
import type {
  ProposedOrder,
  RiskGateResponse,
} from '../../risk-gate/risk-gate.types';
import {
  ACTIVE_AGENT_MAX_GROSS_EXPOSURE_PCT,
  ACTIVE_AGENT_MAX_ORDER_NOTIONAL_USD,
  ACTIVE_AGENT_MAX_SINGLE_POSITION_PCT,
  ACTIVE_AGENT_PAPER_EQUITY_USD,
  mapActiveAgentDecisionsToOrders,
} from './active-agent-order-intent.mapper';

export interface ActiveAgentShadowOptions {
  runId?: string;
  maxActions?: number;
}

export interface ActiveAgentShadowResult {
  status: 'recorded' | 'blocked';
  run: AgentEvaluationRun | null;
  decisions: AgentDecisionRecord[];
  riskDecision: RiskGateResponse | null;
  record: LiveShadowRecord;
  blockers: string[];
}

@Injectable()
export class ActiveLlmAgentShadowService {
  constructor(
    @InjectRepository(AgentDecisionRecord)
    private readonly decisionRepository: Repository<AgentDecisionRecord>,
    @InjectRepository(AgentEvaluationRun)
    private readonly runRepository: Repository<AgentEvaluationRun>,
    @InjectRepository(LiveShadowRecord)
    private readonly liveShadowRepository: Repository<LiveShadowRecord>,
    private readonly riskGateService: RiskGateService,
  ) {}

  async runShadowArena(
    options: ActiveAgentShadowOptions = {},
  ): Promise<ActiveAgentShadowResult> {
    const run = await this.findAgentRun(options.runId);
    const blockers: string[] = [];
    if (!run) {
      blockers.push(
        options.runId
          ? `Active LLM agent run ${options.runId} was not found.`
          : 'No active LLM agent run found for shadow arena.',
      );
    } else if (run.status === 'blocked') {
      blockers.push(...run.blockerReasons);
    }

    const decisions = run
      ? await this.decisionRepository.find({
          where: {
            runId: run.runId,
            status: 'proposed' as AgentDecisionStatus,
          },
          order: { confidence: 'DESC' },
        })
      : [];
    const mapped = mapActiveAgentDecisionsToOrders(decisions, {
      maxActions: options.maxActions,
    });
    const orders = mapped.orders;
    if (run && decisions.length === 0) {
      blockers.push('No proposed active LLM decisions are available.');
    }
    blockers.push(...mapped.blockers);

    const now = new Date().toISOString();
    const marketDataTimestamp = latestTimestamp(
      decisions.map((decision) => decision.availableAt),
    );
    let riskDecision: RiskGateResponse | null = null;
    if (run && orders.length > 0 && blockers.length === 0) {
      riskDecision = this.riskGateService.evaluate({
        mode: 'dry_run',
        actor: 'llm',
        strategyId: 'active-llm-agent',
        ruleId: 'risk-gated-shadow-v1',
        generatedAt: now,
        marketDataTimestamp: marketDataTimestamp ?? now,
        portfolio: {
          currency: 'USD',
          equity: ACTIVE_AGENT_PAPER_EQUITY_USD,
          cash: ACTIVE_AGENT_PAPER_EQUITY_USD,
          grossExposurePct: 0,
          positions: [],
        },
        orders,
        policy: {
          maxDataAgeMinutes: 10_080,
          maxOrderNotional: ACTIVE_AGENT_MAX_ORDER_NOTIONAL_USD,
          maxSinglePositionPct: ACTIVE_AGENT_MAX_SINGLE_POSITION_PCT,
          maxGrossExposurePct: ACTIVE_AGENT_MAX_GROSS_EXPOSURE_PCT,
          allowedAssetClasses: ['foreign_etf', 'foreign_stock', 'cash'],
          requireHumanApproval: true,
        },
        evidenceRefs: [`agent-run:${run.runId}`, ...mapped.evidenceRefs],
        executionIntent: 'evaluate_only',
      });
      if (riskDecision.decision === 'DENY') {
        blockers.push(...riskDecision.reasons);
      }
    }

    const record = await this.saveShadowRecord({
      now,
      run,
      decisions,
      orders,
      riskDecision,
      blockers,
      mapperVersion: mapped.mapperVersion,
    });
    return {
      status: record.status,
      run,
      decisions,
      riskDecision,
      record,
      blockers,
    };
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

  private async saveShadowRecord(input: {
    now: string;
    run: AgentEvaluationRun | null;
    decisions: AgentDecisionRecord[];
    orders: ProposedOrder[];
    riskDecision: RiskGateResponse | null;
    blockers: string[];
    mapperVersion: string;
  }): Promise<LiveShadowRecord> {
    const status: LiveShadowRecord['status'] =
      input.blockers.length > 0 ? 'blocked' : 'recorded';
    const payload = {
      leanRunId: undefined,
      portfolioTargetSnapshotId: undefined,
      asOf: input.now,
      evidenceMode: 'current_live_shadow' as const,
      proposedTargets: input.decisions.map((decision) => ({
        symbol: decision.symbol,
        direction: decision.direction,
        forecastProbabilityUp: decision.forecastProbabilityUp,
        expectedReturnBps: decision.expectedReturnBps,
        confidence: decision.confidence,
        proposedAction: decision.proposedAction,
      })),
      riskAdjustedTargets: status === 'recorded' ? input.orders : [],
      wouldHaveTraded: input.orders.map((order) => ({
        symbol: order.symbol,
        side: order.side.toLowerCase(),
        orderType: order.orderType.toLowerCase(),
        estimatedNotionalUsd: order.notional,
        targetPositionPct: order.targetPositionPct,
        brokerWriteEnabled: false,
      })),
      reconciliation: {
        status,
        observedSource: 'active-llm-agent-shadow',
        brokerWriteEnabled: false,
        checkedAt: input.now,
        riskDecision: input.riskDecision?.decision ?? 'not_evaluated',
      },
      blockerReasons: input.blockers,
      evidenceRefs: [
        'evidence-mode:active-llm-agent-shadow',
        `mapper:${input.mapperVersion}`,
        ...(input.run ? [`agent-run:${input.run.runId}`] : []),
        ...input.decisions.map((decision) => `agent-decision:${decision.id}`),
      ],
    };
    const idSuffix = hashObject({
      runId: input.run?.runId ?? 'no-run',
      asOf: input.now,
    })
      .replace('sha256:', '')
      .slice(0, 12);
    const record = this.liveShadowRepository.create({
      id: `agent-shadow-${input.now.replace(/[-:TZ.]/g, '').slice(0, 14)}-${idSuffix}`,
      mode: 'live-shadow',
      status,
      recordHash: hashObject(payload),
      ...payload,
    });
    await this.liveShadowRepository.upsert(record, ['id']);
    return record;
  }
}

function latestTimestamp(values: string[]): string | undefined {
  return values
    .filter((value) => Number.isFinite(new Date(value).getTime()))
    .sort(
      (left, right) => new Date(right).getTime() - new Date(left).getTime(),
    )[0];
}
