import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  IsNull,
  LessThanOrEqual,
  Repository,
} from 'typeorm';
import { AutonomousRun } from '../../entities/autonomous-run.entity';
import { AutonomousRunSchedule } from '../../entities/autonomous-run-schedule.entity';
import {
  BrokerFill,
  BrokerFillReconciliation,
} from '../../entities/broker-fill.entity';
import {
  BrokerEmergencyAction,
  BrokerOrderCommand,
  BrokerOrderCommandType,
  BrokerOrderIntent,
} from '../../entities/broker-order-command.entity';
import {
  BrokerOrderExternalStatus,
  BrokerOrderStatusRecord,
  BrokerOrderStatusReconciliation,
} from '../../entities/broker-order-status.entity';
import {
  BrokerSnapshot,
  BrokerSnapshotReconciliation,
} from '../../entities/broker-snapshot.entity';
import { BudgetEnvelope } from '../../entities/budget-envelope.entity';
import {
  ExecutionControlState,
  ExecutionControlStateValue,
} from '../../entities/execution-control-state.entity';
import { FundingReadinessRecord } from '../../entities/funding-readiness-record.entity';
import { InvestmentProposal } from '../../entities/investment-proposal.entity';
import { LivePilotReadinessRecord } from '../../entities/live-pilot-readiness-record.entity';
import { MarketDataBar } from '../../entities/market-data-bar.entity';
import { MarketDataIngestionRun } from '../../entities/market-data-ingestion-run.entity';
import { OrderPlanApproval } from '../../entities/order-plan-approval.entity';
import { PaperAccountEvent } from '../../entities/paper-account-event.entity';
import type {
  PaperAccountEventSnapshot,
  PaperAccountEventType,
} from '../../entities/paper-account-event.entity';
import { PaperAccount } from '../../entities/paper-account.entity';
import { PaperOrderPlan } from '../../entities/paper-order-plan.entity';
import type {
  PaperCashLedgerEntry,
  PaperFill,
  PaperOrderSnapshot,
  PaperPositionLedgerEntry,
  PaperReadinessSnapshot,
  PaperReconciliation,
  PaperReservationHold,
} from '../../entities/paper-order-plan.entity';
import { PaperReservationHoldRecord } from '../../entities/paper-reservation-hold.entity';
import { ResearchRun } from '../../entities/research-run.entity';
import { RiskEvaluation } from '../../entities/risk-evaluation.entity';
import { RiskGateService } from '../risk-gate/risk-gate.service';
import type {
  PortfolioSnapshot,
  ProposedOrder,
  RiskGateRequest,
} from '../risk-gate/risk-gate.types';
import {
  BaselineMarketDataset,
  buildBaselineResearchRunRequest,
} from './baseline-research-runner';
import { buildControlPlaneActionTimeline } from './control-plane-action-timeline.presenter';
import { buildControlPlaneActionStatus } from './control-plane-status.presenter';
import {
  AdvanceAutonomousRunRequest,
  AssessFundingReadinessRequest,
  AssessLivePilotReadinessRequest,
  BrokerAdapterStatus,
  ControlPlaneAuditEvent,
  ControlPlaneStatus,
  CreateAutonomousRunScheduleRequest,
  CreateAutonomousRunRequest,
  CreateBudgetEnvelopeRequest,
  CreateInvestmentProposalRequest,
  CreateOrderPlanApprovalRequest,
  CreateResearchRunRequest,
  ImportBrokerFillRequest,
  ImportBrokerOrderStatusRequest,
  ImportBrokerSnapshotRequest,
  ImportMarketDataBarsRequest,
  KillSwitchStatus,
  MarketDataBarsImportResponse,
  PaperExecuteProposalRequest,
  PrepareBrokerOrderCommandRequest,
  PromotePaperAccountRequest,
  ReconcileBrokerFillRequest,
  ReconcileBrokerSnapshotRequest,
  ReconcilePaperOrderPlanRequest,
  RunBrokerEmergencyCommandRequest,
  RunBaselineResearchRequest,
  RunRecoveryProposalRequest,
  RunRecoveryProposalResponse,
  SeedPaperAccountRequest,
  TickAutonomousRunScheduleRequest,
  TripKillSwitchRequest,
  UpdateExecutionControlRequest,
} from './control-plane.types';

interface PaperPositionAccountingState {
  marketValue: number;
  quantity: number;
  averagePrice: number;
  costBasis: number;
  realizedPnl: number;
}

interface PaperReservationSnapshot {
  requiredCash: number;
  reservedCash: number;
  availableCash: number;
  requiredSellNotionalBySymbol: Record<string, number>;
  reservedSellNotionalBySymbol: Record<string, number>;
  availableSellNotionalBySymbol: Record<string, number>;
}

interface PaperOpenReservation {
  holdId?: string;
  cashAmount: number;
  sellNotionalBySymbol: Record<string, number>;
}

interface PaperApplyRepositories {
  paperAccountRepository: Repository<PaperAccount>;
  paperAccountEventRepository: Repository<PaperAccountEvent>;
  paperOrderPlanRepository: Repository<PaperOrderPlan>;
  paperReservationHoldRepository: Repository<PaperReservationHoldRecord>;
  orderPlanApprovalRepository: Repository<OrderPlanApproval>;
  proposalRepository: Repository<InvestmentProposal>;
}

@Injectable()
export class ControlPlaneService {
  private readonly disallowedModelCategories = new Set([
    'llm_direct_trade',
    'reinforcement_learning_allocator',
    'direct_order_model',
  ]);

  constructor(
    @InjectRepository(BudgetEnvelope)
    private readonly budgetRepository: Repository<BudgetEnvelope>,
    @InjectRepository(BrokerFill)
    private readonly brokerFillRepository: Repository<BrokerFill>,
    @InjectRepository(BrokerOrderCommand)
    private readonly brokerOrderCommandRepository: Repository<BrokerOrderCommand>,
    @InjectRepository(BrokerOrderStatusRecord)
    private readonly brokerOrderStatusRepository: Repository<BrokerOrderStatusRecord>,
    @InjectRepository(BrokerSnapshot)
    private readonly brokerSnapshotRepository: Repository<BrokerSnapshot>,
    @InjectRepository(FundingReadinessRecord)
    private readonly fundingReadinessRepository: Repository<FundingReadinessRecord>,
    @InjectRepository(LivePilotReadinessRecord)
    private readonly livePilotReadinessRepository: Repository<LivePilotReadinessRecord>,
    @InjectRepository(InvestmentProposal)
    private readonly proposalRepository: Repository<InvestmentProposal>,
    @InjectRepository(MarketDataBar)
    private readonly marketDataBarRepository: Repository<MarketDataBar>,
    @InjectRepository(OrderPlanApproval)
    private readonly orderPlanApprovalRepository: Repository<OrderPlanApproval>,
    @InjectRepository(ResearchRun)
    private readonly researchRunRepository: Repository<ResearchRun>,
    @InjectRepository(PaperAccount)
    private readonly paperAccountRepository: Repository<PaperAccount>,
    @InjectRepository(PaperAccountEvent)
    private readonly paperAccountEventRepository: Repository<PaperAccountEvent>,
    @InjectRepository(PaperOrderPlan)
    private readonly paperOrderPlanRepository: Repository<PaperOrderPlan>,
    @InjectRepository(PaperReservationHoldRecord)
    private readonly paperReservationHoldRepository: Repository<PaperReservationHoldRecord>,
    @InjectRepository(ExecutionControlState)
    private readonly executionControlRepository: Repository<ExecutionControlState>,
    @InjectRepository(RiskEvaluation)
    private readonly riskEvaluationRepository: Repository<RiskEvaluation>,
    @InjectRepository(AutonomousRun)
    private readonly runRepository: Repository<AutonomousRun>,
    @InjectRepository(AutonomousRunSchedule)
    private readonly runScheduleRepository: Repository<AutonomousRunSchedule>,
    private readonly riskGateService: RiskGateService,
    @Optional()
    @InjectDataSource()
    private readonly dataSource?: DataSource,
  ) {}

  async getStatus(): Promise<ControlPlaneStatus> {
    const activeBudget = await this.budgetRepository.findOne({
      where: { status: 'active' },
      order: { updatedAt: 'DESC' },
    });
    const researchRunCount = await this.researchRunRepository.count();
    const proposalCount = await this.proposalRepository.count();
    const orderPlanApprovalCount =
      await this.orderPlanApprovalRepository.count();
    const evaluationCount = await this.riskEvaluationRepository.count();
    const paperAccountCount = await this.paperAccountRepository.count();
    const paperAccountEventCount =
      await this.paperAccountEventRepository.count();
    const paperOrderPlanCount = await this.paperOrderPlanRepository.count();
    const paperReservationHoldCount =
      await this.paperReservationHoldRepository.count();
    const brokerFillCount = await this.brokerFillRepository.count();
    const brokerOrderCommandCount =
      await this.brokerOrderCommandRepository.count();
    const latestBrokerOrderCommand =
      await this.brokerOrderCommandRepository.findOne({
        where: {},
        order: { checkedAt: 'DESC', updatedAt: 'DESC' },
      });
    const brokerOrderStatusCount =
      await this.brokerOrderStatusRepository.count();
    const latestBrokerOrderStatus =
      await this.brokerOrderStatusRepository.findOne({
        where: {},
        order: { asOf: 'DESC', updatedAt: 'DESC' },
      });
    const brokerSnapshotCount = await this.brokerSnapshotRepository.count();
    const fundingReadinessCount = await this.fundingReadinessRepository.count();
    const latestFundingReadiness =
      await this.fundingReadinessRepository.findOne({
        where: {},
        order: { checkedAt: 'DESC', updatedAt: 'DESC' },
      });
    const livePilotReadinessCount =
      await this.livePilotReadinessRepository.count();
    const latestLivePilotReadiness =
      await this.livePilotReadinessRepository.findOne({
        where: {},
        order: { checkedAt: 'DESC', updatedAt: 'DESC' },
      });
    const executionControlState = await this.getExecutionControlState();
    const runCount = await this.runRepository.count();
    const schemaMigrationPolicy = await this.buildSchemaMigrationPolicyStatus();
    const [runs, paperPlans, brokerSnapshots, brokerFills] = await Promise.all([
      this.runRepository.find(),
      this.paperOrderPlanRepository.find(),
      this.brokerSnapshotRepository.find(),
      this.brokerFillRepository.find(),
    ]);
    const killSwitch = this.buildKillSwitchStatus(executionControlState);
    const liveTradingGate = this.buildLiveTradingGateStatus(killSwitch);
    const actionStatus = buildControlPlaneActionStatus({
      checkedAt: new Date().toISOString(),
      executionControlState,
      runs,
      paperPlans,
      brokerSnapshots,
      brokerFills,
    });

    return {
      brokerExecutionEnabled: false,
      liveTradingReady: false,
      liveTradingGate,
      killSwitch,
      actionStatus,
      fundingReadiness: latestFundingReadiness ?? undefined,
      livePilotReadiness: latestLivePilotReadiness ?? undefined,
      brokerOrderCommand: latestBrokerOrderCommand ?? undefined,
      brokerOrderStatus: latestBrokerOrderStatus ?? undefined,
      readiness: [
        {
          key: 'budgetEnvelopeActive',
          ready: Boolean(activeBudget),
          detail: activeBudget
            ? `Active budget: ${activeBudget.name}`
            : 'No active budget envelope',
        },
        {
          key: 'researchRunLedgerReady',
          ready: researchRunCount > 0,
          detail: `${researchRunCount} research run records`,
        },
        {
          key: 'proposalLedgerReady',
          ready: proposalCount > 0,
          detail: `${proposalCount} proposal records`,
        },
        {
          key: 'riskGateReady',
          ready: true,
          detail: 'Deterministic risk gate is registered',
        },
        {
          key: 'riskAuditReady',
          ready: evaluationCount > 0,
          detail: `${evaluationCount} risk evaluations`,
        },
        {
          key: 'signedOrderPlanApprovalReady',
          ready: orderPlanApprovalCount > 0,
          detail: `${orderPlanApprovalCount} signed order-plan approvals`,
        },
        {
          key: 'autonomousRunLedgerReady',
          ready: runCount > 0,
          detail: `${runCount} autonomous run records`,
        },
        {
          key: 'paperExecutionReady',
          ready: false,
          detail: `Paper simulator ledger registered with ${paperOrderPlanCount} paper order plans; broker-grade readiness is blocked by production signing custody and production-verified broker polling`,
        },
        {
          key: 'paperSimulationLedgerReady',
          ready: true,
          detail:
            'Deterministic paper order-plan, fill, and reconciliation ledger is registered',
        },
        {
          key: 'paperReservationHoldLedgerReady',
          ready: true,
          detail: `${paperReservationHoldCount} database paper reservation hold records`,
        },
        {
          key: 'paperAccountReservationLockReady',
          ready: Boolean(this.dataSource),
          detail: this.dataSource
            ? 'Paper account reservation readiness, hold creation, and final apply run inside a TypeORM transaction after an optimistic account lock-version claim'
            : 'Paper account reservation lock readiness requires a TypeORM DataSource transaction boundary',
        },
        {
          key: 'schemaMigrationPolicyReady',
          ready: schemaMigrationPolicy.ready,
          detail: schemaMigrationPolicy.detail,
        },
        {
          key: 'paperAccountReady',
          ready: paperAccountCount > 0,
          detail: `${paperAccountCount} durable paper account records`,
        },
        {
          key: 'paperAccountEventLedgerReady',
          ready: paperAccountEventCount > 0,
          detail: `${paperAccountEventCount} append-only paper account events`,
        },
        {
          key: 'executionControlReady',
          ready: true,
          detail: `Execution control state is ${executionControlState.state}`,
        },
        {
          key: 'killSwitchRuntimeReady',
          ready: true,
          detail: killSwitch.detail,
        },
        {
          key: 'brokerReadOnlyReady',
          ready: false,
          detail:
            'Live broker adapter is not implemented; read-only snapshot/fill ledgers and adapter readiness contract are available',
        },
        {
          key: 'brokerAdapterContractReady',
          ready: true,
          detail:
            'Provider-neutral Toss readiness contract reports credential, credential-custody, schema, sandbox, read-only, and order-placement gates',
        },
        {
          key: 'brokerSnapshotLedgerReady',
          ready: brokerSnapshotCount > 0,
          detail: `${brokerSnapshotCount} broker read-only snapshots imported`,
        },
        {
          key: 'fundingReadinessLedgerReady',
          ready: fundingReadinessCount > 0,
          detail: `${fundingReadinessCount} funding readiness records`,
        },
        {
          key: 'fundingCapitalUsable',
          ready: latestFundingReadiness?.status === 'ready',
          detail: latestFundingReadiness
            ? `Latest funding readiness is ${latestFundingReadiness.status}: ${latestFundingReadiness.blockers.join('; ') || 'expected deposit matches read-only broker cash and equity'}`
            : 'No funding readiness record has matched expected deposit to read-only broker truth',
        },
        {
          key: 'brokerFillLedgerReady',
          ready: true,
          detail: `${brokerFillCount} broker read-only fill records imported`,
        },
        {
          key: 'brokerOrderCommandLedgerReady',
          ready: brokerOrderCommandCount > 0,
          detail: `${brokerOrderCommandCount} dry-run broker order command records`,
        },
        {
          key: 'brokerOrderStatusLedgerReady',
          ready: brokerOrderStatusCount > 0,
          detail: `${brokerOrderStatusCount} read-only broker order status records imported`,
        },
        {
          key: 'livePilotReadinessLedgerReady',
          ready: livePilotReadinessCount > 0,
          detail: `${livePilotReadinessCount} broker-write pre-trade risk check records`,
        },
        {
          key: 'livePilotReady',
          ready: latestLivePilotReadiness?.status === 'ready',
          detail: latestLivePilotReadiness
            ? `Latest broker-write pre-trade risk check is ${latestLivePilotReadiness.status}: ${latestLivePilotReadiness.blockers.join('; ') || 'all broker-write pre-trade risk check gates are ready'}`
            : 'No broker-write pre-trade risk check record has verified broker write gates',
        },
        {
          key: 'liveTradingReady',
          ready: false,
          detail: liveTradingGate.detail,
        },
      ],
      blockers: [
        'No verified Toss read-only adapter schema or credentials',
        'No production signed order-plan workflow',
        ...(latestFundingReadiness?.status === 'ready'
          ? []
          : ['No usable funding readiness record tied to broker truth']),
        ...(latestLivePilotReadiness?.status === 'ready'
          ? []
          : ['No verified broker-write pre-trade risk check record']),
        ...(latestBrokerOrderCommand
          ? []
          : ['No broker order command dry-run ledger record']),
        ...(latestBrokerOrderStatus
          ? []
          : ['No broker order status lifecycle evidence']),
        'No production-verified broker polling loop',
        ...schemaMigrationPolicy.blockers,
        ...liveTradingGate.blockers,
      ],
    };
  }

  private async buildSchemaMigrationPolicyStatus(): Promise<{
    ready: boolean;
    detail: string;
    blockers: string[];
  }> {
    const synchronizeDisabled = process.env.TYPEORM_SYNCHRONIZE === 'false';
    const migrationsRunEnabled = process.env.TYPEORM_MIGRATIONS_RUN === 'true';
    let pendingMigrations = true;

    if (this.dataSource?.isInitialized) {
      pendingMigrations = await this.dataSource.showMigrations();
    }

    const blockers = [
      synchronizeDisabled
        ? undefined
        : 'TYPEORM_SYNCHRONIZE must be false in production',
      migrationsRunEnabled
        ? undefined
        : 'TYPEORM_MIGRATIONS_RUN must be true in production',
      pendingMigrations
        ? 'Pending schema migrations must be applied'
        : undefined,
    ].filter((blocker): blocker is string => Boolean(blocker));

    return {
      ready: blockers.length === 0,
      detail:
        blockers.length === 0
          ? 'Production schema policy uses explicit TypeORM migrations with synchronize disabled and no pending migrations'
          : `Production schema policy is blocked: ${blockers.join('; ')}`,
      blockers:
        blockers.length === 0
          ? []
          : ['Production schema migrations are not enforced'],
    };
  }

  async listActionTimeline(
    input: {
      limit?: number;
      marketDataIngestionRuns?: MarketDataIngestionRun[];
    } = {},
  ): Promise<ControlPlaneAuditEvent[]> {
    const [
      budgets,
      executionControlStates,
      runSchedules,
      runs,
      researchRuns,
      proposals,
      riskEvaluations,
      orderPlanApprovals,
      paperAccountEvents,
      paperOrderPlans,
      paperReservationHolds,
      brokerSnapshots,
      brokerFills,
    ] = await Promise.all([
      this.budgetRepository.find(),
      this.executionControlRepository.find(),
      this.runScheduleRepository.find(),
      this.runRepository.find(),
      this.researchRunRepository.find(),
      this.proposalRepository.find(),
      this.riskEvaluationRepository.find(),
      this.orderPlanApprovalRepository.find(),
      this.paperAccountEventRepository.find(),
      this.paperOrderPlanRepository.find(),
      this.paperReservationHoldRepository.find(),
      this.brokerSnapshotRepository.find(),
      this.brokerFillRepository.find(),
    ]);

    return buildControlPlaneActionTimeline({
      budgets,
      executionControlStates,
      runSchedules,
      runs,
      researchRuns,
      proposals,
      riskEvaluations,
      orderPlanApprovals,
      paperAccountEvents,
      paperOrderPlans,
      paperReservationHolds,
      brokerSnapshots,
      brokerFills,
      marketDataIngestionRuns: input.marketDataIngestionRuns,
      limit: input.limit,
    });
  }

  private buildKillSwitchStatus(
    executionControlState: ExecutionControlState,
  ): KillSwitchStatus {
    const tripped = executionControlState.state === 'halted';

    return {
      armed: true,
      tripped,
      runtimeReady: true,
      executionControlState: executionControlState.state,
      lastEventId: executionControlState.id,
      lastActor: executionControlState.actor,
      lastReason: executionControlState.reason,
      lastChangedAt:
        executionControlState.createdAt?.toISOString?.() ??
        new Date().toISOString(),
      brokerExecutionEnabled: false,
      liveTradingEnabled: false,
      detail: tripped
        ? `Kill switch is tripped by ${executionControlState.actor}: ${executionControlState.reason}`
        : `Kill switch is armed; execution control is ${executionControlState.state}.`,
    };
  }

  private buildLiveTradingGateStatus(
    killSwitch: KillSwitchStatus,
  ): ControlPlaneStatus['liveTradingGate'] {
    const blockers = [
      'Live order endpoint is not implemented',
      'Broker write access is disabled',
      'Production credential custody is not wired',
      'Broker fill polling is not automated or verified with a live provider',
      'Broker-order emergency cancel/flatten controls are not implemented',
    ];

    return {
      enabled: false,
      mode: 'disabled',
      checkedAt: new Date().toISOString(),
      orderEndpointImplemented: false,
      brokerWriteEnabled: false,
      killSwitchReady: killSwitch.runtimeReady,
      credentialCustodyRequired: true,
      blockers,
      detail: `Live trading gate is disabled: ${blockers.join('; ')}.`,
    };
  }

  async createBudgetEnvelope(
    request: CreateBudgetEnvelopeRequest,
  ): Promise<BudgetEnvelope> {
    const defaultPolicy = this.riskGateService.getPolicy();
    const policy = {
      ...defaultPolicy,
      ...request.policy,
      allowedAssetClasses:
        request.allowedAssetClasses ??
        request.policy?.allowedAssetClasses ??
        defaultPolicy.allowedAssetClasses,
      allowLiveTrading: false,
      allowPaperAutoApproval: request.policy?.allowPaperAutoApproval === true,
      requireHumanApproval: true,
    };

    const budget = this.budgetRepository.create({
      name: request.name,
      status: 'active',
      mode: request.mode ?? 'dry_run',
      currency: request.currency ?? 'KRW',
      totalBudget: request.totalBudget,
      cashReservePct: request.cashReservePct ?? 20,
      allowedAssetClasses: policy.allowedAssetClasses,
      policy,
      brokerExecutionEnabled: false,
      liveTradingEnabled: false,
      notes: request.notes,
    });

    return this.budgetRepository.save(budget);
  }

  async listBudgetEnvelopes(): Promise<BudgetEnvelope[]> {
    return this.budgetRepository.find({ order: { updatedAt: 'DESC' } });
  }

  async createProposal(
    request: CreateInvestmentProposalRequest,
  ): Promise<InvestmentProposal> {
    if (!request.researchRunId) {
      throw new BadRequestException('Proposal requires a researchRunId');
    }

    const researchRun = await this.researchRunRepository.findOne({
      where: { id: request.researchRunId },
    });

    if (!researchRun) {
      throw new NotFoundException(
        `Research run ${request.researchRunId} not found`,
      );
    }

    if (
      !researchRun.advanceEligible ||
      researchRun.status !== 'proposal_ready'
    ) {
      throw new BadRequestException(
        `Research run ${request.researchRunId} is not proposal-ready`,
      );
    }

    const generatedAt = new Date(request.generatedAt);
    const marketDataTimestamp = new Date(request.marketDataTimestamp);

    const proposal = this.proposalRepository.create({
      budgetEnvelopeId: request.budgetEnvelopeId,
      researchRunId: request.researchRunId,
      strategyId: request.strategyId,
      ruleId: request.ruleId,
      actor: request.actor ?? 'strategy',
      status: 'generated',
      generatedAt,
      marketDataTimestamp,
      portfolioSnapshot: request.portfolioSnapshot,
      orders: request.orders,
      thesis: request.thesis,
      evidenceRefs: request.evidenceRefs ?? researchRun.artifactRefs,
      brokerExecutionEnabled: false,
      requiresHumanApproval: true,
    });

    const savedProposal = await this.proposalRepository.save(proposal);
    researchRun.phase = 'proposal_linked';
    await this.researchRunRepository.save(researchRun);

    return savedProposal;
  }

  async listProposals(): Promise<InvestmentProposal[]> {
    return this.proposalRepository.find({ order: { updatedAt: 'DESC' } });
  }

  async evaluateProposal(proposalId: number): Promise<RiskEvaluation> {
    const proposal = await this.proposalRepository.findOne({
      where: { id: proposalId },
    });

    if (!proposal) {
      throw new NotFoundException(`Proposal ${proposalId} not found`);
    }

    if (!proposal.researchRunId) {
      throw new BadRequestException(
        `Proposal ${proposalId} requires research run provenance`,
      );
    }

    const budget = proposal.budgetEnvelopeId
      ? await this.budgetRepository.findOne({
          where: { id: proposal.budgetEnvelopeId },
        })
      : await this.budgetRepository.findOne({
          where: { status: 'active' },
          order: { updatedAt: 'DESC' },
        });

    const request: RiskGateRequest = {
      mode: budget?.mode ?? 'dry_run',
      actor: proposal.actor,
      researchRunId: proposal.researchRunId,
      strategyId: proposal.strategyId,
      ruleId: proposal.ruleId,
      generatedAt: proposal.generatedAt.toISOString(),
      marketDataTimestamp: proposal.marketDataTimestamp.toISOString(),
      portfolio: proposal.portfolioSnapshot,
      orders: proposal.orders,
      policy: budget?.policy,
      evidenceRefs: proposal.evidenceRefs,
      executionIntent: 'evaluate_only',
    };

    const response = this.riskGateService.evaluate(request);
    const evaluation = this.riskEvaluationRepository.create({
      proposalId: proposal.id,
      decision: response.decision,
      reasons: response.reasons,
      requestSnapshot: request,
      responseSnapshot: response,
      brokerExecutionEnabled: false,
      requiresHumanApproval: response.requiresHumanApproval,
      evaluatedAt: new Date(response.evaluatedAt),
    });

    const saved = await this.riskEvaluationRepository.save(evaluation);
    proposal.status =
      response.decision === 'DENY'
        ? 'rejected'
        : response.decision === 'REVIEW'
          ? 'needs_review'
          : request.mode === 'paper'
            ? 'paper_ready'
            : 'evaluated';
    proposal.requiresHumanApproval = response.requiresHumanApproval;
    await this.proposalRepository.save(proposal);

    return saved;
  }

  async listRiskEvaluations(): Promise<RiskEvaluation[]> {
    return this.riskEvaluationRepository.find({
      order: { evaluatedAt: 'DESC' },
    });
  }

  async createOrderPlanApproval(
    proposalId: number,
    request: CreateOrderPlanApprovalRequest,
  ): Promise<OrderPlanApproval> {
    const proposal = await this.proposalRepository.findOne({
      where: { id: proposalId },
    });

    if (!proposal) {
      throw new NotFoundException(`Proposal ${proposalId} not found`);
    }

    if (!request.approver?.trim()) {
      throw new BadRequestException('Order-plan approval requires approver');
    }

    if (!request.reason?.trim()) {
      throw new BadRequestException('Order-plan approval requires reason');
    }

    const budget = proposal.budgetEnvelopeId
      ? await this.budgetRepository.findOne({
          where: { id: proposal.budgetEnvelopeId },
        })
      : await this.budgetRepository.findOne({
          where: { status: 'active' },
          order: { updatedAt: 'DESC' },
        });
    const paperAccount = await this.findPaperAccountForProposal(proposal);
    if (!paperAccount) {
      throw new BadRequestException(
        'Order-plan approval requires an explicitly promoted paper account',
      );
    }
    const latestPaperAccountEvent = await this.getLatestPaperAccountEvent(
      paperAccount.id,
    );

    if (!latestPaperAccountEvent) {
      throw new BadRequestException(
        'Order-plan approval requires paper account event custody evidence',
      );
    }

    if (!request.expectedPaperAccountEventHash) {
      throw new BadRequestException(
        'Order-plan approval requires expectedPaperAccountEventHash',
      );
    }

    const idempotencyKey =
      request.idempotencyKey ?? `paper:proposal:${proposal.id}:approved`;
    const expiresAt = request.expiresAt ? new Date(request.expiresAt) : null;
    const signerKeyRef = request.signerKeyRef ?? 'local-paper-approval-key-v1';
    const approvalSource = request.approvalSource ?? 'human';

    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException('Order-plan approval expiresAt is invalid');
    }

    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Order-plan approval cannot be expired');
    }

    const existingApproval = await this.findOrderPlanApprovalByIdempotencyKey(
      proposal.id,
      idempotencyKey,
    );

    if (existingApproval) {
      this.assertOrderPlanApprovalReplay(existingApproval, {
        approver: request.approver,
        reason: request.reason,
        expiresAt: expiresAt?.toISOString(),
        expectedRiskEvaluationId: request.expectedRiskEvaluationId,
        paperAccountId: paperAccount.id,
        paperAccountEventHash: request.expectedPaperAccountEventHash,
        signerKeyRef,
        approvalSource,
        approvedByRunId: request.approvedByRunId,
        approvedByScheduleId: request.approvedByScheduleId,
        autoApprovalPolicyRef: request.autoApprovalPolicyRef,
      });

      return existingApproval;
    }

    if (
      request.expectedPaperAccountEventHash !==
      latestPaperAccountEvent.eventHash
    ) {
      throw new BadRequestException(
        'Expected paper account event hash does not match current account event',
      );
    }

    const paperPortfolio = this.buildPaperAccountPortfolio(paperAccount);
    const approvalRef = `approval:${proposal.id}:${idempotencyKey}:${request.approver}`;
    const latestEvaluation = await this.evaluateProposalForPaperExecution(
      proposal,
      budget,
      approvalRef,
      paperPortfolio,
    );

    if (
      request.expectedRiskEvaluationId !== undefined &&
      latestEvaluation.id !== request.expectedRiskEvaluationId
    ) {
      throw new BadRequestException(
        `Expected risk evaluation ${request.expectedRiskEvaluationId} does not match approval evaluation ${latestEvaluation.id}`,
      );
    }

    if (latestEvaluation.decision !== 'ALLOW') {
      throw new BadRequestException(
        `Order-plan approval requires paper-mode ALLOW risk evaluation, got ${latestEvaluation.decision}`,
      );
    }

    const proposalHash = this.hashProposal(proposal);
    const riskRequestHash = this.hashObject(latestEvaluation.requestSnapshot);
    const approvedAt = new Date();
    const canonicalPayload = {
      proposalId: proposal.id,
      riskEvaluationId: latestEvaluation.id,
      mode: 'paper' as const,
      approvalSource,
      approvedByRunId: request.approvedByRunId,
      approvedByScheduleId: request.approvedByScheduleId,
      autoApprovalPolicyRef: request.autoApprovalPolicyRef,
      approver: request.approver,
      reason: request.reason,
      idempotencyKey,
      approvedOrderCount: latestEvaluation.responseSnapshot.approvedOrderCount,
      expiresAt: expiresAt?.toISOString(),
      proposalHash,
      riskRequestHash,
      paperAccountId: paperAccount.id,
      paperAccountEventHash: latestPaperAccountEvent.eventHash,
      paperAccountEventSequence: latestPaperAccountEvent.sequence,
      custodyMode: 'local_hash_signature' as const,
      signerKeyRef,
    };
    const canonicalPayloadHash = this.hashObject(canonicalPayload);
    const signature = this.hashObject({
      signerKeyRef,
      canonicalPayloadHash,
    });
    const approvalSnapshot = {
      ...canonicalPayload,
      approvedAt: approvedAt.toISOString(),
      canonicalPayloadHash,
      signature,
    };
    const approvalHash = this.hashObject(approvalSnapshot);

    const approval = await this.orderPlanApprovalRepository.save(
      this.orderPlanApprovalRepository.create({
        proposalId: proposal.id,
        budgetEnvelopeId: proposal.budgetEnvelopeId,
        riskEvaluationId: latestEvaluation.id,
        idempotencyKey,
        mode: 'paper',
        approvalSource,
        approvedByRunId: request.approvedByRunId,
        approvedByScheduleId: request.approvedByScheduleId,
        autoApprovalPolicyRef: request.autoApprovalPolicyRef,
        approver: request.approver,
        reason: request.reason,
        status: 'active',
        proposalHash,
        riskRequestHash,
        paperAccountId: paperAccount.id,
        paperAccountEventHash: latestPaperAccountEvent.eventHash,
        paperAccountEventSequence: latestPaperAccountEvent.sequence,
        custodyMode: 'local_hash_signature',
        signerKeyRef,
        canonicalPayloadHash,
        signature,
        approvalHash,
        approvalSnapshot,
        approvedAt,
        expiresAt: expiresAt ?? undefined,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );

    proposal.status = 'paper_ready';
    proposal.requiresHumanApproval = false;
    await this.proposalRepository.save(proposal);

    return approval;
  }

  async listOrderPlanApprovals(): Promise<OrderPlanApproval[]> {
    return this.orderPlanApprovalRepository.find({
      order: { updatedAt: 'DESC' },
    });
  }

  async getPaperAccountState(): Promise<PaperAccount> {
    const latest = await this.paperAccountRepository.findOne({
      where: { status: 'active' },
      order: { updatedAt: 'DESC' },
    });

    if (latest) {
      return latest;
    }

    throw new NotFoundException(
      'No active paper account exists. A paper execution or explicit seed step must create it first.',
    );
  }

  async seedPaperAccount(
    request: SeedPaperAccountRequest,
  ): Promise<PaperAccount> {
    if (!request.actor?.trim()) {
      throw new BadRequestException('Paper account seed requires actor');
    }

    if (!request.reason?.trim()) {
      throw new BadRequestException('Paper account seed requires reason');
    }

    if (
      request.cash < 0 ||
      (request.equity !== undefined && request.equity < 0)
    ) {
      throw new BadRequestException(
        'Paper account seed cash/equity cannot be negative',
      );
    }

    const positions = request.positions ?? [];
    const positionsValue = positions.reduce(
      (total, position) => total + (position.marketValue ?? 0),
      0,
    );
    const equity =
      request.equity ?? this.roundMoney(request.cash + positionsValue);

    if (equity < request.cash) {
      throw new BadRequestException(
        'Paper account seed equity cannot be below cash',
      );
    }

    const budget = request.budgetEnvelopeId
      ? await this.budgetRepository.findOne({
          where: { id: request.budgetEnvelopeId },
        })
      : null;

    if (request.budgetEnvelopeId && !budget) {
      throw new NotFoundException(
        `Budget envelope ${request.budgetEnvelopeId} not found`,
      );
    }

    const idempotencyKey =
      request.idempotencyKey ??
      `paper-account-seed:${request.budgetEnvelopeId ?? 'default'}:${request.actor}`;
    const requestHash = this.hashObject({
      budgetEnvelopeId: request.budgetEnvelopeId,
      name: request.name,
      currency: request.currency ?? budget?.currency ?? 'KRW',
      cash: this.roundMoney(request.cash),
      equity: this.roundMoney(equity),
      positions,
      actor: request.actor,
      reason: request.reason,
      idempotencyKey,
    });
    const existingSeed =
      await this.findPaperAccountEventByIdempotencyKey(idempotencyKey);

    if (existingSeed) {
      this.assertIdempotentEventReplay(existingSeed, requestHash);
      const existingAccount = await this.paperAccountRepository.findOne({
        where: { id: existingSeed.paperAccountId },
      });

      if (existingAccount) {
        return existingAccount;
      }
    }

    const existingAccounts = await this.paperAccountRepository.find({
      order: { updatedAt: 'DESC' },
    });
    const existingAccount = existingAccounts.find(
      (account) =>
        ['seeded', 'active'].includes(account.status) &&
        (request.budgetEnvelopeId
          ? account.budgetEnvelopeId === request.budgetEnvelopeId
          : !account.budgetEnvelopeId),
    );

    if (existingAccount) {
      throw new BadRequestException(
        `Paper account ${existingAccount.id} already exists for this scope; seed is intentionally one-time and idempotent`,
      );
    }

    const currency = request.currency ?? budget?.currency ?? 'KRW';
    const grossExposurePct =
      request.grossExposurePct ??
      this.calculateGrossExposurePct(positions, equity);
    const paperAccount = await this.paperAccountRepository.save(
      this.paperAccountRepository.create({
        name:
          request.name ??
          (budget
            ? `${budget.name} seeded paper account`
            : 'Seeded paper account'),
        budgetEnvelopeId: request.budgetEnvelopeId,
        status: 'seeded',
        currency,
        cash: this.roundMoney(request.cash),
        equity: this.roundMoney(equity),
        grossExposurePct,
        positions,
        cashLedger: [],
        positionLedger: [],
        appliedPlanIds: [],
        lockVersion: 0,
        latestEventSequence: 0,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );

    await this.appendPaperAccountEventAndUpdateAccount({
      input: {
        paperAccount,
        eventType: 'explicit_seed',
        idempotencyKey,
        actor: request.actor,
        reason: request.reason,
        requestHash,
        cashBefore: 0,
        cashAfter: paperAccount.cash,
        equityBefore: 0,
        equityAfter: paperAccount.equity,
        positionsBefore: [],
        positionsAfter: paperAccount.positions,
      },
    });

    return paperAccount;
  }

  async promotePaperAccount(
    paperAccountId: number,
    request: PromotePaperAccountRequest,
  ): Promise<PaperAccount> {
    if (!request.actor?.trim()) {
      throw new BadRequestException('Paper account promotion requires actor');
    }

    if (!request.reason?.trim()) {
      throw new BadRequestException('Paper account promotion requires reason');
    }

    const paperAccount = await this.paperAccountRepository.findOne({
      where: { id: paperAccountId },
    });

    if (!paperAccount) {
      throw new NotFoundException(`Paper account ${paperAccountId} not found`);
    }

    const idempotencyKey =
      request.idempotencyKey ?? `paper-account-promote:${paperAccount.id}`;
    const requestHash = this.hashObject({
      paperAccountId,
      actor: request.actor,
      reason: request.reason,
      expectedEventHash: request.expectedEventHash,
      expectedCurrentActiveAccountId: request.expectedCurrentActiveAccountId,
      idempotencyKey,
    });
    const existingPromotion =
      await this.findPaperAccountEventByIdempotencyKey(idempotencyKey);

    if (existingPromotion) {
      this.assertIdempotentEventReplay(existingPromotion, requestHash);
      return paperAccount;
    }

    if (paperAccount.status !== 'seeded') {
      throw new BadRequestException(
        `Paper account ${paperAccount.id} must be seeded before promotion`,
      );
    }

    const latestEvent = await this.getLatestPaperAccountEvent(paperAccount.id);

    if (!latestEvent || latestEvent.eventType !== 'explicit_seed') {
      throw new BadRequestException(
        'Paper account promotion requires an explicit seed event',
      );
    }

    if (
      request.expectedEventHash &&
      latestEvent.eventHash !== request.expectedEventHash
    ) {
      throw new BadRequestException(
        'Paper account promotion expectedEventHash mismatch',
      );
    }

    const activeAccount = await this.findActivePaperAccountForScope(
      paperAccount.budgetEnvelopeId,
    );

    if (
      activeAccount &&
      activeAccount.id !== request.expectedCurrentActiveAccountId
    ) {
      throw new BadRequestException(
        `Active paper account ${activeAccount.id} already exists for this scope`,
      );
    }

    paperAccount.status = 'active';
    const saved = await this.paperAccountRepository.save(paperAccount);
    await this.appendPaperAccountEventAndUpdateAccount({
      input: {
        paperAccount: saved,
        eventType: 'account_promoted',
        idempotencyKey,
        actor: request.actor,
        reason: request.reason,
        requestHash,
        cashBefore: saved.cash,
        cashAfter: saved.cash,
        equityBefore: saved.equity,
        equityAfter: saved.equity,
        positionsBefore: saved.positions,
        positionsAfter: saved.positions,
      },
    });

    return saved;
  }

  async listPaperAccountEvents(): Promise<PaperAccountEvent[]> {
    const events = await this.paperAccountEventRepository.find({
      order: { createdAt: 'DESC' },
    });

    return events.sort(
      (left, right) =>
        right.createdAt.getTime() - left.createdAt.getTime() ||
        right.sequence - left.sequence,
    );
  }

  async importBrokerSnapshot(
    request: ImportBrokerSnapshotRequest,
  ): Promise<BrokerSnapshot> {
    this.assertReadOnlyBrokerSnapshotRequest(request);
    if (request.provider === 'toss') {
      throw new BadRequestException(
        'Manual broker snapshot import cannot claim Toss provider; use Toss read-only polling.',
      );
    }

    return this.saveBrokerSnapshot(request);
  }

  async importTossReadOnlyBrokerSnapshot(
    request: ImportBrokerSnapshotRequest,
  ): Promise<BrokerSnapshot> {
    this.assertReadOnlyBrokerSnapshotRequest(request);
    if (request.provider && request.provider !== 'toss') {
      throw new BadRequestException(
        'Toss read-only broker snapshot import requires provider=toss.',
      );
    }
    const sourceRef = request.sourceRef?.startsWith('toss-read-only-poll:')
      ? request.sourceRef
      : `toss-read-only-poll:${request.sourceRef ?? 'manual'}`;
    return this.saveBrokerSnapshot({
      ...request,
      provider: 'toss',
      sourceRef,
    });
  }

  private async saveBrokerSnapshot(
    request: ImportBrokerSnapshotRequest,
  ): Promise<BrokerSnapshot> {
    const asOf = new Date(request.asOf);

    if (Number.isNaN(asOf.getTime())) {
      throw new BadRequestException(
        'Broker snapshot asOf must be a valid date',
      );
    }

    if (asOf.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('Broker snapshot asOf cannot be future');
    }

    if (request.cash < 0 || request.equity < 0) {
      throw new BadRequestException(
        'Broker snapshot cash and equity cannot be negative',
      );
    }

    const positions = request.positions ?? [];
    const grossExposurePct =
      request.grossExposurePct ??
      this.calculateGrossExposurePct(positions, request.equity);
    const actualBrokerPositions = this.positionsToMarketValueMap(positions);
    const reconciliation: BrokerSnapshotReconciliation = {
      status: 'not_checked',
      cashMatched: false,
      equityMatched: false,
      positionsMatched: false,
      actualBrokerCash: this.roundMoney(request.cash),
      actualBrokerEquity: this.roundMoney(request.equity),
      actualBrokerPositions,
      tolerance: 0.01,
      maxAgeMinutes: 60,
      notes: [
        'Imported as read-only broker evidence. No order endpoint was called.',
      ],
    };

    return this.brokerSnapshotRepository.save(
      this.brokerSnapshotRepository.create({
        provider: request.provider ?? 'manual',
        sourceRef: request.sourceRef,
        accountRefHash: request.accountRef
          ? this.hashObject({ accountRef: request.accountRef })
          : undefined,
        status: 'imported',
        currency: request.currency ?? 'KRW',
        cash: this.roundMoney(request.cash),
        equity: this.roundMoney(request.equity),
        grossExposurePct,
        positions,
        asOf,
        reconciliation,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
  }

  async listBrokerSnapshots(): Promise<BrokerSnapshot[]> {
    return this.brokerSnapshotRepository.find({
      order: { asOf: 'DESC', updatedAt: 'DESC' },
    });
  }

  async assessFundingReadiness(
    brokerSnapshotId: number,
    request: AssessFundingReadinessRequest,
  ): Promise<FundingReadinessRecord> {
    this.assertFundingReadinessRequest(request);

    const brokerSnapshot = await this.brokerSnapshotRepository.findOne({
      where: { id: brokerSnapshotId },
    });

    if (!brokerSnapshot) {
      throw new NotFoundException(
        `Broker snapshot ${brokerSnapshotId} not found`,
      );
    }

    const expectedDepositAmount = this.roundMoney(
      request.expectedDepositAmount,
    );
    const checkedAt = new Date();
    const tolerance = request.tolerance ?? 0.01;
    const maxAgeMinutes = request.maxAgeMinutes ?? 60;
    const idempotencyKey = request.idempotencyKey;

    if (idempotencyKey) {
      const existing = await this.fundingReadinessRepository.findOne({
        where: { idempotencyKey },
      });

      if (existing) {
        return existing;
      }
    }

    const currency = request.currency ?? brokerSnapshot.currency;
    const ageMinutes =
      (checkedAt.getTime() - brokerSnapshot.asOf.getTime()) / 60_000;
    const cashDiff = this.roundMoney(
      brokerSnapshot.cash - expectedDepositAmount,
    );
    const equityDiff = this.roundMoney(
      brokerSnapshot.equity - expectedDepositAmount,
    );
    const cashSufficient = cashDiff + tolerance >= 0;
    const equitySufficient = equityDiff + tolerance >= 0;
    const currencyMatched = brokerSnapshot.currency === currency;
    const accountMatched = Boolean(brokerSnapshot.accountRefHash);
    const snapshotFresh = ageMinutes <= maxAgeMinutes;
    const reconciliationMatched =
      brokerSnapshot.reconciliation.status === 'matched';
    const blockers = [
      brokerSnapshot?.accountRefHash
        ? undefined
        : 'Broker snapshot is missing account ref hash',
      reconciliationMatched
        ? undefined
        : 'Broker snapshot reconciliation is not matched',
      currencyMatched ? undefined : 'Broker snapshot currency does not match',
      cashSufficient ? undefined : 'Broker cash is below expected deposit',
      equitySufficient ? undefined : 'Broker equity is below expected deposit',
      snapshotFresh ? undefined : 'Broker snapshot is stale',
    ].filter((blocker): blocker is string => Boolean(blocker));
    const status = blockers.length === 0 ? 'ready' : 'blocked';
    const notes = [
      'Funding readiness is read-only broker evidence. No order endpoint was called.',
      ...(request.notes ?? []),
    ];
    const readinessSnapshot = {
      expectedDepositAmount,
      actualBrokerCash: brokerSnapshot?.cash,
      actualBrokerEquity: brokerSnapshot?.equity,
      cashDiff,
      equityDiff,
      tolerance,
      maxAgeMinutes,
      ageMinutes: this.roundMoney(ageMinutes),
      brokerSnapshotAsOf: brokerSnapshot.asOf.toISOString(),
      brokerSnapshotReconciliationStatus: brokerSnapshot.reconciliation.status,
      cashSufficient,
      equitySufficient,
      currencyMatched,
      accountMatched,
      snapshotFresh,
      brokerExecutionEnabled: false as const,
      liveTradingEnabled: false as const,
      blockers,
      notes,
    };

    return this.fundingReadinessRepository.save(
      this.fundingReadinessRepository.create({
        provider: brokerSnapshot.provider,
        idempotencyKey,
        brokerSnapshotId: brokerSnapshot.id,
        accountRefHash: brokerSnapshot.accountRefHash,
        currency,
        expectedDepositAmount,
        actualBrokerCash: brokerSnapshot.cash,
        actualBrokerEquity: brokerSnapshot.equity,
        brokerSnapshotAsOf: brokerSnapshot.asOf,
        brokerSnapshotReconciliationStatus:
          brokerSnapshot.reconciliation.status,
        cashDiff,
        equityDiff,
        snapshotAgeMinutes: this.roundMoney(ageMinutes),
        status,
        checkedAt,
        tolerance,
        maxAgeMinutes,
        readinessSnapshot,
        blockers,
        notes,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
  }

  async listFundingReadinessRecords(): Promise<FundingReadinessRecord[]> {
    return this.fundingReadinessRepository.find({
      order: { checkedAt: 'DESC', updatedAt: 'DESC' },
    });
  }

  async assessLivePilotReadiness(
    request: AssessLivePilotReadinessRequest,
    brokerAdapterStatus: BrokerAdapterStatus,
  ): Promise<LivePilotReadinessRecord> {
    this.assertLivePilotReadinessRequest(request);

    const idempotencyKey = request.idempotencyKey;
    if (idempotencyKey) {
      const existing = await this.livePilotReadinessRepository.findOne({
        where: { idempotencyKey },
      });

      if (existing) {
        return existing;
      }
    }

    const checkedAt = new Date();
    const hardMaxPilotBudgetAmount = Number(
      process.env.LIVE_PILOT_HARD_MAX_BUDGET_KRW ?? 1_000_000,
    );
    const pilotBudgetAmount = this.roundMoney(request.pilotBudgetAmount);
    const maxPilotBudgetAmount = this.roundMoney(
      request.maxPilotBudgetAmount ?? hardMaxPilotBudgetAmount,
    );
    const maxSingleOrderNotional = this.roundMoney(
      request.maxSingleOrderNotional ?? Math.min(100_000, pilotBudgetAmount),
    );
    const fundingReadiness = request.fundingReadinessId
      ? await this.fundingReadinessRepository.findOne({
          where: { id: request.fundingReadinessId },
        })
      : await this.fundingReadinessRepository.findOne({
          where: {},
          order: { checkedAt: 'DESC', updatedAt: 'DESC' },
        });

    if (request.fundingReadinessId && !fundingReadiness) {
      throw new NotFoundException(
        `Funding readiness ${request.fundingReadinessId} not found`,
      );
    }

    const budget = request.budgetEnvelopeId
      ? await this.budgetRepository.findOne({
          where: { id: request.budgetEnvelopeId },
        })
      : await this.budgetRepository.findOne({
          where: { status: 'active' },
          order: { updatedAt: 'DESC' },
        });

    if (request.budgetEnvelopeId && !budget) {
      throw new NotFoundException(
        `Budget ${request.budgetEnvelopeId} not found`,
      );
    }

    const schemaMigrationPolicy = await this.buildSchemaMigrationPolicyStatus();
    const credentialCustodyReady =
      brokerAdapterStatus.credentialCustody.productionReady;
    const brokerReadOnlyReady =
      brokerAdapterStatus.readOnlyEnabled &&
      brokerAdapterStatus.readOnlyPoll.canPoll;
    const brokerFillPollingReady =
      brokerAdapterStatus.readOnlyPoll.canPollFills === true;
    const fundingReady = fundingReadiness?.status === 'ready';
    const brokerEmergencyControlsReady =
      brokerAdapterStatus.emergencyControls.brokerCancelReady &&
      brokerAdapterStatus.emergencyControls.brokerFlattenReady &&
      brokerAdapterStatus.emergencyControls.openOrderPollingReady;

    const blockers = [
      budget
        ? undefined
        : 'No budget envelope selected for broker-write pre-trade risk check',
      budget?.mode === 'live'
        ? undefined
        : 'Broker-write pre-trade risk check requires a budget envelope in live mode',
      budget?.policy.allowLiveTrading === true
        ? undefined
        : 'Budget policy does not allow live trading',
      fundingReady
        ? undefined
        : 'No ready funding readiness record is tied to broker truth',
      fundingReadiness && request.currency
        ? fundingReadiness.currency === request.currency
          ? undefined
          : 'Funding readiness currency does not match broker-write pre-trade risk check request'
        : undefined,
      fundingReadiness &&
      pilotBudgetAmount <= fundingReadiness.expectedDepositAmount
        ? undefined
        : 'Broker-write pre-trade risk check budget exceeds verified funding readiness amount',
      pilotBudgetAmount <= maxPilotBudgetAmount
        ? undefined
        : 'Broker-write pre-trade risk check budget exceeds requested pilot cap',
      maxPilotBudgetAmount <= hardMaxPilotBudgetAmount
        ? undefined
        : 'Broker-write pre-trade risk check cap exceeds hard environment pilot cap',
      maxSingleOrderNotional <= pilotBudgetAmount
        ? undefined
        : 'Single order cap exceeds broker-write pre-trade risk check budget',
      schemaMigrationPolicy.ready
        ? undefined
        : 'Schema migration policy is not ready',
      credentialCustodyReady
        ? undefined
        : 'Production broker credential custody is not ready',
      brokerAdapterStatus.schemaVerified
        ? undefined
        : 'Broker OpenAPI schema is not verified',
      brokerAdapterStatus.sandboxVerified
        ? undefined
        : 'Broker sandbox or paper environment is not verified',
      brokerReadOnlyReady ? undefined : 'Broker read-only polling is not ready',
      brokerFillPollingReady ? undefined : 'Broker fill polling is not ready',
      brokerEmergencyControlsReady
        ? undefined
        : 'Broker cancel/flatten/open-order emergency controls are not ready',
      'Live order endpoint is not implemented',
      'Broker write access is disabled',
      'Production signed order-plan custody is not implemented',
    ].filter((blocker): blocker is string => Boolean(blocker));
    const notes = [
      'Broker-write pre-trade risk check is a validation artifact only. No broker order endpoint was called.',
      ...(request.notes ?? []),
    ];
    const readinessSnapshot = {
      pilotBudgetAmount,
      maxPilotBudgetAmount,
      maxSingleOrderNotional,
      budgetEnvelopeId: budget?.id,
      fundingReadinessId: fundingReadiness?.id,
      fundingReady,
      schemaMigrationReady: schemaMigrationPolicy.ready,
      credentialCustodyReady,
      brokerSchemaVerified: brokerAdapterStatus.schemaVerified,
      brokerSandboxVerified: brokerAdapterStatus.sandboxVerified,
      brokerReadOnlyReady,
      brokerFillPollingReady,
      brokerCancelReady:
        brokerAdapterStatus.emergencyControls.brokerCancelReady,
      brokerFlattenReady:
        brokerAdapterStatus.emergencyControls.brokerFlattenReady,
      openOrderPollingReady:
        brokerAdapterStatus.emergencyControls.openOrderPollingReady,
      orderEndpointImplemented: false as const,
      brokerWriteEnabled: false as const,
      productionApprovalCustodyReady: false as const,
      brokerExecutionEnabled: false as const,
      liveTradingEnabled: false as const,
      blockers,
      notes,
    };

    return this.livePilotReadinessRepository.save(
      this.livePilotReadinessRepository.create({
        idempotencyKey,
        budgetEnvelopeId: budget?.id,
        fundingReadinessId: fundingReadiness?.id,
        currency: request.currency ?? fundingReadiness?.currency ?? 'KRW',
        pilotBudgetAmount,
        maxPilotBudgetAmount,
        maxSingleOrderNotional,
        status: blockers.length === 0 ? 'ready' : 'blocked',
        checkedAt,
        readinessSnapshot,
        blockers,
        notes,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
  }

  async listLivePilotReadinessRecords(): Promise<LivePilotReadinessRecord[]> {
    return this.livePilotReadinessRepository.find({
      order: { checkedAt: 'DESC', updatedAt: 'DESC' },
    });
  }

  async prepareBrokerOrderCommandFromPaperPlan(
    paperOrderPlanId: number,
    request: PrepareBrokerOrderCommandRequest,
    brokerAdapterStatus: BrokerAdapterStatus,
  ): Promise<BrokerOrderCommand> {
    this.assertBrokerOrderCommandRequest(request);

    const idempotencyKey = request.idempotencyKey;
    if (idempotencyKey) {
      const existing = await this.brokerOrderCommandRepository.findOne({
        where: { idempotencyKey },
      });

      if (existing) {
        return existing;
      }
    }

    const paperOrderPlan = await this.paperOrderPlanRepository.findOne({
      where: { id: paperOrderPlanId },
    });

    if (!paperOrderPlan) {
      throw new NotFoundException(
        `Paper order plan ${paperOrderPlanId} not found`,
      );
    }

    const livePilotReadiness = await this.resolveLivePilotReadiness(
      request.livePilotReadinessId,
    );
    const checkedAt = new Date();
    const baseBlockers = this.buildBrokerOrderCommandBlockers({
      commandType: 'submit_order_plan',
      livePilotReadiness,
      brokerAdapterStatus,
      signedPaperApprovalReady: Boolean(paperOrderPlan.orderPlanApprovalId),
      hasOrderSource: paperOrderPlan.orders.length > 0,
    });
    const blockedReason =
      baseBlockers[0] ?? 'Broker write dry-run command is blocked';
    const orderIntents: BrokerOrderIntent[] = paperOrderPlan.orders.map(
      (order, index) => ({
        brokerOrderIntentId: `broker-intent:${paperOrderPlan.id}:${index}`,
        sourcePaperOrderId: order.paperOrderId,
        proposalOrderIndex: order.proposalOrderIndex,
        symbol: order.symbol,
        side: order.side,
        orderType: order.orderType,
        requestedNotional: order.requestedNotional,
        requestedQuantity: order.requestedQuantity,
        requestedPrice: order.requestedPrice,
        status: 'blocked',
        blockedReason,
      }),
    );
    const notes = [
      'Broker order command is a dry-run artifact only. No broker order endpoint was called.',
      ...(request.notes ?? []),
    ];

    return this.saveBrokerOrderCommand({
      idempotencyKey,
      commandType: 'submit_order_plan',
      sourceType: 'paper_order_plan',
      proposalId: paperOrderPlan.proposalId,
      paperOrderPlanId: paperOrderPlan.id,
      orderPlanApprovalId: paperOrderPlan.orderPlanApprovalId,
      livePilotReadiness,
      checkedAt,
      brokerAdapterStatus,
      signedPaperApprovalReady: Boolean(paperOrderPlan.orderPlanApprovalId),
      hasOrderSource: paperOrderPlan.orders.length > 0,
      orderIntents,
      emergencyActions: [],
      notes,
    });
  }

  async runBrokerEmergencyCommandDryRun(
    request: RunBrokerEmergencyCommandRequest,
    brokerAdapterStatus: BrokerAdapterStatus,
  ): Promise<BrokerOrderCommand> {
    this.assertBrokerEmergencyCommandRequest(request);

    const idempotencyKey = request.idempotencyKey;
    if (idempotencyKey) {
      const existing = await this.brokerOrderCommandRepository.findOne({
        where: { idempotencyKey },
      });

      if (existing) {
        return existing;
      }
    }

    const livePilotReadiness = await this.resolveLivePilotReadiness(
      request.livePilotReadinessId,
    );
    const checkedAt = new Date();
    const baseBlockers = this.buildBrokerOrderCommandBlockers({
      commandType: request.commandType,
      livePilotReadiness,
      brokerAdapterStatus,
      signedPaperApprovalReady: false,
      hasOrderSource: true,
    });
    const blockedReason =
      baseBlockers[0] ?? 'Broker emergency dry-run command is blocked';
    const targetOpenOrders =
      request.commandType === 'cancel_open_orders'
        ? await this.listOpenBrokerOrderStatuses()
        : [];
    const emergencyActions: BrokerEmergencyAction[] = [
      {
        actionId: `broker-emergency:${request.commandType}:${checkedAt.toISOString()}`,
        actionType: request.commandType,
        status: 'blocked',
        blockedReason,
        targetOpenOrderCount: targetOpenOrders.length,
        targetBrokerOrderRefHashes: targetOpenOrders.map(
          (order) => order.brokerOrderRefHash,
        ),
      },
    ];
    const notes = [
      `Emergency dry-run reason: ${request.reason}`,
      `Emergency dry-run open order candidates: ${targetOpenOrders.length}`,
      'Broker emergency command is dry-run evidence only. No broker cancel, replace, flatten, or order endpoint was called.',
      ...(request.notes ?? []),
    ];

    return this.saveBrokerOrderCommand({
      idempotencyKey,
      commandType: request.commandType,
      sourceType: 'emergency',
      livePilotReadiness,
      checkedAt,
      brokerAdapterStatus,
      signedPaperApprovalReady: false,
      hasOrderSource: true,
      orderIntents: [],
      emergencyActions,
      notes,
    });
  }

  async listBrokerOrderCommands(): Promise<BrokerOrderCommand[]> {
    return this.brokerOrderCommandRepository.find({
      order: { checkedAt: 'DESC', updatedAt: 'DESC' },
    });
  }

  async importBrokerOrderStatus(
    request: ImportBrokerOrderStatusRequest,
  ): Promise<BrokerOrderStatusRecord> {
    this.assertBrokerOrderStatusRequest(request);

    const existing = await this.brokerOrderStatusRepository.findOne({
      where: { brokerOrderRefHash: request.brokerOrderRefHash },
    });

    if (existing) {
      return existing;
    }

    const asOf = request.asOf ? new Date(request.asOf) : new Date();
    const submittedAt = request.submittedAt
      ? new Date(request.submittedAt)
      : undefined;

    if (
      Number.isNaN(asOf.getTime()) ||
      (submittedAt && Number.isNaN(submittedAt.getTime()))
    ) {
      throw new BadRequestException(
        'Broker order status submittedAt/asOf must be valid dates',
      );
    }

    if (asOf.getTime() > Date.now() + 60_000) {
      throw new BadRequestException(
        'Broker order status asOf cannot be future',
      );
    }

    const reconciliation =
      await this.buildBrokerOrderStatusReconciliation(request);
    const status =
      reconciliation.status === 'matched'
        ? 'matched'
        : reconciliation.status === 'mismatch'
          ? 'mismatch'
          : reconciliation.status === 'unlinked'
            ? 'unlinked'
            : 'imported';

    return this.brokerOrderStatusRepository.save(
      this.brokerOrderStatusRepository.create({
        provider: request.provider ?? 'manual',
        sourceRef: request.sourceRef,
        accountRefHash: request.accountRefHash,
        brokerOrderRefHash: request.brokerOrderRefHash,
        brokerOrderCommandId: reconciliation.brokerOrderCommandId,
        brokerOrderIntentId: reconciliation.brokerOrderIntentId,
        paperOrderPlanId: reconciliation.paperOrderPlanId,
        status,
        externalStatus: request.externalStatus,
        symbol: request.symbol,
        side: request.side,
        orderType: request.orderType,
        requestedQuantity: request.requestedQuantity,
        filledQuantity: request.filledQuantity,
        remainingQuantity: request.remainingQuantity,
        requestedNotional: request.requestedNotional,
        averageFillPrice: request.averageFillPrice,
        limitPrice: request.limitPrice,
        currency: request.currency ?? 'KRW',
        submittedAt,
        asOf,
        reconciliation,
        notes: [
          'Broker order status is read-only lifecycle evidence. No broker order endpoint was called.',
          ...(request.notes ?? []),
        ],
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
  }

  async listBrokerOrderStatuses(): Promise<BrokerOrderStatusRecord[]> {
    return this.brokerOrderStatusRepository.find({
      order: { asOf: 'DESC', updatedAt: 'DESC' },
    });
  }

  async listOpenBrokerOrderStatuses(): Promise<BrokerOrderStatusRecord[]> {
    const openStatuses: BrokerOrderExternalStatus[] = [
      'submitted',
      'accepted',
      'open',
      'partially_filled',
      'pending_cancel',
      'unknown',
    ];
    const records = await this.listBrokerOrderStatuses();

    return records.filter((record) =>
      openStatuses.includes(record.externalStatus),
    );
  }

  async importBrokerFill(
    request: ImportBrokerFillRequest,
  ): Promise<BrokerFill> {
    this.assertReadOnlyBrokerFillRequest(request);

    const filledAt = new Date(request.filledAt);
    const asOf = request.asOf ? new Date(request.asOf) : filledAt;

    if (Number.isNaN(filledAt.getTime()) || Number.isNaN(asOf.getTime())) {
      throw new BadRequestException(
        'Broker fill filledAt/asOf must be valid dates',
      );
    }

    if (filledAt.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('Broker fill filledAt cannot be future');
    }

    if (request.quantity <= 0 || request.fillPrice <= 0) {
      throw new BadRequestException(
        'Broker fill quantity and fillPrice must be positive',
      );
    }

    const fee = this.roundMoney(request.fee ?? 0);

    if (fee < 0) {
      throw new BadRequestException('Broker fill fee cannot be negative');
    }

    const grossNotional = this.roundMoney(
      request.grossNotional ?? request.quantity * request.fillPrice,
    );

    if (grossNotional <= 0) {
      throw new BadRequestException(
        'Broker fill grossNotional must be positive',
      );
    }

    const provider = request.provider ?? 'manual';
    const brokerFillRefHash = this.hashObject({
      provider,
      brokerFillRef: request.brokerFillRef,
    });
    const existingFill = await this.brokerFillRepository.findOne({
      where: { brokerFillRefHash },
    });

    if (existingFill) {
      return this.reconcileBrokerFillAgainstPaper(existingFill, {
        tolerance: existingFill.reconciliation.tolerance,
        notes: ['Idempotent broker fill import replayed by fill ref hash.'],
      });
    }

    const reconciliation: BrokerFillReconciliation = {
      status: 'not_checked',
      symbolMatched: false,
      sideMatched: false,
      quantityMatched: false,
      notionalMatched: false,
      feeMatched: false,
      brokerQuantity: request.quantity,
      brokerGrossNotional: grossNotional,
      brokerFee: fee,
      tolerance: 0.01,
      notes: [
        'Imported as read-only broker fill evidence. No order endpoint was called.',
        'Fill reconciliation against local paper fills is attempted automatically.',
      ],
    };

    const savedFill = await this.brokerFillRepository.save(
      this.brokerFillRepository.create({
        provider,
        sourceRef: request.sourceRef,
        accountRefHash: request.accountRef
          ? this.hashObject({ accountRef: request.accountRef })
          : undefined,
        brokerOrderRefHash: request.brokerOrderRef
          ? this.hashObject({ brokerOrderRef: request.brokerOrderRef })
          : undefined,
        brokerFillRefHash,
        status: 'imported',
        symbol: request.symbol,
        side: request.side,
        quantity: request.quantity,
        fillPrice: request.fillPrice,
        grossNotional,
        fee,
        feeCurrency: request.feeCurrency ?? request.currency ?? 'KRW',
        currency: request.currency ?? 'KRW',
        filledAt,
        asOf,
        reconciliation,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );

    return this.reconcileBrokerFillAgainstPaper(savedFill, {
      tolerance: reconciliation.tolerance,
      notes: [
        'Automatic paper-fill matching attempted immediately after import.',
      ],
    });
  }

  async listBrokerFills(): Promise<BrokerFill[]> {
    return this.brokerFillRepository.find({
      order: { filledAt: 'DESC', updatedAt: 'DESC' },
    });
  }

  async reconcileBrokerFill(
    fillId: number,
    request: ReconcileBrokerFillRequest = {},
  ): Promise<BrokerFill> {
    const brokerFill = await this.brokerFillRepository.findOne({
      where: { id: fillId },
    });

    if (!brokerFill) {
      throw new NotFoundException(`Broker fill ${fillId} not found`);
    }

    return this.reconcileBrokerFillAgainstPaper(brokerFill, request);
  }

  async getLatestBrokerSnapshot(): Promise<BrokerSnapshot> {
    const latest = await this.brokerSnapshotRepository.findOne({
      where: {},
      order: { asOf: 'DESC', updatedAt: 'DESC' },
    });

    if (!latest) {
      throw new NotFoundException('No broker read-only snapshot exists');
    }

    return latest;
  }

  async reconcileBrokerSnapshot(
    snapshotId: number,
    request: ReconcileBrokerSnapshotRequest = {},
  ): Promise<BrokerSnapshot> {
    const snapshot = await this.brokerSnapshotRepository.findOne({
      where: { id: snapshotId },
    });

    if (!snapshot) {
      throw new NotFoundException(`Broker snapshot ${snapshotId} not found`);
    }

    const paperAccount = request.paperAccountId
      ? await this.paperAccountRepository.findOne({
          where: { id: request.paperAccountId },
        })
      : await this.paperAccountRepository.findOne({
          where: { status: 'active' },
          order: { updatedAt: 'DESC' },
        });

    if (!paperAccount) {
      throw new NotFoundException(
        'Broker snapshot reconciliation requires an active paper account',
      );
    }

    const tolerance = request.tolerance ?? snapshot.reconciliation.tolerance;
    const maxAgeMinutes =
      request.maxAgeMinutes ?? snapshot.reconciliation.maxAgeMinutes;
    const checkedAt = new Date();
    const ageMinutes = (checkedAt.getTime() - snapshot.asOf.getTime()) / 60_000;
    const expectedPaperPositions = this.positionsToMarketValueMap(
      paperAccount.positions,
    );
    const actualBrokerPositions = this.positionsToMarketValueMap(
      snapshot.positions,
    );
    const allSymbols = Array.from(
      new Set([
        ...Object.keys(expectedPaperPositions),
        ...Object.keys(actualBrokerPositions),
      ]),
    );
    const positionDiffs = Object.fromEntries(
      allSymbols.map((symbol) => [
        symbol,
        this.roundMoney(
          (actualBrokerPositions[symbol] ?? 0) -
            (expectedPaperPositions[symbol] ?? 0),
        ),
      ]),
    );
    const cashDiff = this.roundMoney(snapshot.cash - paperAccount.cash);
    const equityDiff = this.roundMoney(snapshot.equity - paperAccount.equity);
    const cashMatched = Math.abs(cashDiff) <= tolerance;
    const equityMatched = Math.abs(equityDiff) <= tolerance;
    const positionsMatched = Object.values(positionDiffs).every(
      (diff) => Math.abs(diff) <= tolerance,
    );
    const stale = ageMinutes > maxAgeMinutes;
    const status = stale
      ? 'stale'
      : cashMatched && equityMatched && positionsMatched
        ? 'matched'
        : 'mismatch';

    snapshot.status = status;
    snapshot.reconciliation = {
      status,
      checkedAt: checkedAt.toISOString(),
      paperAccountId: paperAccount.id,
      cashMatched,
      equityMatched,
      positionsMatched,
      expectedPaperCash: paperAccount.cash,
      actualBrokerCash: snapshot.cash,
      cashDiff,
      expectedPaperEquity: paperAccount.equity,
      actualBrokerEquity: snapshot.equity,
      equityDiff,
      expectedPaperPositions,
      actualBrokerPositions,
      positionDiffs,
      tolerance,
      maxAgeMinutes,
      notes: [
        ...snapshot.reconciliation.notes,
        ...(request.notes ?? []),
        stale
          ? `Broker snapshot is stale: ${this.roundMoney(ageMinutes)} minutes old.`
          : 'Broker snapshot compared against active paper account state.',
      ],
    };

    return this.brokerSnapshotRepository.save(snapshot);
  }

  private async reconcileBrokerFillAgainstPaper(
    brokerFill: BrokerFill,
    request: ReconcileBrokerFillRequest = {},
  ): Promise<BrokerFill> {
    const tolerance = request.tolerance ?? brokerFill.reconciliation.tolerance;
    const candidate = await this.findPaperFillMatchForBrokerFill(
      brokerFill,
      request,
    );
    const checkedAt = new Date();

    if (!candidate) {
      brokerFill.status = 'mismatch';
      brokerFill.reconciliation = {
        ...brokerFill.reconciliation,
        status: 'mismatch',
        checkedAt: checkedAt.toISOString(),
        symbolMatched: false,
        sideMatched: false,
        quantityMatched: false,
        notionalMatched: false,
        feeMatched: false,
        brokerQuantity: brokerFill.quantity,
        brokerGrossNotional: brokerFill.grossNotional,
        brokerFee: brokerFill.fee,
        tolerance,
        notes: [
          ...brokerFill.reconciliation.notes,
          ...(request.notes ?? []),
          request.paperOrderPlanId
            ? `No matching paper fill found in paper order plan ${request.paperOrderPlanId}.`
            : 'No matching paper fill found for this broker fill evidence.',
        ],
      };

      return this.brokerFillRepository.save(brokerFill);
    }

    const quantityDiff = this.roundQuantity(
      brokerFill.quantity - candidate.paperFill.quantity,
    );
    const notionalDiff = this.roundMoney(
      brokerFill.grossNotional - candidate.paperFill.grossNotional,
    );
    const feeDiff = this.roundMoney(brokerFill.fee - candidate.paperFill.fee);
    const symbolMatched = brokerFill.symbol === candidate.paperFill.symbol;
    const sideMatched = brokerFill.side === candidate.paperFill.side;
    const quantityMatched = Math.abs(quantityDiff) <= tolerance;
    const notionalMatched = Math.abs(notionalDiff) <= tolerance;
    const feeCurrencyMatched =
      brokerFill.feeCurrency === candidate.paperFill.feeCurrency;
    const feeMatched = Math.abs(feeDiff) <= tolerance && feeCurrencyMatched;
    const status =
      symbolMatched &&
      sideMatched &&
      quantityMatched &&
      notionalMatched &&
      feeMatched
        ? 'matched'
        : 'mismatch';

    brokerFill.status = status;
    brokerFill.reconciliation = {
      ...brokerFill.reconciliation,
      status,
      checkedAt: checkedAt.toISOString(),
      paperOrderPlanId: candidate.plan.id,
      paperFillId: candidate.paperFill.paperFillId,
      symbolMatched,
      sideMatched,
      quantityMatched,
      notionalMatched,
      feeMatched,
      brokerQuantity: brokerFill.quantity,
      brokerGrossNotional: brokerFill.grossNotional,
      brokerFee: brokerFill.fee,
      expectedQuantity: candidate.paperFill.quantity,
      expectedGrossNotional: candidate.paperFill.grossNotional,
      expectedFee: candidate.paperFill.fee,
      quantityDiff,
      notionalDiff,
      feeDiff,
      tolerance,
      notes: [
        ...brokerFill.reconciliation.notes,
        ...(request.notes ?? []),
        `Broker fill compared against paper fill ${candidate.paperFill.paperFillId} from paper order plan ${candidate.plan.id}.`,
        feeCurrencyMatched
          ? 'Broker fee currency matches paper fee currency.'
          : `Broker fee currency ${brokerFill.feeCurrency} differs from paper fee currency ${candidate.paperFill.feeCurrency}.`,
      ],
    };

    return this.brokerFillRepository.save(brokerFill);
  }

  private async findPaperFillMatchForBrokerFill(
    brokerFill: BrokerFill,
    request: ReconcileBrokerFillRequest,
  ): Promise<{ plan: PaperOrderPlan; paperFill: PaperFill } | null> {
    const plans = request.paperOrderPlanId
      ? await this.findRequestedBrokerFillPaperPlan(request.paperOrderPlanId)
      : await this.paperOrderPlanRepository.find({
          order: { updatedAt: 'DESC' },
        });

    const candidates = plans.flatMap((plan) =>
      plan.fills
        .filter((paperFill) =>
          request.paperFillId
            ? paperFill.paperFillId === request.paperFillId
            : paperFill.status === 'filled',
        )
        .map((paperFill) => ({
          plan,
          paperFill,
          symbolMatched: brokerFill.symbol === paperFill.symbol,
          sideMatched: brokerFill.side === paperFill.side,
          quantityDiff: Math.abs(
            this.roundQuantity(brokerFill.quantity - paperFill.quantity),
          ),
          notionalDiff: Math.abs(
            this.roundMoney(brokerFill.grossNotional - paperFill.grossNotional),
          ),
          feeDiff: Math.abs(this.roundMoney(brokerFill.fee - paperFill.fee)),
          timeDiffMs: Math.abs(
            brokerFill.filledAt.getTime() -
              new Date(paperFill.timestamp).getTime(),
          ),
        })),
    );

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((left, right) => {
      const leftScore =
        (left.symbolMatched ? 0 : 1) +
        (left.sideMatched ? 0 : 1) +
        left.notionalDiff / 1_000_000 +
        left.quantityDiff / 1_000_000 +
        left.feeDiff / 1_000_000 +
        left.timeDiffMs / 86_400_000;
      const rightScore =
        (right.symbolMatched ? 0 : 1) +
        (right.sideMatched ? 0 : 1) +
        right.notionalDiff / 1_000_000 +
        right.quantityDiff / 1_000_000 +
        right.feeDiff / 1_000_000 +
        right.timeDiffMs / 86_400_000;

      return leftScore - rightScore;
    });

    return candidates[0];
  }

  private async findRequestedBrokerFillPaperPlan(
    paperOrderPlanId: number,
  ): Promise<PaperOrderPlan[]> {
    const plan = await this.paperOrderPlanRepository.findOne({
      where: { id: paperOrderPlanId },
    });

    if (!plan) {
      throw new NotFoundException(
        `Paper order plan ${paperOrderPlanId} not found`,
      );
    }

    return [plan];
  }

  async getExecutionControlState(): Promise<ExecutionControlState> {
    const latest = await this.executionControlRepository.findOne({
      where: {},
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    if (latest) {
      return latest;
    }

    return this.executionControlRepository.save(
      this.executionControlRepository.create({
        state: 'active',
        actor: 'system',
        reason: 'Default execution-control state for paper simulation only.',
      }),
    );
  }

  async updateExecutionControlState(
    request: UpdateExecutionControlRequest,
  ): Promise<ExecutionControlState> {
    return this.executionControlRepository.save(
      this.executionControlRepository.create({
        state: request.state,
        actor: request.actor ?? 'human',
        reason: request.reason,
      }),
    );
  }

  async getKillSwitchStatus(): Promise<KillSwitchStatus> {
    return this.buildKillSwitchStatus(await this.getExecutionControlState());
  }

  async tripKillSwitch(
    request: TripKillSwitchRequest,
  ): Promise<KillSwitchStatus> {
    if (!request.reason?.trim()) {
      throw new BadRequestException('Kill switch trip requires a reason');
    }

    const state = await this.executionControlRepository.save(
      this.executionControlRepository.create({
        state: 'halted',
        actor: request.actor?.trim() || 'human:kill-switch',
        reason: `Kill switch trip: ${request.reason.trim()}`,
      }),
    );

    return this.buildKillSwitchStatus(state);
  }

  async paperExecuteProposal(
    proposalId: number,
    request: PaperExecuteProposalRequest = {},
  ): Promise<PaperOrderPlan> {
    const proposal = await this.proposalRepository.findOne({
      where: { id: proposalId },
    });

    if (!proposal) {
      throw new NotFoundException(`Proposal ${proposalId} not found`);
    }

    const executionControlState = await this.getExecutionControlState();
    const budget = proposal.budgetEnvelopeId
      ? await this.budgetRepository.findOne({
          where: { id: proposal.budgetEnvelopeId },
        })
      : await this.budgetRepository.findOne({
          where: { status: 'active' },
          order: { updatedAt: 'DESC' },
        });
    const paperAccount = await this.findPaperAccountForProposal(proposal);
    const currentPaperAccountEvent = paperAccount
      ? await this.getLatestPaperAccountEvent(paperAccount.id)
      : null;
    const paperPortfolioBefore = paperAccount
      ? this.buildPaperAccountPortfolio(paperAccount)
      : this.buildSeedPaperPortfolioForProposal(proposal, budget);
    const orderPlanApproval = await this.findOrderPlanApprovalForPaperExecution(
      proposal.id,
      request,
    );
    let latestEvaluation = orderPlanApproval
      ? await this.riskEvaluationRepository.findOne({
          where: { id: orderPlanApproval.riskEvaluationId },
        })
      : await this.findLatestRiskEvaluation(proposal.id);
    const hasPaperAllow =
      latestEvaluation?.decision === 'ALLOW' &&
      latestEvaluation.responseSnapshot.mode === 'paper' &&
      this.riskEvaluationMatchesProposal(
        latestEvaluation,
        proposal,
        paperPortfolioBefore,
      );

    if (!hasPaperAllow) {
      latestEvaluation = await this.evaluateProposalForPaperExecution(
        proposal,
        budget,
        orderPlanApproval?.approvalHash,
        paperPortfolioBefore,
      );
    }
    const submittedAt = new Date();
    const idempotencyKey =
      request.idempotencyKey ??
      orderPlanApproval?.idempotencyKey ??
      `paper:proposal:${proposal.id}:risk:${latestEvaluation?.id ?? 'none'}`;
    const existingIdempotentPlan =
      await this.findPaperOrderPlanByIdempotencyKey(
        proposal.id,
        idempotencyKey,
      );

    if (existingIdempotentPlan) {
      return existingIdempotentPlan;
    }

    const existingPlans = await this.findPaperOrderPlansForProposal(
      proposal.id,
    );
    const noDuplicatePlan = !existingPlans.some((plan) =>
      [
        'planned',
        'simulating',
        'partially_filled',
        'filled',
        'reconciled',
      ].includes(plan.status),
    );
    const proposalHash = this.hashProposal(proposal);
    const riskRequestHash = latestEvaluation
      ? this.hashObject(latestEvaluation.requestSnapshot)
      : undefined;
    const riskMatchesProposal = latestEvaluation
      ? this.riskEvaluationMatchesProposal(
          latestEvaluation,
          proposal,
          paperPortfolioBefore,
        )
      : false;
    const reservationSnapshot = await this.buildPaperReservationSnapshot(
      proposal,
      paperPortfolioBefore,
      paperAccount,
    );
    const cashSufficient =
      reservationSnapshot.availableCash >= reservationSnapshot.requiredCash;
    const positionsSufficient = Object.entries(
      reservationSnapshot.requiredSellNotionalBySymbol,
    ).every(
      ([symbol, requiredNotional]) =>
        (reservationSnapshot.availableSellNotionalBySymbol[symbol] ?? 0) >=
        requiredNotional,
    );
    const approvalCustodyReasons = orderPlanApproval
      ? this.getOrderPlanApprovalCustodyBlockedReasons(orderPlanApproval)
      : [];
    const approvalCustodyVerified =
      Boolean(orderPlanApproval) && approvalCustodyReasons.length === 0;
    const accountEventFresh = Boolean(
      orderPlanApproval &&
        currentPaperAccountEvent &&
        orderPlanApproval.paperAccountId === paperAccount?.id &&
        orderPlanApproval.paperAccountEventHash ===
          currentPaperAccountEvent.eventHash,
    );
    const readinessSnapshot: PaperReadinessSnapshot = {
      budgetActive: budget?.status === 'active',
      latestRiskAllow: latestEvaluation?.decision === 'ALLOW',
      riskMatchesProposal,
      paperEngineEnabled: true,
      brokerExecutionDisabled: true,
      liveTradingDisabled: true,
      explicitPaperAccountActive: Boolean(paperAccount),
      approvalCustodyVerified,
      accountEventFresh,
      approvalPaperAccountEventHash: orderPlanApproval?.paperAccountEventHash,
      currentPaperAccountEventHash: currentPaperAccountEvent?.eventHash,
      paperAccountEventSequence: currentPaperAccountEvent?.sequence,
      paperAccountLockVersion: paperAccount?.lockVersion ?? 0,
      killSwitchArmed: true,
      killSwitchTripped: executionControlState.state !== 'active',
      cashSufficient,
      positionsSufficient,
      noDuplicatePlan,
      ...reservationSnapshot,
    };
    const blockedReasons = this.getPaperExecutionBlockedReasons({
      latestEvaluation,
      expectedRiskEvaluationId: request.expectedRiskEvaluationId,
      orderPlanApproval,
      idempotencyKey,
      readinessSnapshot,
      executionControlState: executionControlState.state,
      proposal,
      paperAccount,
      currentPaperAccountEvent,
      approvalCustodyReasons,
    });

    if (
      blockedReasons.length === 0 &&
      paperAccount &&
      currentPaperAccountEvent &&
      this.dataSource
    ) {
      return this.paperExecuteProposalWithAccountCriticalSection({
        proposal,
        budget,
        paperAccount,
        latestEvaluation,
        orderPlanApproval,
        idempotencyKey,
        submittedAt,
        executionControlState,
        expectedRiskEvaluationId: request.expectedRiskEvaluationId,
        approvalCustodyReasons,
      });
    }

    const reservationHold =
      blockedReasons.length === 0
        ? this.buildPaperReservationHold(
            proposal.id,
            idempotencyKey,
            readinessSnapshot,
            submittedAt,
          )
        : undefined;
    if (reservationHold && paperAccount) {
      await this.persistPaperReservationHoldRecord(
        reservationHold,
        paperAccount,
        proposal,
        submittedAt,
      );
    }
    const simulated = this.simulatePaperFills(
      proposal,
      paperPortfolioBefore,
      blockedReasons,
      submittedAt,
    );

    const planHash = this.hashObject({
      idempotencyKey,
      proposalHash,
      riskRequestHash,
      orderPlanApprovalHash: orderPlanApproval?.approvalHash,
      readinessSnapshot,
      orders: simulated.orders,
      blockedReasons,
    });
    const paperOrderPlan = this.paperOrderPlanRepository.create({
      proposalId: proposal.id,
      researchRunId: proposal.researchRunId,
      budgetEnvelopeId: proposal.budgetEnvelopeId,
      paperAccountId: paperAccount?.id,
      orderPlanApprovalId: orderPlanApproval?.id,
      riskEvaluationId: latestEvaluation?.id,
      proposalHash,
      riskRequestHash,
      planHash,
      idempotencyKey,
      status: blockedReasons.length > 0 ? 'blocked' : 'filled',
      mode: 'paper',
      submittedAt,
      completedAt: blockedReasons.length > 0 ? submittedAt : undefined,
      readinessSnapshot,
      reservationHold,
      orders: simulated.orders,
      fills: simulated.fills,
      portfolioBefore: paperPortfolioBefore,
      portfolioAfter: simulated.portfolioAfter,
      cashLedger: simulated.cashLedger,
      positionLedger: simulated.positionLedger,
      startingCash: paperPortfolioBefore.cash,
      endingCash: simulated.endingCash,
      startingEquity: paperPortfolioBefore.equity,
      endingEquity: simulated.endingEquity,
      brokerExecutionEnabled: false,
      liveTradingEnabled: false,
      reconciliation: simulated.reconciliation,
      killSwitchSnapshot: {
        armed: true,
        tripped: executionControlState.state !== 'active',
        checkedAt: submittedAt.toISOString(),
        reason: `Execution control state is ${executionControlState.state}.`,
      },
      killSwitchEvent:
        executionControlState.state === 'active'
          ? undefined
          : {
              armed: true,
              tripped: true,
              reason: `Execution control state is ${executionControlState.state}.`,
              actor: executionControlState.actor,
              timestamp: submittedAt.toISOString(),
            },
      blockedReasons,
    });

    const saved = await this.paperOrderPlanRepository.save(paperOrderPlan);

    if (blockedReasons.length === 0 && paperAccount) {
      return this.finalizePaperOrderPlan({
        plan: saved,
        paperAccount,
        orderPlanApproval,
        proposal,
        submittedAt,
      });
    }

    return saved;
  }

  async listPaperOrderPlans(): Promise<PaperOrderPlan[]> {
    return this.paperOrderPlanRepository.find({ order: { updatedAt: 'DESC' } });
  }

  private async paperExecuteProposalWithAccountCriticalSection(input: {
    proposal: InvestmentProposal;
    budget: BudgetEnvelope | null;
    paperAccount: PaperAccount;
    latestEvaluation: RiskEvaluation | null;
    orderPlanApproval: OrderPlanApproval | null;
    idempotencyKey: string;
    submittedAt: Date;
    executionControlState: ExecutionControlState;
    expectedRiskEvaluationId?: number;
    approvalCustodyReasons: string[];
  }): Promise<PaperOrderPlan> {
    let savedPlan: PaperOrderPlan | null = null;

    try {
      return await this.dataSource!.transaction(
        'SERIALIZABLE',
        async (manager) => {
          const repositories = this.getPaperApplyRepositories(manager);
          const lockClaimed = await this.claimPaperAccountVersion(
            input.paperAccount.id,
            input.paperAccount.lockVersion ?? 0,
            repositories.paperAccountRepository,
          );

          if (!lockClaimed) {
            throw new Error(
              'Paper account lock version changed before reservation',
            );
          }

          const lockedPaperAccount =
            (await repositories.paperAccountRepository.findOne({
              where: { id: input.paperAccount.id },
            })) ?? input.paperAccount;
          const currentPaperAccountEvent =
            await this.getLatestPaperAccountEvent(
              lockedPaperAccount.id,
              repositories.paperAccountEventRepository,
            );
          const paperPortfolioBefore =
            this.buildPaperAccountPortfolio(lockedPaperAccount);
          const existingIdempotentPlan =
            await this.findPaperOrderPlanByIdempotencyKey(
              input.proposal.id,
              input.idempotencyKey,
              repositories.paperOrderPlanRepository,
            );

          if (existingIdempotentPlan) {
            return existingIdempotentPlan;
          }

          const existingPlans = await this.findPaperOrderPlansForProposal(
            input.proposal.id,
            repositories.paperOrderPlanRepository,
          );
          const noDuplicatePlan = !existingPlans.some((plan) =>
            [
              'planned',
              'simulating',
              'partially_filled',
              'filled',
              'reconciled',
            ].includes(plan.status),
          );
          const proposalHash = this.hashProposal(input.proposal);
          const riskRequestHash = input.latestEvaluation
            ? this.hashObject(input.latestEvaluation.requestSnapshot)
            : undefined;
          const riskMatchesProposal = input.latestEvaluation
            ? this.riskEvaluationMatchesProposal(
                input.latestEvaluation,
                input.proposal,
                paperPortfolioBefore,
              )
            : false;
          const reservationSnapshot = await this.buildPaperReservationSnapshot(
            input.proposal,
            paperPortfolioBefore,
            lockedPaperAccount,
            {
              paperReservationHoldRepository:
                repositories.paperReservationHoldRepository,
              paperOrderPlanRepository: repositories.paperOrderPlanRepository,
            },
          );
          const cashSufficient =
            reservationSnapshot.availableCash >=
            reservationSnapshot.requiredCash;
          const positionsSufficient = Object.entries(
            reservationSnapshot.requiredSellNotionalBySymbol,
          ).every(
            ([symbol, requiredNotional]) =>
              (reservationSnapshot.availableSellNotionalBySymbol[symbol] ??
                0) >= requiredNotional,
          );
          const approvalCustodyVerified =
            Boolean(input.orderPlanApproval) &&
            input.approvalCustodyReasons.length === 0;
          const accountEventFresh = Boolean(
            input.orderPlanApproval &&
              currentPaperAccountEvent &&
              input.orderPlanApproval.paperAccountId ===
                lockedPaperAccount.id &&
              input.orderPlanApproval.paperAccountEventHash ===
                currentPaperAccountEvent.eventHash,
          );
          const readinessSnapshot: PaperReadinessSnapshot = {
            budgetActive: input.budget?.status === 'active',
            latestRiskAllow: input.latestEvaluation?.decision === 'ALLOW',
            riskMatchesProposal,
            paperEngineEnabled: true,
            brokerExecutionDisabled: true,
            liveTradingDisabled: true,
            explicitPaperAccountActive: true,
            approvalCustodyVerified,
            accountEventFresh,
            approvalPaperAccountEventHash:
              input.orderPlanApproval?.paperAccountEventHash,
            currentPaperAccountEventHash: currentPaperAccountEvent?.eventHash,
            paperAccountEventSequence: currentPaperAccountEvent?.sequence,
            paperAccountLockVersion: lockedPaperAccount.lockVersion ?? 0,
            killSwitchArmed: true,
            killSwitchTripped: input.executionControlState.state !== 'active',
            cashSufficient,
            positionsSufficient,
            noDuplicatePlan,
            ...reservationSnapshot,
          };
          const blockedReasons = this.getPaperExecutionBlockedReasons({
            latestEvaluation: input.latestEvaluation,
            expectedRiskEvaluationId: input.expectedRiskEvaluationId,
            orderPlanApproval: input.orderPlanApproval,
            idempotencyKey: input.idempotencyKey,
            readinessSnapshot,
            executionControlState: input.executionControlState.state,
            proposal: input.proposal,
            paperAccount: lockedPaperAccount,
            currentPaperAccountEvent,
            approvalCustodyReasons: input.approvalCustodyReasons,
          });
          const reservationHold =
            blockedReasons.length === 0
              ? this.buildPaperReservationHold(
                  input.proposal.id,
                  input.idempotencyKey,
                  readinessSnapshot,
                  input.submittedAt,
                )
              : undefined;

          if (reservationHold) {
            await this.persistPaperReservationHoldRecord(
              reservationHold,
              lockedPaperAccount,
              input.proposal,
              input.submittedAt,
              repositories.paperReservationHoldRepository,
            );
          }

          const simulated = this.simulatePaperFills(
            input.proposal,
            paperPortfolioBefore,
            blockedReasons,
            input.submittedAt,
          );
          const planHash = this.hashObject({
            idempotencyKey: input.idempotencyKey,
            proposalHash,
            riskRequestHash,
            orderPlanApprovalHash: input.orderPlanApproval?.approvalHash,
            readinessSnapshot,
            orders: simulated.orders,
            blockedReasons,
          });
          savedPlan = await repositories.paperOrderPlanRepository.save(
            repositories.paperOrderPlanRepository.create({
              proposalId: input.proposal.id,
              researchRunId: input.proposal.researchRunId,
              budgetEnvelopeId: input.proposal.budgetEnvelopeId,
              paperAccountId: lockedPaperAccount.id,
              orderPlanApprovalId: input.orderPlanApproval?.id,
              riskEvaluationId: input.latestEvaluation?.id,
              proposalHash,
              riskRequestHash,
              planHash,
              idempotencyKey: input.idempotencyKey,
              status: blockedReasons.length > 0 ? 'blocked' : 'filled',
              mode: 'paper',
              submittedAt: input.submittedAt,
              completedAt:
                blockedReasons.length > 0 ? input.submittedAt : undefined,
              readinessSnapshot,
              reservationHold,
              orders: simulated.orders,
              fills: simulated.fills,
              portfolioBefore: paperPortfolioBefore,
              portfolioAfter: simulated.portfolioAfter,
              cashLedger: simulated.cashLedger,
              positionLedger: simulated.positionLedger,
              startingCash: paperPortfolioBefore.cash,
              endingCash: simulated.endingCash,
              startingEquity: paperPortfolioBefore.equity,
              endingEquity: simulated.endingEquity,
              brokerExecutionEnabled: false,
              liveTradingEnabled: false,
              reconciliation: simulated.reconciliation,
              killSwitchSnapshot: {
                armed: true,
                tripped: input.executionControlState.state !== 'active',
                checkedAt: input.submittedAt.toISOString(),
                reason: `Execution control state is ${input.executionControlState.state}.`,
              },
              killSwitchEvent:
                input.executionControlState.state === 'active'
                  ? undefined
                  : {
                      armed: true,
                      tripped: true,
                      reason: `Execution control state is ${input.executionControlState.state}.`,
                      actor: input.executionControlState.actor,
                      timestamp: input.submittedAt.toISOString(),
                    },
              blockedReasons,
            }),
          );

          if (blockedReasons.length > 0) {
            return savedPlan;
          }

          return this.finalizePaperOrderPlanWithRepositories({
            plan: savedPlan,
            paperAccount: lockedPaperAccount,
            orderPlanApproval: input.orderPlanApproval,
            proposal: input.proposal,
            submittedAt: input.submittedAt,
            repositories,
            accountLockAlreadyClaimed: true,
          });
        },
      );
    } catch (error) {
      if (savedPlan) {
        return this.blockPaperOrderPlanAfterApplyFailure(
          savedPlan,
          input.submittedAt,
          error,
        );
      }

      throw error;
    }
  }

  private getPaperApplyRepositories(
    manager?: EntityManager,
  ): PaperApplyRepositories {
    return {
      paperAccountRepository: manager
        ? manager.getRepository(PaperAccount)
        : this.paperAccountRepository,
      paperAccountEventRepository: manager
        ? manager.getRepository(PaperAccountEvent)
        : this.paperAccountEventRepository,
      paperOrderPlanRepository: manager
        ? manager.getRepository(PaperOrderPlan)
        : this.paperOrderPlanRepository,
      paperReservationHoldRepository: manager
        ? manager.getRepository(PaperReservationHoldRecord)
        : this.paperReservationHoldRepository,
      orderPlanApprovalRepository: manager
        ? manager.getRepository(OrderPlanApproval)
        : this.orderPlanApprovalRepository,
      proposalRepository: manager
        ? manager.getRepository(InvestmentProposal)
        : this.proposalRepository,
    };
  }

  private async finalizePaperOrderPlan(input: {
    plan: PaperOrderPlan;
    paperAccount: PaperAccount;
    orderPlanApproval: OrderPlanApproval | null;
    proposal: InvestmentProposal;
    submittedAt: Date;
  }): Promise<PaperOrderPlan> {
    const run = (manager?: EntityManager) =>
      this.finalizePaperOrderPlanWithRepositories({
        ...input,
        repositories: this.getPaperApplyRepositories(manager),
      });

    if (!this.dataSource) {
      return run();
    }

    try {
      return await this.dataSource.transaction((manager) => run(manager));
    } catch (error) {
      return this.blockPaperOrderPlanAfterApplyFailure(
        input.plan,
        input.submittedAt,
        error,
      );
    }
  }

  private async finalizePaperOrderPlanWithRepositories(input: {
    plan: PaperOrderPlan;
    paperAccount: PaperAccount;
    orderPlanApproval: OrderPlanApproval | null;
    proposal: InvestmentProposal;
    submittedAt: Date;
    repositories: PaperApplyRepositories;
    accountLockAlreadyClaimed?: boolean;
  }): Promise<PaperOrderPlan> {
    const {
      plan,
      paperAccount,
      orderPlanApproval,
      proposal,
      submittedAt,
      repositories,
      accountLockAlreadyClaimed,
    } = input;
    const accountForApply =
      (await repositories.paperAccountRepository.findOne({
        where: { id: paperAccount.id },
      })) ?? paperAccount;
    const preApplyBlockedReason =
      await this.getPaperAccountPreApplyBlockedReason(
        plan,
        accountForApply,
        repositories.paperAccountEventRepository,
      );

    if (preApplyBlockedReason) {
      this.blockPaperOrderPlanBeforeApply(
        plan,
        submittedAt,
        preApplyBlockedReason,
      );
      if (plan.reservationHold) {
        await this.releasePaperReservationHoldRecord(
          plan.reservationHold.holdId,
          plan,
          submittedAt,
          preApplyBlockedReason,
          repositories.paperReservationHoldRepository,
        );
      }
      return repositories.paperOrderPlanRepository.save(plan);
    }

    const lockClaimed =
      accountLockAlreadyClaimed ||
      (await this.claimPaperAccountApplyLock(
        plan,
        accountForApply,
        repositories.paperAccountRepository,
      ));

    if (!lockClaimed) {
      const reason = 'Paper account lock version changed before account apply';
      this.blockPaperOrderPlanBeforeApply(plan, submittedAt, reason);
      if (plan.reservationHold) {
        await this.releasePaperReservationHoldRecord(
          plan.reservationHold.holdId,
          plan,
          submittedAt,
          reason,
          repositories.paperReservationHoldRepository,
        );
      }
      return repositories.paperOrderPlanRepository.save(plan);
    }

    this.consumePaperReservationHold(plan, submittedAt);
    if (plan.reservationHold) {
      await this.consumePaperReservationHoldRecord(
        plan.reservationHold.holdId,
        plan,
        submittedAt,
        repositories.paperReservationHoldRepository,
      );
    }
    const savedPlan = await repositories.paperOrderPlanRepository.save(plan);
    await this.applyPaperPlanToAccount(
      savedPlan,
      accountForApply,
      repositories,
    );
    if (orderPlanApproval) {
      orderPlanApproval.status = 'consumed';
      orderPlanApproval.consumedAt = submittedAt;
      orderPlanApproval.consumedByPaperOrderPlanId = savedPlan.id;
      await repositories.orderPlanApprovalRepository.save(orderPlanApproval);
    }
    proposal.status = 'paper_ready';
    await repositories.proposalRepository.save(proposal);

    return savedPlan;
  }

  private async blockPaperOrderPlanAfterApplyFailure(
    plan: PaperOrderPlan,
    blockedAt: Date,
    error: unknown,
  ): Promise<PaperOrderPlan> {
    const reason = `Paper account apply transaction failed: ${
      error instanceof Error ? error.message : 'unknown error'
    }`;
    this.blockPaperOrderPlanBeforeApply(plan, blockedAt, reason);
    if (plan.reservationHold) {
      await this.releasePaperReservationHoldRecord(
        plan.reservationHold.holdId,
        plan,
        blockedAt,
        reason,
      );
    }

    return this.paperOrderPlanRepository.save(plan);
  }

  private async getPaperAccountPreApplyBlockedReason(
    plan: PaperOrderPlan,
    paperAccount: PaperAccount,
    paperAccountEventRepository: Repository<PaperAccountEvent> = this
      .paperAccountEventRepository,
  ): Promise<string | null> {
    const expectedEventHash =
      plan.readinessSnapshot.currentPaperAccountEventHash;

    if (!expectedEventHash) {
      return 'Paper account apply requires current account event evidence';
    }

    const latestEvent = await this.getLatestPaperAccountEvent(
      paperAccount.id,
      paperAccountEventRepository,
    );

    if (!latestEvent) {
      return 'Paper account apply requires latest account event evidence';
    }

    if (latestEvent.eventHash !== expectedEventHash) {
      return 'Paper account event changed before account apply';
    }

    const expectedLockVersion = plan.readinessSnapshot.paperAccountLockVersion;
    if (
      expectedLockVersion !== undefined &&
      (paperAccount.lockVersion ?? 0) !== expectedLockVersion
    ) {
      return 'Paper account lock version changed before account apply';
    }

    return null;
  }

  private async claimPaperAccountApplyLock(
    plan: PaperOrderPlan,
    paperAccount: PaperAccount,
    paperAccountRepository: Repository<PaperAccount>,
  ): Promise<boolean> {
    const expectedLockVersion = plan.readinessSnapshot.paperAccountLockVersion;

    if (expectedLockVersion === undefined) {
      return false;
    }

    const nextLockVersion = expectedLockVersion + 1;
    const result = await paperAccountRepository.update(
      { id: paperAccount.id, lockVersion: expectedLockVersion },
      { lockVersion: nextLockVersion },
    );

    if (result.affected !== 1) {
      return false;
    }

    paperAccount.lockVersion = nextLockVersion;
    return true;
  }

  private async claimPaperAccountVersion(
    paperAccountId: number,
    expectedLockVersion: number,
    paperAccountRepository: Repository<PaperAccount>,
  ): Promise<boolean> {
    const result = await paperAccountRepository.update(
      { id: paperAccountId, lockVersion: expectedLockVersion },
      { lockVersion: expectedLockVersion + 1 },
    );

    return result.affected === 1;
  }

  private blockPaperOrderPlanBeforeApply(
    plan: PaperOrderPlan,
    blockedAt: Date,
    reason: string,
  ): void {
    plan.status = 'blocked';
    plan.completedAt = blockedAt;
    plan.blockedReasons = [...plan.blockedReasons, reason];
    plan.fills = [];
    plan.cashLedger = [];
    plan.positionLedger = [];
    plan.portfolioAfter = plan.portfolioBefore;
    plan.endingCash = plan.startingCash;
    plan.endingEquity = plan.startingEquity;
    plan.reconciliation = {
      status: 'not_required',
      cashMatched: true,
      positionsMatched: true,
      expectedCash: plan.startingCash,
      expectedPositions: this.positionsToMarketValueMap(
        plan.portfolioBefore.positions,
      ),
      tolerance: 0,
      notes: [
        'Paper account projection was not updated because final account-event freshness failed.',
      ],
    };
    if (plan.reservationHold) {
      plan.reservationHold = {
        ...plan.reservationHold,
        status: 'released',
        releasedAt: blockedAt.toISOString(),
        notes: [...plan.reservationHold.notes, reason],
      };
    }
  }

  private buildPaperReservationHold(
    proposalId: number,
    idempotencyKey: string,
    readinessSnapshot: PaperReadinessSnapshot,
    createdAt: Date,
  ): PaperReservationHold {
    const holdHashInput = {
      proposalId,
      idempotencyKey,
      cashAmount: readinessSnapshot.requiredCash,
      sellNotionalBySymbol: readinessSnapshot.requiredSellNotionalBySymbol,
      availableCashAtHold: readinessSnapshot.availableCash,
      availableSellNotionalBySymbolAtHold:
        readinessSnapshot.availableSellNotionalBySymbol,
      paperAccountEventHash: readinessSnapshot.currentPaperAccountEventHash,
      paperAccountEventSequence: readinessSnapshot.paperAccountEventSequence,
      accountLockVersion: readinessSnapshot.paperAccountLockVersion,
      approvalCustodyVerified: readinessSnapshot.approvalCustodyVerified,
    };
    const holdHash = this.hashObject(holdHashInput);

    return {
      holdId: `paper-reservation:${proposalId}:${holdHash}`,
      status: 'reserved',
      idempotencyKey,
      createdAt: createdAt.toISOString(),
      cashAmount: readinessSnapshot.requiredCash,
      sellNotionalBySymbol: readinessSnapshot.requiredSellNotionalBySymbol,
      availableCashAtHold: readinessSnapshot.availableCash,
      availableSellNotionalBySymbolAtHold:
        readinessSnapshot.availableSellNotionalBySymbol,
      holdHash,
      paperAccountEventHashAtHold:
        readinessSnapshot.currentPaperAccountEventHash,
      paperAccountEventSequenceAtHold:
        readinessSnapshot.paperAccountEventSequence,
      accountLockVersionAtHold: readinessSnapshot.paperAccountLockVersion,
      approvalCustodyVerifiedAtHold: readinessSnapshot.approvalCustodyVerified,
      notes: [
        'Reservation hold is local paper evidence only.',
        'No broker cash or broker position was reserved.',
      ],
    };
  }

  private consumePaperReservationHold(
    plan: PaperOrderPlan,
    consumedAt: Date,
  ): void {
    if (!plan.reservationHold) {
      return;
    }

    plan.reservationHold = {
      ...plan.reservationHold,
      status: 'consumed',
      consumedAt: consumedAt.toISOString(),
      notes: [
        ...plan.reservationHold.notes,
        `Consumed by paper order plan ${plan.id}.`,
      ],
    };
  }

  private async persistPaperReservationHoldRecord(
    hold: PaperReservationHold,
    paperAccount: PaperAccount,
    proposal: InvestmentProposal,
    reservedAt: Date,
    paperReservationHoldRepository: Repository<PaperReservationHoldRecord> = this
      .paperReservationHoldRepository,
  ): Promise<PaperReservationHoldRecord> {
    const existing = await paperReservationHoldRepository.findOne({
      where: { holdId: hold.holdId },
    });

    if (existing) {
      return existing;
    }

    const record = paperReservationHoldRepository.create({
      holdId: hold.holdId,
      paperAccountId: paperAccount.id,
      proposalId: proposal.id,
      status: 'reserved',
      idempotencyKey: hold.idempotencyKey,
      reservedAt,
      cashAmount: hold.cashAmount,
      sellNotionalBySymbol: hold.sellNotionalBySymbol,
      availableCashAtHold: hold.availableCashAtHold,
      availableSellNotionalBySymbolAtHold:
        hold.availableSellNotionalBySymbolAtHold,
      paperAccountEventHashAtHold: hold.paperAccountEventHashAtHold,
      paperAccountEventSequenceAtHold: hold.paperAccountEventSequenceAtHold,
      accountLockVersionAtHold: hold.accountLockVersionAtHold,
      holdHash: hold.holdHash,
      holdSnapshot: hold,
      notes: [
        ...hold.notes,
        'Persisted in paper_reservation_holds before paper fill simulation.',
      ],
    });

    return paperReservationHoldRepository.save(record);
  }

  private async consumePaperReservationHoldRecord(
    holdId: string,
    plan: PaperOrderPlan,
    consumedAt: Date,
    paperReservationHoldRepository: Repository<PaperReservationHoldRecord> = this
      .paperReservationHoldRepository,
  ): Promise<void> {
    const record = await paperReservationHoldRepository.findOne({
      where: { holdId },
    });

    if (!record || record.status !== 'reserved') {
      return;
    }

    record.status = 'consumed';
    record.paperOrderPlanId = plan.id;
    record.consumedAt = consumedAt;
    record.holdSnapshot = plan.reservationHold ?? record.holdSnapshot;
    record.notes = [
      ...record.notes,
      `Consumed by paper order plan ${plan.id}.`,
    ];

    await paperReservationHoldRepository.save(record);
  }

  private async releasePaperReservationHoldRecord(
    holdId: string,
    plan: PaperOrderPlan,
    releasedAt: Date,
    reason: string,
    paperReservationHoldRepository: Repository<PaperReservationHoldRecord> = this
      .paperReservationHoldRepository,
  ): Promise<void> {
    const record = await paperReservationHoldRepository.findOne({
      where: { holdId },
    });

    if (!record || record.status !== 'reserved') {
      return;
    }

    record.status = 'released';
    record.paperOrderPlanId = plan.id;
    record.releasedAt = releasedAt;
    record.holdSnapshot = plan.reservationHold ?? record.holdSnapshot;
    record.notes = [...record.notes, reason];

    await paperReservationHoldRepository.save(record);
  }

  async getPaperOrderPlan(planId: number): Promise<PaperOrderPlan> {
    const plan = await this.paperOrderPlanRepository.findOne({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException(`Paper order plan ${planId} not found`);
    }

    return plan;
  }

  async reconcilePaperOrderPlan(
    planId: number,
    request: ReconcilePaperOrderPlanRequest = {},
  ): Promise<PaperOrderPlan> {
    const plan = await this.getPaperOrderPlan(planId);

    if (plan.status === 'blocked') {
      return plan;
    }

    const tolerance = request.tolerance ?? plan.reconciliation.tolerance;
    const paperAccount = plan.paperAccountId
      ? await this.paperAccountRepository.findOne({
          where: { id: plan.paperAccountId },
        })
      : await this.findPaperAccountForPlan(plan);

    if (!paperAccount) {
      throw new NotFoundException(
        `Paper account for order plan ${planId} not found`,
      );
    }

    const { actualCash, actualPositions } =
      this.buildPlanScopedActualsFromAccount(plan, paperAccount);
    const expectedPositions = plan.reconciliation.expectedPositions;
    const allSymbols = Array.from(
      new Set([
        ...Object.keys(expectedPositions),
        ...Object.keys(actualPositions),
      ]),
    );
    const positionDiffs = Object.fromEntries(
      allSymbols.map((symbol) => [
        symbol,
        this.roundMoney(
          (actualPositions[symbol] ?? 0) - (expectedPositions[symbol] ?? 0),
        ),
      ]),
    );
    const cashDiff = this.roundMoney(
      actualCash - plan.reconciliation.expectedCash,
    );
    const cashMatched = Math.abs(cashDiff) <= tolerance;
    const positionsMatched = Object.values(positionDiffs).every(
      (diff) => Math.abs(diff) <= tolerance,
    );
    const reconciledAt = new Date();

    plan.reconciliation = {
      ...plan.reconciliation,
      status: cashMatched && positionsMatched ? 'matched' : 'mismatch',
      reconciledAt: reconciledAt.toISOString(),
      cashMatched,
      positionsMatched,
      actualCash,
      cashDiff,
      actualPositions,
      positionDiffs,
      tolerance,
      notes: [
        ...plan.reconciliation.notes,
        ...(request.notes ?? []),
        'Paper reconciliation compared expected state to account ledger entries for this plan.',
      ],
    };
    plan.status =
      cashMatched && positionsMatched ? 'reconciled' : 'reconciliation_failed';
    plan.completedAt = reconciledAt;
    paperAccount.lastReconciledAt = reconciledAt;
    await this.paperAccountRepository.save(paperAccount);

    return this.paperOrderPlanRepository.save(plan);
  }

  private buildPlanScopedActualsFromAccount(
    plan: PaperOrderPlan,
    paperAccount: PaperAccount,
  ): {
    actualCash: number;
    actualPositions: Record<string, number>;
  } {
    const planFillIds = new Set(plan.fills.map((fill) => fill.paperFillId));
    const accountCashEvents = paperAccount.cashLedger.filter((entry) =>
      planFillIds.has(entry.paperFillId),
    );
    const accountPositionEvents = paperAccount.positionLedger.filter((entry) =>
      planFillIds.has(entry.paperFillId),
    );
    const actualCash =
      accountCashEvents.length > 0
        ? accountCashEvents[accountCashEvents.length - 1].balanceAfter
        : plan.portfolioBefore.cash;
    const actualPositions = {
      ...this.positionsToMarketValueMap(plan.portfolioBefore.positions),
    };

    for (const entry of accountPositionEvents) {
      actualPositions[entry.symbol] = entry.positionNotionalAfter;
    }

    return {
      actualCash: this.roundMoney(actualCash),
      actualPositions,
    };
  }

  async createResearchRun(
    request: CreateResearchRunRequest,
  ): Promise<ResearchRun> {
    const blockedReasons = this.getResearchRunBlockedReasons(request);
    const advanceEligible = blockedReasons.length === 0;
    const researchRun = this.researchRunRepository.create({
      budgetEnvelopeId: request.budgetEnvelopeId,
      objective: request.objective,
      strategyFamily: request.strategyFamily,
      hypothesis: request.hypothesis,
      status: advanceEligible ? 'proposal_ready' : 'blocked',
      phase: advanceEligible ? 'artifacts_persisted' : 'backtested',
      advanceEligible,
      blockedReasons,
      datasetRefs: request.datasetRefs,
      featureRefs: request.featureRefs,
      timestampLagRules: request.timestampLagRules,
      noLookaheadChecked: request.noLookaheadChecked,
      benchmark: request.benchmark,
      costModel: request.costModel,
      slippageModel: request.slippageModel,
      modelName: request.modelName,
      modelCategory: request.modelCategory ?? 'baseline',
      trainingWindow: request.trainingWindow,
      validationWindow: request.validationWindow,
      backtestMetrics: request.backtestMetrics,
      artifactRefs: request.artifactRefs,
      artifactHashes: request.artifactHashes,
      knownFailureModes: request.knownFailureModes,
      brokerExecutionEnabled: false,
      liveTradingEnabled: false,
    });

    return this.researchRunRepository.save(researchRun);
  }

  private async findLatestRiskEvaluation(
    proposalId: number,
  ): Promise<RiskEvaluation | null> {
    const evaluations = await this.riskEvaluationRepository.find({
      order: { evaluatedAt: 'DESC' },
    });

    return (
      evaluations
        .filter((evaluation) => evaluation.proposalId === proposalId)
        .sort(
          (left, right) =>
            right.evaluatedAt.getTime() - left.evaluatedAt.getTime(),
        )[0] ?? null
    );
  }

  private async findOrderPlanApprovalForPaperExecution(
    proposalId: number,
    request: PaperExecuteProposalRequest,
  ): Promise<OrderPlanApproval | null> {
    if (request.orderPlanApprovalId) {
      const approval = await this.orderPlanApprovalRepository.findOne({
        where: { id: request.orderPlanApprovalId },
      });

      if (!approval) {
        throw new NotFoundException(
          `Order-plan approval ${request.orderPlanApprovalId} not found`,
        );
      }

      return approval;
    }

    const approvals = await this.orderPlanApprovalRepository.find({
      order: { updatedAt: 'DESC' },
    });

    return (
      approvals.find(
        (approval) =>
          approval.proposalId === proposalId &&
          approval.status === 'active' &&
          (!request.idempotencyKey ||
            approval.idempotencyKey === request.idempotencyKey),
      ) ?? null
    );
  }

  private async findOrderPlanApprovalByIdempotencyKey(
    proposalId: number,
    idempotencyKey: string,
  ): Promise<OrderPlanApproval | null> {
    const approvals = await this.orderPlanApprovalRepository.find({
      order: { updatedAt: 'DESC' },
    });

    return (
      approvals.find(
        (approval) =>
          approval.proposalId === proposalId &&
          approval.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }

  private assertOrderPlanApprovalReplay(
    approval: OrderPlanApproval,
    expected: {
      approver: string;
      reason: string;
      expiresAt?: string;
      expectedRiskEvaluationId?: number;
      paperAccountId: number;
      paperAccountEventHash: string;
      signerKeyRef: string;
      approvalSource?: 'human' | 'paper_auto' | 'recovery_auto';
      approvedByRunId?: number;
      approvedByScheduleId?: number;
      autoApprovalPolicyRef?: string;
    },
  ): void {
    const snapshot = approval.approvalSnapshot;
    const mismatched =
      approval.approver !== expected.approver ||
      approval.reason !== expected.reason ||
      approval.approvalSource !== (expected.approvalSource ?? 'human') ||
      approval.approvedByRunId !== expected.approvedByRunId ||
      approval.approvedByScheduleId !== expected.approvedByScheduleId ||
      approval.autoApprovalPolicyRef !== expected.autoApprovalPolicyRef ||
      snapshot.expiresAt !== expected.expiresAt ||
      approval.paperAccountId !== expected.paperAccountId ||
      approval.paperAccountEventHash !== expected.paperAccountEventHash ||
      approval.signerKeyRef !== expected.signerKeyRef ||
      (expected.expectedRiskEvaluationId !== undefined &&
        approval.riskEvaluationId !== expected.expectedRiskEvaluationId);

    if (mismatched) {
      throw new BadRequestException(
        `Approval idempotency key ${approval.idempotencyKey} was already used with a different signed payload`,
      );
    }
  }

  private async evaluateProposalForPaperExecution(
    proposal: InvestmentProposal,
    budget: BudgetEnvelope | null,
    humanApprovalId?: string,
    portfolio?: PortfolioSnapshot,
  ): Promise<RiskEvaluation> {
    const request: RiskGateRequest = {
      mode: 'paper',
      actor: proposal.actor,
      researchRunId: proposal.researchRunId,
      strategyId: proposal.strategyId,
      ruleId: proposal.ruleId,
      generatedAt: proposal.generatedAt.toISOString(),
      marketDataTimestamp: proposal.marketDataTimestamp.toISOString(),
      portfolio: portfolio ?? proposal.portfolioSnapshot,
      orders: proposal.orders,
      policy: budget?.policy,
      evidenceRefs: proposal.evidenceRefs,
      humanApprovalId,
      executionIntent: 'evaluate_only',
    };
    const response = this.riskGateService.evaluate(request);
    const evaluation = this.riskEvaluationRepository.create({
      proposalId: proposal.id,
      decision: response.decision,
      reasons: response.reasons,
      requestSnapshot: request,
      responseSnapshot: response,
      brokerExecutionEnabled: false,
      requiresHumanApproval: response.requiresHumanApproval,
      evaluatedAt: new Date(response.evaluatedAt),
    });

    return this.riskEvaluationRepository.save(evaluation);
  }

  private async findPaperAccountForProposal(
    proposal: InvestmentProposal,
  ): Promise<PaperAccount | null> {
    const existingForBudget = proposal.budgetEnvelopeId
      ? await this.paperAccountRepository.findOne({
          where: {
            budgetEnvelopeId: proposal.budgetEnvelopeId,
            status: 'active',
          },
          order: { updatedAt: 'DESC' },
        })
      : null;

    if (existingForBudget) {
      return existingForBudget;
    }

    const existingActive = await this.paperAccountRepository.findOne({
      where: { status: 'active' },
      order: { updatedAt: 'DESC' },
    });

    if (
      existingActive &&
      (!proposal.budgetEnvelopeId ||
        existingActive.budgetEnvelopeId === proposal.budgetEnvelopeId)
    ) {
      return existingActive;
    }

    return null;
  }

  private async findPaperAccountForPlan(
    plan: PaperOrderPlan,
  ): Promise<PaperAccount | null> {
    if (plan.budgetEnvelopeId) {
      return this.paperAccountRepository.findOne({
        where: {
          budgetEnvelopeId: plan.budgetEnvelopeId,
          status: 'active',
        },
        order: { updatedAt: 'DESC' },
      });
    }

    return this.paperAccountRepository.findOne({
      where: { status: 'active' },
      order: { updatedAt: 'DESC' },
    });
  }

  private buildSeedPaperPortfolioForProposal(
    proposal: InvestmentProposal,
    budget: BudgetEnvelope | null,
  ): PortfolioSnapshot {
    const seedCash = budget?.totalBudget ?? proposal.portfolioSnapshot.cash;
    const seedEquity = budget?.totalBudget ?? proposal.portfolioSnapshot.equity;
    const seedPositions = proposal.portfolioSnapshot.positions ?? [];

    return {
      currency: budget?.currency ?? proposal.portfolioSnapshot.currency,
      cash: seedCash,
      equity: seedEquity,
      grossExposurePct: this.calculateGrossExposurePct(
        seedPositions,
        seedEquity,
      ),
      positions: seedPositions,
    };
  }

  private async applyPaperPlanToAccount(
    plan: PaperOrderPlan,
    paperAccount: PaperAccount,
    repositories: Pick<
      PaperApplyRepositories,
      'paperAccountRepository' | 'paperAccountEventRepository'
    > = {
      paperAccountRepository: this.paperAccountRepository,
      paperAccountEventRepository: this.paperAccountEventRepository,
    },
  ): Promise<PaperAccount> {
    if (paperAccount.appliedPlanIds.includes(plan.id)) {
      return paperAccount;
    }

    const cashBefore = paperAccount.cash;
    const equityBefore = paperAccount.equity;
    const positionsBefore = paperAccount.positions ?? [];
    paperAccount.cash = plan.portfolioAfter.cash;
    paperAccount.equity = plan.portfolioAfter.equity;
    paperAccount.positions = plan.portfolioAfter.positions ?? [];
    paperAccount.grossExposurePct = this.calculateGrossExposurePct(
      paperAccount.positions,
      paperAccount.equity,
    );
    paperAccount.cashLedger = [...paperAccount.cashLedger, ...plan.cashLedger];
    paperAccount.positionLedger = [
      ...paperAccount.positionLedger,
      ...plan.positionLedger,
    ];
    paperAccount.appliedPlanIds = [...paperAccount.appliedPlanIds, plan.id];
    paperAccount.lastAppliedPlanId = plan.id;

    const saved = await repositories.paperAccountRepository.save(paperAccount);
    await this.appendPaperAccountEventAndUpdateAccount({
      input: {
        paperAccount: saved,
        eventType: 'paper_order_plan',
        sourceId: plan.id,
        idempotencyKey: `paper-account-plan:${plan.id}`,
        actor: 'paper-execution-engine',
        reason: `Applied paper order plan ${plan.id}.`,
        requestHash: this.hashObject({
          paperAccountId: saved.id,
          paperOrderPlanId: plan.id,
          planHash: plan.planHash,
          cashBefore,
          cashAfter: saved.cash,
          equityBefore,
          equityAfter: saved.equity,
        }),
        cashBefore,
        cashAfter: saved.cash,
        equityBefore,
        equityAfter: saved.equity,
        positionsBefore,
        positionsAfter: saved.positions,
      },
      paperAccountRepository: repositories.paperAccountRepository,
      paperAccountEventRepository: repositories.paperAccountEventRepository,
    });

    return saved;
  }

  private async appendPaperAccountEvent({
    input,
    paperAccountEventRepository = this.paperAccountEventRepository,
  }: {
    input: {
      paperAccount: PaperAccount;
      eventType: PaperAccountEventType;
      sourceId?: number;
      idempotencyKey: string;
      actor: string;
      reason: string;
      requestHash: string;
      cashBefore: number;
      cashAfter: number;
      equityBefore: number;
      equityAfter: number;
      positionsBefore: PortfolioSnapshot['positions'];
      positionsAfter: PortfolioSnapshot['positions'];
    };
    paperAccountEventRepository?: Repository<PaperAccountEvent>;
  }): Promise<PaperAccountEvent> {
    const existing = await this.findPaperAccountEventByIdempotencyKey(
      input.idempotencyKey,
      paperAccountEventRepository,
    );

    if (existing) {
      this.assertIdempotentEventReplay(existing, input.requestHash);
      return existing;
    }

    const existingEvents = await paperAccountEventRepository.find({
      order: { createdAt: 'ASC' },
    });
    const accountEvents = existingEvents
      .filter((event) => event.paperAccountId === input.paperAccount.id)
      .sort((left, right) => left.sequence - right.sequence);
    const previousEvent = accountEvents[accountEvents.length - 1];
    const sequence = (previousEvent?.sequence ?? 0) + 1;
    const recordedAt = new Date();
    const eventSnapshot: PaperAccountEventSnapshot = {
      paperAccountId: input.paperAccount.id,
      budgetEnvelopeId: input.paperAccount.budgetEnvelopeId,
      eventType: input.eventType,
      sourceId: input.sourceId,
      idempotencyKey: input.idempotencyKey,
      actor: input.actor,
      reason: input.reason,
      sequence,
      currency: input.paperAccount.currency,
      cashBefore: this.roundMoney(input.cashBefore),
      cashAfter: this.roundMoney(input.cashAfter),
      equityBefore: this.roundMoney(input.equityBefore),
      equityAfter: this.roundMoney(input.equityAfter),
      positionsBefore: input.positionsBefore ?? [],
      positionsAfter: input.positionsAfter ?? [],
      previousEventHash: previousEvent?.eventHash,
      requestHash: input.requestHash,
      recordedAt: recordedAt.toISOString(),
    };
    const eventHash = this.hashObject(eventSnapshot);

    return paperAccountEventRepository.save(
      paperAccountEventRepository.create({
        paperAccountId: input.paperAccount.id,
        budgetEnvelopeId: input.paperAccount.budgetEnvelopeId,
        eventType: input.eventType,
        sourceId: input.sourceId,
        idempotencyKey: input.idempotencyKey,
        actor: input.actor,
        reason: input.reason,
        sequence,
        currency: input.paperAccount.currency,
        cashBefore: eventSnapshot.cashBefore,
        cashAfter: eventSnapshot.cashAfter,
        equityBefore: eventSnapshot.equityBefore,
        equityAfter: eventSnapshot.equityAfter,
        cashDelta: this.roundMoney(input.cashAfter - input.cashBefore),
        equityDelta: this.roundMoney(input.equityAfter - input.equityBefore),
        previousEventHash: previousEvent?.eventHash,
        requestHash: input.requestHash,
        eventHash,
        eventSnapshot,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
  }

  private async findPaperAccountEventByIdempotencyKey(
    idempotencyKey: string,
    paperAccountEventRepository: Repository<PaperAccountEvent> = this
      .paperAccountEventRepository,
  ): Promise<PaperAccountEvent | null> {
    const events = await paperAccountEventRepository.find({
      order: { createdAt: 'DESC' },
    });

    return (
      events.find((event) => event.idempotencyKey === idempotencyKey) ?? null
    );
  }

  private assertIdempotentEventReplay(
    event: PaperAccountEvent,
    requestHash: string,
  ): void {
    if (event.requestHash !== requestHash) {
      throw new BadRequestException(
        `Idempotency key ${event.idempotencyKey} was already used with a different request`,
      );
    }
  }

  private async appendPaperAccountEventAndUpdateAccount({
    input,
    paperAccountRepository = this.paperAccountRepository,
    paperAccountEventRepository = this.paperAccountEventRepository,
  }: {
    input: Parameters<
      ControlPlaneService['appendPaperAccountEvent']
    >[0]['input'];
    paperAccountRepository?: Repository<PaperAccount>;
    paperAccountEventRepository?: Repository<PaperAccountEvent>;
  }): Promise<PaperAccountEvent> {
    const event = await this.appendPaperAccountEvent({
      input,
      paperAccountEventRepository,
    });
    input.paperAccount.latestEventHash = event.eventHash;
    input.paperAccount.latestEventSequence = event.sequence;
    await paperAccountRepository.save(input.paperAccount);

    return event;
  }

  private async getLatestPaperAccountEvent(
    paperAccountId: number,
    paperAccountEventRepository: Repository<PaperAccountEvent> = this
      .paperAccountEventRepository,
  ): Promise<PaperAccountEvent | null> {
    const events = await paperAccountEventRepository.find({
      order: { createdAt: 'DESC' },
    });

    return (
      events
        .filter((event) => event.paperAccountId === paperAccountId)
        .sort((left, right) => right.sequence - left.sequence)[0] ?? null
    );
  }

  private async findActivePaperAccountForScope(
    budgetEnvelopeId?: number,
  ): Promise<PaperAccount | null> {
    const accounts = await this.paperAccountRepository.find({
      order: { updatedAt: 'DESC' },
    });

    return (
      accounts.find(
        (account) =>
          account.status === 'active' &&
          (budgetEnvelopeId
            ? account.budgetEnvelopeId === budgetEnvelopeId
            : !account.budgetEnvelopeId),
      ) ?? null
    );
  }

  private validateRunRecoveryProposalRequest(
    request: RunRecoveryProposalRequest,
  ): void {
    if (
      request.paperAccountId !== undefined &&
      (!Number.isInteger(request.paperAccountId) || request.paperAccountId <= 0)
    ) {
      throw new BadRequestException(
        'Recovery proposal paperAccountId must be positive',
      );
    }

    if (
      request.budgetEnvelopeId !== undefined &&
      (!Number.isInteger(request.budgetEnvelopeId) ||
        request.budgetEnvelopeId <= 0)
    ) {
      throw new BadRequestException(
        'Recovery proposal budgetEnvelopeId must be positive',
      );
    }

    if (
      request.maxPositions !== undefined &&
      (!Number.isInteger(request.maxPositions) ||
        request.maxPositions < 1 ||
        request.maxPositions > 50)
    ) {
      throw new BadRequestException(
        'Recovery proposal maxPositions must be between 1 and 50',
      );
    }

    this.validateOptionalNonEmptyString(
      request.objective,
      'Recovery proposal objective must be a non-empty string',
    );
  }

  private async findRecoveryPaperAccount(
    request: RunRecoveryProposalRequest,
  ): Promise<PaperAccount> {
    const paperAccount = request.paperAccountId
      ? await this.paperAccountRepository.findOne({
          where: { id: request.paperAccountId },
        })
      : request.budgetEnvelopeId
        ? await this.findActivePaperAccountForScope(request.budgetEnvelopeId)
        : await this.findLatestActivePaperAccount();

    if (!paperAccount) {
      throw new NotFoundException(
        request.paperAccountId
          ? `Paper account ${request.paperAccountId} not found`
          : 'No active paper account found for recovery proposal',
      );
    }

    if (paperAccount.status !== 'active') {
      throw new BadRequestException(
        'Recovery proposal requires an active paper account',
      );
    }

    if (
      request.budgetEnvelopeId &&
      paperAccount.budgetEnvelopeId !== request.budgetEnvelopeId
    ) {
      throw new BadRequestException(
        'Recovery proposal budget does not match the paper account',
      );
    }

    return paperAccount;
  }

  private async findLatestActivePaperAccount(): Promise<PaperAccount | null> {
    const accounts = await this.paperAccountRepository.find({
      order: { updatedAt: 'DESC' },
    });

    return (
      accounts
        .filter((account) => account.status === 'active')
        .sort(
          (left, right) =>
            (right.updatedAt?.getTime() ?? 0) -
            (left.updatedAt?.getTime() ?? 0),
        )[0] ?? null
    );
  }

  private async findRecoveryBudget(
    request: RunRecoveryProposalRequest,
    paperAccount: PaperAccount,
  ): Promise<BudgetEnvelope> {
    const budgetId = request.budgetEnvelopeId ?? paperAccount.budgetEnvelopeId;
    const budget = budgetId
      ? await this.budgetRepository.findOne({
          where: { id: budgetId, status: 'active' },
        })
      : await this.budgetRepository.findOne({
          where: { status: 'active' },
          order: { updatedAt: 'DESC' },
        });

    if (!budget) {
      throw new BadRequestException(
        'Recovery proposal requires an active budget envelope',
      );
    }

    return budget;
  }

  private buildPaperAccountPortfolio(
    paperAccount: PaperAccount,
  ): PortfolioSnapshot {
    return {
      currency: paperAccount.currency,
      cash: paperAccount.cash,
      equity: paperAccount.equity,
      grossExposurePct: paperAccount.grossExposurePct,
      positions: paperAccount.positions,
    };
  }

  private async findPaperOrderPlansForProposal(
    proposalId: number,
    paperOrderPlanRepository: Repository<PaperOrderPlan> = this
      .paperOrderPlanRepository,
  ): Promise<PaperOrderPlan[]> {
    const plans = await paperOrderPlanRepository.find({
      order: { updatedAt: 'DESC' },
    });

    return plans.filter((plan) => plan.proposalId === proposalId);
  }

  private async findPaperOrderPlanByIdempotencyKey(
    proposalId: number,
    idempotencyKey: string,
    paperOrderPlanRepository: Repository<PaperOrderPlan> = this
      .paperOrderPlanRepository,
  ): Promise<PaperOrderPlan | null> {
    const plans = await this.findPaperOrderPlansForProposal(
      proposalId,
      paperOrderPlanRepository,
    );

    return plans.find((plan) => plan.idempotencyKey === idempotencyKey) ?? null;
  }

  private async findOpenPaperReservations(
    paperAccountId?: number,
    repositories: Pick<
      PaperApplyRepositories,
      'paperReservationHoldRepository' | 'paperOrderPlanRepository'
    > = {
      paperReservationHoldRepository: this.paperReservationHoldRepository,
      paperOrderPlanRepository: this.paperOrderPlanRepository,
    },
  ): Promise<PaperOpenReservation[]> {
    if (!paperAccountId) {
      return [];
    }

    const records = await repositories.paperReservationHoldRepository.find({
      order: { updatedAt: 'DESC' },
    });
    const openHoldRecords = records
      .filter(
        (record) =>
          record.paperAccountId === paperAccountId &&
          record.status === 'reserved',
      )
      .map((record) => ({
        holdId: record.holdId,
        cashAmount: this.roundMoney(record.cashAmount),
        sellNotionalBySymbol: this.roundMoneyBySymbol(
          record.sellNotionalBySymbol,
        ),
      }));
    const openHoldIds = new Set(
      openHoldRecords
        .map((reservation) => reservation.holdId)
        .filter((holdId): holdId is string => Boolean(holdId)),
    );
    const plans = await repositories.paperOrderPlanRepository.find({
      order: { updatedAt: 'DESC' },
    });
    const reservingStatuses: PaperOrderPlan['status'][] = [
      'planned',
      'simulating',
      'partially_filled',
    ];

    const legacyPlanReservations = plans
      .filter((plan) => {
        if (plan.paperAccountId !== paperAccountId) {
          return false;
        }

        if (plan.reservationHold?.status === 'reserved') {
          return !openHoldIds.has(plan.reservationHold.holdId);
        }

        return !plan.reservationHold && reservingStatuses.includes(plan.status);
      })
      .map((plan) => {
        if (plan.reservationHold?.status === 'reserved') {
          return {
            cashAmount: this.roundMoney(plan.reservationHold.cashAmount),
            sellNotionalBySymbol: this.roundMoneyBySymbol(
              plan.reservationHold.sellNotionalBySymbol,
            ),
          };
        }

        return {
          holdId: plan.reservationHold?.holdId,
          cashAmount: this.calculatePaperBuyRequirement(
            plan.orders.map((order) => ({
              side: order.side,
              notional: order.requestedNotional,
            })),
          ),
          sellNotionalBySymbol: this.calculatePaperSellRequirements(
            plan.orders.map((order) => ({
              symbol: order.symbol,
              side: order.side,
              notional: order.requestedNotional,
            })),
          ),
        };
      });

    return [...openHoldRecords, ...legacyPlanReservations];
  }

  private riskEvaluationMatchesProposal(
    evaluation: RiskEvaluation,
    proposal: InvestmentProposal,
    portfolio: PortfolioSnapshot = proposal.portfolioSnapshot,
  ): boolean {
    const request = evaluation.requestSnapshot;

    return (
      request.researchRunId === proposal.researchRunId &&
      request.strategyId === proposal.strategyId &&
      request.ruleId === proposal.ruleId &&
      request.generatedAt === proposal.generatedAt.toISOString() &&
      request.marketDataTimestamp ===
        proposal.marketDataTimestamp.toISOString() &&
      this.hashObject(request.portfolio) === this.hashObject(portfolio) &&
      this.hashObject(request.orders) === this.hashObject(proposal.orders)
    );
  }

  private async buildPaperReservationSnapshot(
    proposal: InvestmentProposal,
    portfolio: PortfolioSnapshot,
    paperAccount: PaperAccount | null,
    repositories?: Pick<
      PaperApplyRepositories,
      'paperReservationHoldRepository' | 'paperOrderPlanRepository'
    >,
  ): Promise<PaperReservationSnapshot> {
    const openReservations = await this.findOpenPaperReservations(
      paperAccount?.id,
      repositories,
    );
    const requiredCash = this.calculatePaperBuyRequirement(proposal.orders);
    const reservedCash = this.roundMoney(
      openReservations.reduce(
        (total, reservation) => total + reservation.cashAmount,
        0,
      ),
    );
    const availableBySymbol = this.positionsToMarketValueMap(
      portfolio.positions,
    );
    const requiredSellNotionalBySymbol = this.calculatePaperSellRequirements(
      proposal.orders,
    );
    const reservedSellNotionalBySymbol = openReservations.reduce<
      Record<string, number>
    >((reserved, reservation) => {
      for (const [symbol, notional] of Object.entries(
        reservation.sellNotionalBySymbol,
      )) {
        reserved[symbol] = this.roundMoney((reserved[symbol] ?? 0) + notional);
      }

      return reserved;
    }, {});
    const allSellSymbols = Array.from(
      new Set([
        ...Object.keys(availableBySymbol),
        ...Object.keys(requiredSellNotionalBySymbol),
        ...Object.keys(reservedSellNotionalBySymbol),
      ]),
    );
    const availableSellNotionalBySymbol = Object.fromEntries(
      allSellSymbols.map((symbol) => [
        symbol,
        this.roundMoney(
          Math.max(
            0,
            (availableBySymbol[symbol] ?? 0) -
              (reservedSellNotionalBySymbol[symbol] ?? 0),
          ),
        ),
      ]),
    );

    return {
      requiredCash,
      reservedCash,
      availableCash: this.roundMoney(
        Math.max(0, portfolio.cash - reservedCash),
      ),
      requiredSellNotionalBySymbol,
      reservedSellNotionalBySymbol,
      availableSellNotionalBySymbol,
    };
  }

  private calculatePaperBuyRequirement(
    orders: Array<Pick<ProposedOrder, 'side' | 'notional'>>,
  ): number {
    return this.roundMoney(
      orders
        .filter((order) => order.side === 'BUY')
        .reduce(
          (total, order) =>
            total +
            order.notional +
            this.roundMoney(order.notional * 0.001) +
            this.roundMoney(order.notional * 0.0005),
          0,
        ),
    );
  }

  private calculatePaperSellRequirements(
    orders: Array<Pick<ProposedOrder, 'symbol' | 'side' | 'notional'>>,
  ): Record<string, number> {
    return orders
      .filter((order) => order.side === 'SELL')
      .reduce<Record<string, number>>((required, order) => {
        required[order.symbol] = this.roundMoney(
          (required[order.symbol] ?? 0) + order.notional,
        );

        return required;
      }, {});
  }

  private roundMoneyBySymbol(
    values: Record<string, number>,
  ): Record<string, number> {
    return Object.fromEntries(
      Object.entries(values).map(([symbol, value]) => [
        symbol,
        this.roundMoney(value),
      ]),
    );
  }

  private getPaperExecutionBlockedReasons(input: {
    latestEvaluation: RiskEvaluation | null;
    expectedRiskEvaluationId?: number;
    orderPlanApproval: OrderPlanApproval | null;
    idempotencyKey: string;
    readinessSnapshot: PaperReadinessSnapshot;
    executionControlState: ExecutionControlStateValue;
    proposal: InvestmentProposal;
    paperAccount: PaperAccount | null;
    currentPaperAccountEvent: PaperAccountEvent | null;
    approvalCustodyReasons: string[];
  }): string[] {
    const reasons: string[] = [];
    const {
      latestEvaluation,
      expectedRiskEvaluationId,
      orderPlanApproval,
      idempotencyKey,
      readinessSnapshot,
      executionControlState,
      proposal,
      paperAccount,
      currentPaperAccountEvent,
      approvalCustodyReasons,
    } = input;

    if (!readinessSnapshot.budgetActive) {
      reasons.push('Paper execution requires an active budget envelope');
    }

    if (!latestEvaluation) {
      reasons.push(
        'Paper execution requires a paper-mode ALLOW risk evaluation',
      );
    } else if (latestEvaluation.decision !== 'ALLOW') {
      reasons.push(`Latest risk decision is ${latestEvaluation.decision}`);
    } else if (latestEvaluation.responseSnapshot.mode !== 'paper') {
      reasons.push(
        'Paper execution requires a paper-mode ALLOW risk evaluation',
      );
    }

    if (
      expectedRiskEvaluationId !== undefined &&
      latestEvaluation?.id !== expectedRiskEvaluationId
    ) {
      reasons.push(
        `Expected risk evaluation ${expectedRiskEvaluationId} does not match latest evaluation ${latestEvaluation?.id ?? 'none'}`,
      );
    }

    if (latestEvaluation && !readinessSnapshot.riskMatchesProposal) {
      reasons.push('Latest risk evaluation does not match proposal snapshot');
    }

    if (!readinessSnapshot.explicitPaperAccountActive) {
      reasons.push(
        'Paper execution requires an explicitly promoted paper account',
      );
    }

    if (!orderPlanApproval) {
      reasons.push('Signed order-plan approval is required');
    } else {
      if (orderPlanApproval.status !== 'active') {
        reasons.push(
          `Signed order-plan approval is ${orderPlanApproval.status}`,
        );
      }

      if (
        orderPlanApproval.expiresAt &&
        orderPlanApproval.expiresAt.getTime() <= Date.now()
      ) {
        reasons.push('Signed order-plan approval is expired');
      }

      if (orderPlanApproval.idempotencyKey !== idempotencyKey) {
        reasons.push('Signed order-plan approval idempotency key mismatch');
      }

      if (latestEvaluation?.id !== orderPlanApproval.riskEvaluationId) {
        reasons.push('Signed order-plan approval risk evaluation mismatch');
      }

      reasons.push(...approvalCustodyReasons);

      if (!paperAccount) {
        reasons.push(
          'Signed order-plan approval cannot bind to a paper account',
        );
      } else if (orderPlanApproval.paperAccountId !== paperAccount.id) {
        reasons.push('Signed order-plan approval paper account mismatch');
      }

      if (!currentPaperAccountEvent) {
        reasons.push(
          'Signed order-plan approval requires current account event evidence',
        );
      } else if (
        orderPlanApproval.paperAccountEventHash !==
        currentPaperAccountEvent.eventHash
      ) {
        reasons.push(
          'Signed order-plan approval paper account event hash is stale',
        );
      }
    }

    if (!readinessSnapshot.cashSufficient) {
      reasons.push('Paper execution cash check failed');
    }

    if (!readinessSnapshot.positionsSufficient) {
      reasons.push('Paper execution position check failed');
    }

    if (!readinessSnapshot.noDuplicatePlan) {
      reasons.push('Existing non-blocked paper order plan already exists');
    }

    if (
      executionControlState === 'paused' ||
      executionControlState === 'halted'
    ) {
      reasons.push(`Execution control state is ${executionControlState}`);
    }

    if (
      executionControlState === 'reducing' &&
      proposal.orders.some((order) => order.side !== 'SELL')
    ) {
      reasons.push('Execution control reducing state only permits SELL orders');
    }

    return reasons;
  }

  private getOrderPlanApprovalCustodyBlockedReasons(
    approval: OrderPlanApproval,
  ): string[] {
    const reasons: string[] = [];

    if (!approval.canonicalPayloadHash) {
      reasons.push('Signed order-plan approval lacks custody payload hash');
    }

    if (!approval.signature) {
      reasons.push('Signed order-plan approval lacks custody signature');
    }

    if (!approval.approvalSnapshot) {
      reasons.push('Signed order-plan approval lacks custody snapshot');
      return reasons;
    }

    const snapshot = approval.approvalSnapshot;
    const canonicalPayload = {
      proposalId: snapshot.proposalId,
      riskEvaluationId: snapshot.riskEvaluationId,
      mode: snapshot.mode,
      approvalSource: snapshot.approvalSource,
      approvedByRunId: snapshot.approvedByRunId,
      approvedByScheduleId: snapshot.approvedByScheduleId,
      autoApprovalPolicyRef: snapshot.autoApprovalPolicyRef,
      approver: snapshot.approver,
      reason: snapshot.reason,
      idempotencyKey: snapshot.idempotencyKey,
      approvedOrderCount: snapshot.approvedOrderCount,
      expiresAt: snapshot.expiresAt,
      proposalHash: snapshot.proposalHash,
      riskRequestHash: snapshot.riskRequestHash,
      paperAccountId: snapshot.paperAccountId,
      paperAccountEventHash: snapshot.paperAccountEventHash,
      paperAccountEventSequence: snapshot.paperAccountEventSequence,
      custodyMode: snapshot.custodyMode,
      signerKeyRef: snapshot.signerKeyRef,
    };
    const canonicalPayloadHash = this.hashObject(canonicalPayload);

    if (
      approval.canonicalPayloadHash &&
      approval.canonicalPayloadHash !== canonicalPayloadHash
    ) {
      reasons.push('Signed order-plan approval custody payload hash mismatch');
    }

    const signature = this.hashObject({
      signerKeyRef: approval.signerKeyRef,
      canonicalPayloadHash: approval.canonicalPayloadHash,
    });

    if (approval.signature && approval.signature !== signature) {
      reasons.push('Signed order-plan approval custody signature mismatch');
    }

    if (approval.approvalHash !== this.hashObject(snapshot)) {
      reasons.push('Signed order-plan approval hash mismatch');
    }

    return reasons;
  }

  private simulatePaperFills(
    proposal: InvestmentProposal,
    portfolioBefore: PortfolioSnapshot,
    blockedReasons: string[],
    submittedAt: Date,
  ): {
    orders: PaperOrderSnapshot[];
    fills: PaperFill[];
    portfolioAfter: PortfolioSnapshot;
    cashLedger: PaperCashLedgerEntry[];
    positionLedger: PaperPositionLedgerEntry[];
    endingCash: number;
    endingEquity: number;
    reconciliation: PaperReconciliation;
  } {
    const startingCash = portfolioBefore.cash;
    const startingEquity = portfolioBefore.equity;
    const timestamp = submittedAt.toISOString();
    const orders = this.buildPaperOrderSnapshots(proposal);
    const startingPositions = Object.fromEntries(
      (portfolioBefore.positions ?? []).map((position) => [
        position.symbol,
        position.marketValue,
      ]),
    );

    if (blockedReasons.length > 0) {
      return {
        orders,
        fills: [],
        portfolioAfter: portfolioBefore,
        cashLedger: [],
        positionLedger: [],
        endingCash: startingCash,
        endingEquity: startingEquity,
        reconciliation: {
          status: 'not_required',
          cashMatched: true,
          positionsMatched: true,
          expectedCash: startingCash,
          actualCash: startingCash,
          cashDiff: 0,
          expectedPositions: startingPositions,
          actualPositions: startingPositions,
          positionDiffs: Object.fromEntries(
            Object.keys(startingPositions).map((symbol) => [symbol, 0]),
          ),
          tolerance: 0.01,
          notes: ['No fills were simulated because the plan is blocked.'],
        },
      };
    }

    let endingCash = startingCash;
    let totalExecutionCost = 0;
    const endingPositions: Record<string, number> = { ...startingPositions };
    const positionAccounting =
      this.buildPaperPositionAccounting(portfolioBefore);
    const cashLedger: PaperCashLedgerEntry[] = [];
    const positionLedger: PaperPositionLedgerEntry[] = [];
    const fills = orders.map((order): PaperFill => {
      const fillPrice = order.requestedPrice ?? 1;
      const quantity =
        order.requestedQuantity ??
        this.roundQuantity(order.requestedNotional / fillPrice);
      const fee = this.roundMoney(order.requestedNotional * 0.001);
      const slippage = this.roundMoney(order.requestedNotional * 0.0005);
      const executionCost = this.roundMoney(fee + slippage);
      const previousAccounting = positionAccounting[order.symbol] ?? {
        marketValue: endingPositions[order.symbol] ?? 0,
        quantity: 0,
        averagePrice: fillPrice,
        costBasis: 0,
        realizedPnl: 0,
      };
      const costBasisBefore = previousAccounting.costBasis;
      const averagePriceBefore = previousAccounting.averagePrice;
      const signedCashImpact =
        order.side === 'SELL'
          ? order.requestedNotional - fee - slippage
          : -order.requestedNotional - fee - slippage;
      const positionDelta =
        order.side === 'SELL' ? -quantity : this.roundQuantity(quantity);
      const notionalDelta =
        order.side === 'SELL'
          ? -order.requestedNotional
          : order.requestedNotional;
      const nextAccounting = this.applyPaperPositionAccountingFill(
        previousAccounting,
        order.side,
        quantity,
        order.requestedNotional,
        executionCost,
      );
      endingCash += signedCashImpact;
      totalExecutionCost += executionCost;
      endingPositions[order.symbol] = this.roundMoney(
        (endingPositions[order.symbol] ?? 0) + notionalDelta,
      );
      if (Math.abs(endingPositions[order.symbol]) < 0.01) {
        endingPositions[order.symbol] = 0;
      }
      positionAccounting[order.symbol] = {
        ...nextAccounting,
        marketValue: endingPositions[order.symbol],
      };
      const paperFillId = `${order.paperOrderId}:fill:0`;
      cashLedger.push({
        paperCashEventId: `${paperFillId}:cash`,
        paperFillId,
        timestamp,
        currency: portfolioBefore.currency,
        amount: this.roundMoney(signedCashImpact),
        balanceAfter: this.roundMoney(endingCash),
        reason: `${order.side} paper fill net cash delta`,
      });
      positionLedger.push({
        paperPositionEventId: `${paperFillId}:position`,
        paperFillId,
        timestamp,
        symbol: order.symbol,
        quantityDelta: positionDelta,
        notionalDelta: this.roundMoney(notionalDelta),
        quantityAfter: nextAccounting.quantity,
        positionNotionalAfter: endingPositions[order.symbol],
        averagePriceAfter: nextAccounting.averagePrice,
        costBasisAfter: nextAccounting.costBasis,
        realizedPnl: this.roundMoney(
          nextAccounting.realizedPnl - previousAccounting.realizedPnl,
        ),
      });

      return {
        paperFillId,
        paperOrderId: order.paperOrderId,
        timestamp,
        symbol: order.symbol,
        side: order.side,
        quantity,
        fillPrice,
        grossNotional: order.requestedNotional,
        requestedNotional: order.requestedNotional,
        filledNotional: order.requestedNotional,
        fee,
        feeCurrency: portfolioBefore.currency,
        slippage,
        netCashDelta: this.roundMoney(signedCashImpact),
        positionDelta,
        averagePriceBefore,
        costBasisBefore,
        costBasisAfter: nextAccounting.costBasis,
        realizedPnl: this.roundMoney(
          nextAccounting.realizedPnl - previousAccounting.realizedPnl,
        ),
        realizedPnlAfter: nextAccounting.realizedPnl,
        status: 'filled',
      };
    });

    const endingEquity = this.roundMoney(startingEquity - totalExecutionCost);
    const positionsAfter = this.buildPortfolioPositionsAfter(
      proposal,
      portfolioBefore,
      endingPositions,
      positionAccounting,
    );
    const portfolioAfter = {
      ...proposal.portfolioSnapshot,
      ...portfolioBefore,
      cash: this.roundMoney(endingCash),
      equity: endingEquity,
      positions: positionsAfter,
      grossExposurePct: this.calculateGrossExposurePct(
        positionsAfter,
        endingEquity,
      ),
    };

    return {
      orders,
      fills,
      portfolioAfter,
      cashLedger,
      positionLedger,
      endingCash: this.roundMoney(endingCash),
      endingEquity,
      reconciliation: {
        status: 'pending',
        cashMatched: false,
        positionsMatched: false,
        expectedCash: this.roundMoney(endingCash),
        expectedPositions: endingPositions,
        tolerance: 0.01,
        notes: [
          'Paper fills are deterministic simulations only.',
          'No broker credentials, account ids, or live order endpoints were used.',
          'Explicit paper reconciliation is still required before promotion.',
        ],
      },
    };
  }

  private buildPaperOrderSnapshots(
    proposal: InvestmentProposal,
  ): PaperOrderSnapshot[] {
    return proposal.orders.map((order, index) => ({
      paperOrderId: `paper-order:${proposal.id}:${index}`,
      proposalOrderIndex: index,
      symbol: order.symbol,
      side: order.side,
      orderType: order.orderType,
      requestedNotional: order.notional,
      requestedQuantity: order.quantity,
      requestedPrice: order.price,
      targetPositionPct: order.targetPositionPct,
      marketDataTimestamp: proposal.marketDataTimestamp.toISOString(),
      feeModelRef: 'fixed-10bps-paper-fee-v1',
      slippageModelRef: 'fixed-5bps-paper-slippage-v1',
      sourceOrder: order,
    }));
  }

  private buildPortfolioPositionsAfter(
    proposal: InvestmentProposal,
    portfolioBefore: PortfolioSnapshot,
    endingPositions: Record<string, number>,
    positionAccounting: Record<string, PaperPositionAccountingState>,
  ) {
    const originalPositions = portfolioBefore.positions ?? [];
    const originalBySymbol = new Map(
      originalPositions.map((position) => [position.symbol, position]),
    );

    return Object.entries(endingPositions)
      .filter(([, marketValue]) => Math.abs(marketValue) > 0)
      .map(([symbol, marketValue]) => {
        const original = originalBySymbol.get(symbol);

        return {
          symbol,
          assetClass:
            original?.assetClass ??
            proposal.orders.find((order) => order.symbol === symbol)
              ?.assetClass ??
            'unknown',
          marketValue,
          weightPct:
            portfolioBefore.equity === 0
              ? 0
              : this.roundMoney((marketValue / portfolioBefore.equity) * 100),
          quantity: positionAccounting[symbol]?.quantity,
          averagePrice: positionAccounting[symbol]?.averagePrice,
          costBasis: positionAccounting[symbol]?.costBasis,
          unrealizedPnl: this.roundMoney(
            marketValue - (positionAccounting[symbol]?.costBasis ?? 0),
          ),
          realizedPnl: positionAccounting[symbol]?.realizedPnl,
        };
      });
  }

  private buildPaperPositionAccounting(
    portfolio: PortfolioSnapshot,
  ): Record<string, PaperPositionAccountingState> {
    return Object.fromEntries(
      (portfolio.positions ?? []).map((position) => {
        const quantity =
          position.quantity && position.quantity > 0
            ? position.quantity
            : this.roundQuantity(position.marketValue);
        const costBasis = this.roundMoney(
          position.costBasis ?? position.marketValue,
        );
        const averagePrice =
          position.averagePrice ??
          (quantity === 0 ? 0 : this.roundMoney(costBasis / quantity));

        return [
          position.symbol,
          {
            marketValue: this.roundMoney(position.marketValue),
            quantity,
            averagePrice,
            costBasis,
            realizedPnl: this.roundMoney(position.realizedPnl ?? 0),
          },
        ];
      }),
    );
  }

  private applyPaperPositionAccountingFill(
    current: PaperPositionAccountingState,
    side: ProposedOrder['side'],
    quantity: number,
    notional: number,
    executionCost: number,
  ): PaperPositionAccountingState {
    if (side === 'SELL') {
      const quantitySold = this.roundQuantity(
        Math.min(quantity, current.quantity),
      );
      const costBasisReduction =
        current.quantity === 0
          ? 0
          : this.roundMoney(
              current.costBasis * (quantitySold / current.quantity),
            );
      const nextQuantity = this.roundQuantity(current.quantity - quantitySold);
      const nextCostBasis = this.roundMoney(
        Math.max(0, current.costBasis - costBasisReduction),
      );
      const realizedPnl = this.roundMoney(
        current.realizedPnl + notional - executionCost - costBasisReduction,
      );

      return {
        marketValue: this.roundMoney(
          Math.max(0, current.marketValue - notional),
        ),
        quantity: nextQuantity,
        averagePrice:
          nextQuantity === 0
            ? 0
            : this.roundMoney(nextCostBasis / nextQuantity),
        costBasis: nextCostBasis,
        realizedPnl,
      };
    }

    const nextQuantity = this.roundQuantity(current.quantity + quantity);
    const nextCostBasis = this.roundMoney(
      current.costBasis + notional + executionCost,
    );

    return {
      marketValue: this.roundMoney(current.marketValue + notional),
      quantity: nextQuantity,
      averagePrice:
        nextQuantity === 0 ? 0 : this.roundMoney(nextCostBasis / nextQuantity),
      costBasis: nextCostBasis,
      realizedPnl: current.realizedPnl,
    };
  }

  private positionsToMarketValueMap(
    positions: PortfolioSnapshot['positions'] = [],
  ): Record<string, number> {
    return Object.fromEntries(
      positions.map((position) => [position.symbol, position.marketValue]),
    );
  }

  private assertReadOnlyBrokerSnapshotRequest(
    request: ImportBrokerSnapshotRequest,
  ): void {
    const disallowedKeys = [
      'brokerCredentials',
      'accessToken',
      'refreshToken',
      'secret',
      'clientSecret',
      'apiKey',
      'accountId',
      'orders',
      'order',
      'clientOrderId',
      'placeOrder',
      'cancelOrder',
    ];
    const presentDisallowedKey = disallowedKeys.find(
      (key) =>
        (request as unknown as Record<string, unknown>)[key] !== undefined,
    );

    if (presentDisallowedKey) {
      throw new BadRequestException(
        `Broker read-only snapshots cannot include ${presentDisallowedKey}`,
      );
    }
  }

  private assertFundingReadinessRequest(
    request: AssessFundingReadinessRequest,
  ): void {
    const disallowedKeys = [
      'brokerCredentials',
      'accessToken',
      'refreshToken',
      'secret',
      'clientSecret',
      'apiKey',
      'accountRef',
      'accountId',
      'orders',
      'order',
      'orderPayload',
      'clientOrderId',
      'placeOrder',
      'cancelOrder',
      'modifyOrder',
    ];
    const presentDisallowedKey = disallowedKeys.find(
      (key) =>
        (request as unknown as Record<string, unknown>)[key] !== undefined,
    );

    if (presentDisallowedKey) {
      throw new BadRequestException(
        `Funding readiness cannot include ${presentDisallowedKey}`,
      );
    }

    if (request.expectedDepositAmount <= 0) {
      throw new BadRequestException(
        'Funding readiness expectedDepositAmount must be positive',
      );
    }

    if (request.tolerance !== undefined && request.tolerance < 0) {
      throw new BadRequestException(
        'Funding readiness tolerance cannot be negative',
      );
    }

    if (request.maxAgeMinutes !== undefined && request.maxAgeMinutes <= 0) {
      throw new BadRequestException(
        'Funding readiness maxAgeMinutes must be positive',
      );
    }
  }

  private assertLivePilotReadinessRequest(
    request: AssessLivePilotReadinessRequest,
  ): void {
    const disallowedKeys = [
      'brokerCredentials',
      'accessToken',
      'refreshToken',
      'secret',
      'clientSecret',
      'apiKey',
      'accountRef',
      'accountId',
      'orders',
      'order',
      'orderPayload',
      'clientOrderId',
      'placeOrder',
      'cancelOrder',
      'modifyOrder',
      'flattenPositions',
    ];
    const presentDisallowedKey = disallowedKeys.find(
      (key) =>
        (request as unknown as Record<string, unknown>)[key] !== undefined,
    );

    if (presentDisallowedKey) {
      throw new BadRequestException(
        `Broker-write pre-trade risk check cannot include ${presentDisallowedKey}`,
      );
    }

    if (
      typeof request.pilotBudgetAmount !== 'number' ||
      !Number.isFinite(request.pilotBudgetAmount) ||
      request.pilotBudgetAmount <= 0
    ) {
      throw new BadRequestException(
        'Broker-write pre-trade risk check pilotBudgetAmount must be positive',
      );
    }

    if (
      request.maxPilotBudgetAmount !== undefined &&
      (typeof request.maxPilotBudgetAmount !== 'number' ||
        !Number.isFinite(request.maxPilotBudgetAmount) ||
        request.maxPilotBudgetAmount <= 0)
    ) {
      throw new BadRequestException(
        'Broker-write pre-trade risk check maxPilotBudgetAmount must be positive',
      );
    }

    if (
      request.maxSingleOrderNotional !== undefined &&
      (typeof request.maxSingleOrderNotional !== 'number' ||
        !Number.isFinite(request.maxSingleOrderNotional) ||
        request.maxSingleOrderNotional <= 0)
    ) {
      throw new BadRequestException(
        'Broker-write pre-trade risk check maxSingleOrderNotional must be positive',
      );
    }
  }

  private async resolveLivePilotReadiness(
    livePilotReadinessId: number | undefined,
  ): Promise<LivePilotReadinessRecord | null> {
    const livePilotReadiness = livePilotReadinessId
      ? await this.livePilotReadinessRepository.findOne({
          where: { id: livePilotReadinessId },
        })
      : await this.livePilotReadinessRepository.findOne({
          where: {},
          order: { checkedAt: 'DESC', updatedAt: 'DESC' },
        });

    if (livePilotReadinessId && !livePilotReadiness) {
      throw new NotFoundException(
        `Broker-write pre-trade risk check ${livePilotReadinessId} not found`,
      );
    }

    return livePilotReadiness;
  }

  private saveBrokerOrderCommand(input: {
    idempotencyKey?: string;
    commandType: BrokerOrderCommandType;
    sourceType: 'paper_order_plan' | 'emergency';
    proposalId?: number;
    paperOrderPlanId?: number;
    orderPlanApprovalId?: number;
    livePilotReadiness: LivePilotReadinessRecord | null;
    checkedAt: Date;
    brokerAdapterStatus: BrokerAdapterStatus;
    signedPaperApprovalReady: boolean;
    hasOrderSource: boolean;
    orderIntents: BrokerOrderIntent[];
    emergencyActions: BrokerEmergencyAction[];
    notes: string[];
  }): Promise<BrokerOrderCommand> {
    const blockedReasons = this.buildBrokerOrderCommandBlockers({
      commandType: input.commandType,
      livePilotReadiness: input.livePilotReadiness,
      brokerAdapterStatus: input.brokerAdapterStatus,
      signedPaperApprovalReady: input.signedPaperApprovalReady,
      hasOrderSource: input.hasOrderSource,
    });
    const readinessSnapshot = {
      livePilotReadinessId: input.livePilotReadiness?.id,
      livePilotReady: input.livePilotReadiness?.status === 'ready',
      brokerSchemaVerified: input.brokerAdapterStatus.schemaVerified,
      brokerSandboxVerified: input.brokerAdapterStatus.sandboxVerified,
      brokerReadOnlyReady:
        input.brokerAdapterStatus.readOnlyEnabled &&
        input.brokerAdapterStatus.readOnlyPoll.canPoll,
      brokerFillPollingReady:
        input.brokerAdapterStatus.readOnlyPoll.canPollFills === true,
      brokerCancelReady:
        input.brokerAdapterStatus.emergencyControls.brokerCancelReady,
      brokerFlattenReady:
        input.brokerAdapterStatus.emergencyControls.brokerFlattenReady,
      openOrderPollingReady:
        input.brokerAdapterStatus.emergencyControls.openOrderPollingReady,
      signedPaperApprovalReady: input.signedPaperApprovalReady,
      orderEndpointImplemented: false as const,
      brokerWriteEnabled: false as const,
      dryRunOnly: true as const,
      brokerExecutionEnabled: false as const,
      liveTradingEnabled: false as const,
      blockers: blockedReasons,
    };
    const commandHash = this.hashObject({
      commandType: input.commandType,
      sourceType: input.sourceType,
      proposalId: input.proposalId,
      paperOrderPlanId: input.paperOrderPlanId,
      orderPlanApprovalId: input.orderPlanApprovalId,
      livePilotReadinessId: input.livePilotReadiness?.id,
      orderIntents: input.orderIntents,
      emergencyActions: input.emergencyActions,
      readinessSnapshot,
    });

    return this.brokerOrderCommandRepository.save(
      this.brokerOrderCommandRepository.create({
        idempotencyKey: input.idempotencyKey,
        provider: input.brokerAdapterStatus.provider,
        commandType: input.commandType,
        status: blockedReasons.length === 0 ? 'dry_run_planned' : 'blocked',
        mode: 'dry_run',
        sourceType: input.sourceType,
        proposalId: input.proposalId,
        paperOrderPlanId: input.paperOrderPlanId,
        orderPlanApprovalId: input.orderPlanApprovalId,
        livePilotReadinessId: input.livePilotReadiness?.id,
        checkedAt: input.checkedAt,
        commandHash,
        readinessSnapshot,
        orderIntents: input.orderIntents,
        emergencyActions: input.emergencyActions,
        blockedReasons,
        notes: input.notes,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
  }

  private buildBrokerOrderCommandBlockers(input: {
    commandType: BrokerOrderCommandType;
    livePilotReadiness: LivePilotReadinessRecord | null;
    brokerAdapterStatus: BrokerAdapterStatus;
    signedPaperApprovalReady: boolean;
    hasOrderSource: boolean;
  }): string[] {
    const isEmergencyCommand =
      input.commandType === 'cancel_open_orders' ||
      input.commandType === 'flatten_positions';

    return [
      input.livePilotReadiness?.status === 'ready'
        ? undefined
        : 'No ready broker-write pre-trade risk check record',
      input.brokerAdapterStatus.schemaVerified
        ? undefined
        : 'Broker OpenAPI schema is not verified',
      input.brokerAdapterStatus.sandboxVerified
        ? undefined
        : 'Broker sandbox or paper environment is not verified',
      input.brokerAdapterStatus.readOnlyPoll.canPoll
        ? undefined
        : 'Broker read-only polling is not ready',
      input.brokerAdapterStatus.readOnlyPoll.canPollFills === true
        ? undefined
        : 'Broker fill polling is not ready',
      input.hasOrderSource
        ? undefined
        : 'No durable order source was selected for broker command',
      !isEmergencyCommand && input.signedPaperApprovalReady
        ? undefined
        : !isEmergencyCommand
          ? 'No signed paper order-plan approval is bound to this command'
          : undefined,
      isEmergencyCommand &&
      input.commandType === 'cancel_open_orders' &&
      !input.brokerAdapterStatus.emergencyControls.brokerCancelReady
        ? 'Broker cancel/replace endpoint is not implemented'
        : undefined,
      isEmergencyCommand &&
      input.commandType === 'flatten_positions' &&
      !input.brokerAdapterStatus.emergencyControls.brokerFlattenReady
        ? 'Broker flatten-position order path is not implemented'
        : undefined,
      isEmergencyCommand &&
      !input.brokerAdapterStatus.emergencyControls.openOrderPollingReady
        ? 'Broker emergency open-order custody is not implemented'
        : undefined,
      'Live broker order endpoint is not implemented',
      'Broker write access is disabled',
      'Broker order command is dry-run only',
    ].filter((blocker): blocker is string => Boolean(blocker));
  }

  private assertBrokerOrderCommandRequest(
    request: PrepareBrokerOrderCommandRequest,
  ): void {
    const disallowedKeys = [
      'brokerCredentials',
      'accessToken',
      'refreshToken',
      'secret',
      'clientSecret',
      'apiKey',
      'accountRef',
      'accountId',
      'brokerOrderRef',
      'orders',
      'order',
      'orderPayload',
      'clientOrderId',
      'placeOrder',
      'cancelOrder',
      'modifyOrder',
      'flattenPositions',
    ];
    const presentDisallowedKey = disallowedKeys.find(
      (key) =>
        (request as unknown as Record<string, unknown>)[key] !== undefined,
    );

    if (presentDisallowedKey) {
      throw new BadRequestException(
        `Broker order command cannot include ${presentDisallowedKey}`,
      );
    }
  }

  private assertBrokerEmergencyCommandRequest(
    request: RunBrokerEmergencyCommandRequest,
  ): void {
    this.assertBrokerOrderCommandRequest(request);

    if (
      request.commandType !== 'cancel_open_orders' &&
      request.commandType !== 'flatten_positions'
    ) {
      throw new BadRequestException(
        'Broker emergency commandType must be cancel_open_orders or flatten_positions',
      );
    }

    if (!request.reason?.trim()) {
      throw new BadRequestException('Broker emergency command reason required');
    }
  }

  private assertReadOnlyBrokerEvidenceRequest(
    request: object,
    label: string,
  ): void {
    const disallowedKeys = [
      'brokerCredentials',
      'accessToken',
      'refreshToken',
      'secret',
      'clientSecret',
      'apiKey',
      'accountRef',
      'accountId',
      'brokerOrderRef',
      'orders',
      'order',
      'orderPayload',
      'clientOrderId',
      'placeOrder',
      'cancelOrder',
      'modifyOrder',
      'flattenPositions',
    ];
    const record = request as Record<string, unknown>;
    const presentDisallowedKey = disallowedKeys.find(
      (key) => record[key] !== undefined,
    );

    if (presentDisallowedKey) {
      throw new BadRequestException(
        `${label} cannot include ${presentDisallowedKey}`,
      );
    }
  }

  private async buildBrokerOrderStatusReconciliation(
    request: ImportBrokerOrderStatusRequest,
  ): Promise<BrokerOrderStatusReconciliation> {
    const brokerOrderCommand =
      await this.resolveBrokerOrderCommandForStatus(request);
    const checkedAt = new Date().toISOString();

    if (!brokerOrderCommand) {
      return {
        status: 'unlinked',
        checkedAt,
        paperOrderPlanId: request.paperOrderPlanId,
        brokerOrderIntentId: request.brokerOrderIntentId,
        symbolMatched: false,
        sideMatched: false,
        orderTypeMatched: false,
        notionalWithinPlan: false,
        quantityWithinPlan: false,
        commandDryRunOnly: true,
        brokerExternalStatus: request.externalStatus,
        notes: [
          'No broker order command matched this read-only broker order status.',
        ],
      };
    }

    const intent = this.resolveBrokerOrderIntentForStatus(
      brokerOrderCommand,
      request,
    );

    if (!intent) {
      return {
        status: 'mismatch',
        checkedAt,
        brokerOrderCommandId: brokerOrderCommand.id,
        paperOrderPlanId:
          request.paperOrderPlanId ?? brokerOrderCommand.paperOrderPlanId,
        brokerOrderIntentId: request.brokerOrderIntentId,
        symbolMatched: false,
        sideMatched: false,
        orderTypeMatched: false,
        notionalWithinPlan: false,
        quantityWithinPlan: false,
        commandDryRunOnly: true,
        brokerExternalStatus: request.externalStatus,
        notes: [
          'Broker order status linked to a command, but no command intent matched the imported order status.',
          'The linked command is dry-run only, so any external broker order remains a mismatch until real broker write custody exists.',
        ],
      };
    }

    const symbolMatched = intent.symbol === request.symbol;
    const sideMatched = intent.side === request.side;
    const orderTypeMatched = intent.orderType === request.orderType;
    const expectedNotional = intent.requestedNotional;
    const expectedQuantity = intent.requestedQuantity;
    const requestedNotional = request.requestedNotional ?? expectedNotional;
    const requestedQuantity = request.requestedQuantity ?? expectedQuantity;
    const notionalDiff =
      request.requestedNotional !== undefined
        ? request.requestedNotional - expectedNotional
        : undefined;
    const quantityDiff =
      request.requestedQuantity !== undefined && expectedQuantity !== undefined
        ? request.requestedQuantity - expectedQuantity
        : undefined;
    const notionalWithinPlan =
      request.requestedNotional === undefined ||
      request.requestedNotional <= expectedNotional + 0.01;
    const quantityWithinPlan =
      expectedQuantity === undefined ||
      request.requestedQuantity === undefined ||
      request.requestedQuantity <= expectedQuantity + 0.000001;
    const shapeMatched =
      symbolMatched &&
      sideMatched &&
      orderTypeMatched &&
      notionalWithinPlan &&
      quantityWithinPlan;
    const commandDryRunOnly = brokerOrderCommand.mode === 'dry_run';

    return {
      status: shapeMatched && !commandDryRunOnly ? 'matched' : 'mismatch',
      checkedAt,
      brokerOrderCommandId: brokerOrderCommand.id,
      brokerOrderIntentId: intent.brokerOrderIntentId,
      paperOrderPlanId:
        request.paperOrderPlanId ?? brokerOrderCommand.paperOrderPlanId,
      sourcePaperOrderId: intent.sourcePaperOrderId,
      symbolMatched,
      sideMatched,
      orderTypeMatched,
      notionalWithinPlan,
      quantityWithinPlan,
      commandDryRunOnly,
      brokerExternalStatus: request.externalStatus,
      expectedSymbol: intent.symbol,
      expectedSide: intent.side,
      expectedOrderType: intent.orderType,
      expectedNotional,
      expectedQuantity,
      notionalDiff,
      quantityDiff,
      notes: [
        shapeMatched
          ? 'Broker order status shape matches the dry-run command intent.'
          : 'Broker order status does not match the dry-run command intent.',
        commandDryRunOnly
          ? 'The linked broker order command is dry-run only; no external broker order should have been created by this system.'
          : 'The linked broker order command is eligible for broker lifecycle matching.',
        `Imported requested notional: ${requestedNotional}`,
        `Imported requested quantity: ${requestedQuantity ?? 'not provided'}`,
      ],
    };
  }

  private async resolveBrokerOrderCommandForStatus(
    request: ImportBrokerOrderStatusRequest,
  ): Promise<BrokerOrderCommand | null> {
    if (request.brokerOrderCommandId) {
      const command = await this.brokerOrderCommandRepository.findOne({
        where: { id: request.brokerOrderCommandId },
      });

      if (!command) {
        throw new NotFoundException(
          `Broker order command ${request.brokerOrderCommandId} not found`,
        );
      }

      return command;
    }

    if (request.paperOrderPlanId) {
      return this.brokerOrderCommandRepository.findOne({
        where: { paperOrderPlanId: request.paperOrderPlanId },
        order: { checkedAt: 'DESC', updatedAt: 'DESC' },
      });
    }

    return null;
  }

  private resolveBrokerOrderIntentForStatus(
    command: BrokerOrderCommand,
    request: ImportBrokerOrderStatusRequest,
  ): BrokerOrderIntent | undefined {
    if (request.brokerOrderIntentId) {
      return command.orderIntents.find(
        (intent) => intent.brokerOrderIntentId === request.brokerOrderIntentId,
      );
    }

    return command.orderIntents.find(
      (intent) =>
        intent.symbol === request.symbol &&
        intent.side === request.side &&
        intent.orderType === request.orderType,
    );
  }

  private assertBrokerOrderStatusRequest(
    request: ImportBrokerOrderStatusRequest,
  ): void {
    this.assertReadOnlyBrokerEvidenceRequest(request, 'Broker order status');

    const allowedStatuses: BrokerOrderExternalStatus[] = [
      'submitted',
      'accepted',
      'open',
      'partially_filled',
      'filled',
      'pending_cancel',
      'cancelled',
      'rejected',
      'expired',
      'unknown',
    ];

    if (!allowedStatuses.includes(request.externalStatus)) {
      throw new BadRequestException(
        'Broker order status externalStatus is not supported',
      );
    }

    if (!request.brokerOrderRefHash?.startsWith('sha256:')) {
      throw new BadRequestException(
        'Broker order status requires brokerOrderRefHash as a sha256 hash',
      );
    }

    if (
      request.accountRefHash &&
      !request.accountRefHash.startsWith('sha256:')
    ) {
      throw new BadRequestException(
        'Broker order status accountRefHash must be a sha256 hash',
      );
    }

    if (!request.symbol?.trim()) {
      throw new BadRequestException('Broker order status symbol required');
    }

    if (request.side !== 'BUY' && request.side !== 'SELL') {
      throw new BadRequestException('Broker order status side invalid');
    }

    if (request.orderType !== 'MARKET' && request.orderType !== 'LIMIT') {
      throw new BadRequestException('Broker order status orderType invalid');
    }

    [
      request.requestedQuantity,
      request.filledQuantity,
      request.remainingQuantity,
      request.requestedNotional,
      request.averageFillPrice,
      request.limitPrice,
    ].forEach((value) => {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
        throw new BadRequestException(
          'Broker order status numeric fields must be non-negative finite numbers',
        );
      }
    });
  }

  private assertReadOnlyBrokerFillRequest(
    request: ImportBrokerFillRequest,
  ): void {
    const disallowedKeys = [
      'brokerCredentials',
      'accessToken',
      'refreshToken',
      'secret',
      'clientSecret',
      'apiKey',
      'accountId',
      'order',
      'orders',
      'orderPayload',
      'clientOrderId',
      'placeOrder',
      'cancelOrder',
      'modifyOrder',
    ];
    const presentDisallowedKey = disallowedKeys.find(
      (key) =>
        (request as unknown as Record<string, unknown>)[key] !== undefined,
    );

    if (presentDisallowedKey) {
      throw new BadRequestException(
        `Broker read-only fills cannot include ${presentDisallowedKey}`,
      );
    }
  }

  private calculateGrossExposurePct(
    positions: PortfolioSnapshot['positions'] = [],
    equity: number,
  ): number {
    if (equity === 0) {
      return 0;
    }

    const grossExposure = positions.reduce(
      (total, position) => total + Math.abs(position.marketValue),
      0,
    );

    return this.roundMoney((grossExposure / equity) * 100);
  }

  private roundMoney(value: number): number {
    return Number(value.toFixed(2));
  }

  private roundQuantity(value: number): number {
    return Number(value.toFixed(8));
  }

  hashObject(value: unknown): string {
    return `sha256:${createHash('sha256')
      .update(this.stableStringify(value))
      .digest('hex')}`;
  }

  private hashProposal(proposal: InvestmentProposal): string {
    return this.hashObject({
      proposalId: proposal.id,
      budgetEnvelopeId: proposal.budgetEnvelopeId,
      researchRunId: proposal.researchRunId,
      strategyId: proposal.strategyId,
      ruleId: proposal.ruleId,
      generatedAt: proposal.generatedAt,
      marketDataTimestamp: proposal.marketDataTimestamp,
      portfolioSnapshot: proposal.portfolioSnapshot,
      orders: proposal.orders,
      evidenceRefs: proposal.evidenceRefs,
    });
  }

  private stableStringify(value: unknown): string {
    if (value instanceof Date) {
      return JSON.stringify(value.toISOString());
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

      return `{${entries
        .map(
          ([key, entryValue]) =>
            `${JSON.stringify(key)}:${this.stableStringify(entryValue)}`,
        )
        .join(',')}}`;
    }

    return JSON.stringify(value);
  }

  async listResearchRuns(): Promise<ResearchRun[]> {
    return this.researchRunRepository.find({ order: { updatedAt: 'DESC' } });
  }

  async importMarketDataBars(
    request: ImportMarketDataBarsRequest,
  ): Promise<MarketDataBarsImportResponse> {
    this.validateMarketDataImportRequest(request);

    const datasetId = request.datasetId.trim();
    const symbol = request.symbol.trim().toUpperCase();
    const provider = request.provider ?? 'manual';
    const timeframe = request.timeframe ?? '1d';
    const currency = request.currency ?? 'KRW';
    const sortedBars = [...request.bars].sort(
      (left, right) =>
        new Date(left.timestamp).getTime() -
        new Date(right.timestamp).getTime(),
    );
    const existing = await this.marketDataBarRepository.find({
      where: { datasetId, symbol, timeframe },
    });
    const existingByTimestamp = new Map(
      existing.map((bar) => [bar.timestamp, bar]),
    );
    let replaced = 0;
    const savedBars: MarketDataBar[] = [];

    for (const bar of sortedBars) {
      const timestamp = new Date(bar.timestamp).toISOString();
      const existingBar = existingByTimestamp.get(timestamp);
      const entity = this.marketDataBarRepository.create({
        ...(existingBar ?? {}),
        datasetId,
        provider,
        sourceRef: request.sourceRef,
        symbol,
        timeframe,
        timestamp,
        availabilityTimestamp: bar.availabilityTimestamp
          ? new Date(bar.availabilityTimestamp).toISOString()
          : timestamp,
        currency,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        adjustedClose: bar.adjustedClose,
        volume: bar.volume,
        notes: bar.notes ?? [],
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      });

      if (existingBar) {
        replaced += 1;
      }

      savedBars.push(await this.marketDataBarRepository.save(entity));
    }

    return {
      datasetId,
      symbol,
      provider,
      imported: savedBars.length,
      replaced,
      bars: savedBars,
      brokerExecutionEnabled: false,
      liveTradingEnabled: false,
    };
  }

  async listMarketDataBars(
    datasetId?: string,
    symbol?: string,
  ): Promise<MarketDataBar[]> {
    const where: FindOptionsWhere<MarketDataBar> = {};

    if (datasetId) {
      where.datasetId = datasetId.trim();
    }

    if (symbol) {
      where.symbol = symbol.trim().toUpperCase();
    }

    return this.marketDataBarRepository.find({
      where,
      order: { timestamp: 'ASC' },
    });
  }

  async runBaselineResearch(
    request: RunBaselineResearchRequest,
  ): Promise<ResearchRun> {
    const budget = request.budgetEnvelopeId
      ? await this.budgetRepository.findOne({
          where: { id: request.budgetEnvelopeId },
        })
      : await this.budgetRepository.findOne({
          where: { status: 'active' },
          order: { updatedAt: 'DESC' },
        });

    if (request.budgetEnvelopeId && !budget) {
      throw new NotFoundException(
        `Budget ${request.budgetEnvelopeId} not found`,
      );
    }

    if (!budget && !request.initialCapital) {
      throw new BadRequestException(
        'Baseline research requires a budget envelope or initialCapital',
      );
    }

    const marketDataset = request.datasetId
      ? await this.buildBaselineMarketDataset(request)
      : null;
    const researchRunRequest = buildBaselineResearchRunRequest(
      {
        ...request,
        budgetEnvelopeId: request.budgetEnvelopeId ?? budget?.id,
      },
      budget,
      marketDataset,
    );

    return this.createResearchRun(researchRunRequest);
  }

  private validateMarketDataImportRequest(
    request: ImportMarketDataBarsRequest,
  ): void {
    const reasons: string[] = [];

    if (!request.datasetId?.trim()) {
      reasons.push('Market data import requires datasetId');
    }

    if (!request.symbol?.trim()) {
      reasons.push('Market data import requires symbol');
    }

    if (!request.bars?.length) {
      reasons.push('Market data import requires at least one bar');
    }

    const seenTimestamps = new Set<string>();
    const now = new Date();

    for (const [index, bar] of (request.bars ?? []).entries()) {
      const prefix = `Market data bar ${index}`;
      const timestamp = this.parseRequiredDate(bar.timestamp);
      const availabilityTimestamp = bar.availabilityTimestamp
        ? this.parseRequiredDate(bar.availabilityTimestamp)
        : timestamp;

      if (!timestamp) {
        reasons.push(`${prefix} has an invalid timestamp`);
      }

      if (!availabilityTimestamp) {
        reasons.push(`${prefix} has an invalid availability timestamp`);
      }

      if (
        availabilityTimestamp &&
        availabilityTimestamp.getTime() > now.getTime()
      ) {
        reasons.push(
          `${prefix} availability timestamp cannot be in the future`,
        );
      }

      if (timestamp && seenTimestamps.has(timestamp.toISOString())) {
        reasons.push(`${prefix} duplicates timestamp ${bar.timestamp}`);
      }

      if (timestamp) {
        seenTimestamps.add(timestamp.toISOString());
      }

      for (const [field, value] of Object.entries({
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })) {
        if (!Number.isFinite(value) || value <= 0) {
          reasons.push(`${prefix} ${field} must be positive`);
        }
      }

      if (
        Number.isFinite(bar.high) &&
        Number.isFinite(bar.low) &&
        bar.high < bar.low
      ) {
        reasons.push(`${prefix} high cannot be below low`);
      }

      if (
        bar.adjustedClose !== undefined &&
        (!Number.isFinite(bar.adjustedClose) || bar.adjustedClose <= 0)
      ) {
        reasons.push(`${prefix} adjustedClose must be positive`);
      }

      if (
        bar.volume !== undefined &&
        (!Number.isFinite(bar.volume) || bar.volume < 0)
      ) {
        reasons.push(`${prefix} volume cannot be negative`);
      }
    }

    if (reasons.length > 0) {
      throw new BadRequestException(reasons.join('; '));
    }
  }

  private async buildBaselineMarketDataset(
    request: RunBaselineResearchRequest,
  ): Promise<BaselineMarketDataset> {
    const datasetId = request.datasetId?.trim();
    const symbol = request.symbol?.trim().toUpperCase();
    const benchmark = request.benchmark?.trim().toUpperCase();

    if (!datasetId || !symbol || !benchmark) {
      throw new BadRequestException(
        'Dataset-backed baseline requires datasetId, symbol, and benchmark',
      );
    }

    const bars = await this.marketDataBarRepository.find({
      where: { datasetId },
      order: { timestamp: 'ASC' },
    });
    const assetBars = bars.filter((bar) => bar.symbol === symbol);
    const benchmarkBars = bars.filter((bar) => bar.symbol === benchmark);

    if (assetBars.length < 6 || benchmarkBars.length < 6) {
      throw new BadRequestException(
        'Dataset-backed baseline requires at least 6 bars for both symbol and benchmark',
      );
    }

    const benchmarkByTimestamp = new Map(
      benchmarkBars.map((bar) => [bar.timestamp, bar]),
    );
    const alignedBars = assetBars
      .map((assetBar) => {
        const benchmarkBar = benchmarkByTimestamp.get(assetBar.timestamp);

        if (!benchmarkBar) {
          return null;
        }

        const alignedBar: BaselineMarketDataset['bars'][number] = {
          date: assetBar.timestamp.slice(0, 10),
          assetClose: assetBar.adjustedClose ?? assetBar.close,
          benchmarkClose: benchmarkBar.adjustedClose ?? benchmarkBar.close,
          assetAvailabilityTimestamp: assetBar.availabilityTimestamp,
          benchmarkAvailabilityTimestamp: benchmarkBar.availabilityTimestamp,
        };

        return alignedBar;
      })
      .filter((bar): bar is BaselineMarketDataset['bars'][number] =>
        Boolean(bar),
      );

    if (alignedBars.length < 6) {
      throw new BadRequestException(
        'Dataset-backed baseline requires at least 6 timestamp-aligned bars',
      );
    }

    const provider = assetBars[0].provider;
    const timeframe = assetBars[0].timeframe;
    const currency = assetBars[0].currency;

    return {
      datasetId,
      provider,
      source: assetBars[0].sourceRef,
      symbol,
      benchmark,
      timeframe,
      currency,
      bars: alignedBars,
    };
  }

  private parseRequiredDate(value: string | undefined): Date | null {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
  }

  async runRecoveryProposal(
    request: RunRecoveryProposalRequest = {},
  ): Promise<RunRecoveryProposalResponse> {
    this.validateRunRecoveryProposalRequest(request);

    const paperAccount = await this.findRecoveryPaperAccount(request);
    const budget = await this.findRecoveryBudget(request, paperAccount);
    const positions = [...(paperAccount.positions ?? [])]
      .filter((position) => position.marketValue > 0)
      .sort(
        (left, right) =>
          Math.abs(right.marketValue) - Math.abs(left.marketValue),
      )
      .slice(0, request.maxPositions ?? 10);

    if (positions.length === 0) {
      throw new BadRequestException(
        'Recovery proposal requires at least one long paper position',
      );
    }

    const recoveryStateRef = this.buildRecoveryStateRef(
      paperAccount,
      budget,
      positions,
      request.maxPositions ?? 10,
    );
    const existingRecovery =
      await this.findExistingRecoveryProposal(recoveryStateRef);

    if (existingRecovery) {
      return existingRecovery;
    }

    const generatedAt = new Date().toISOString();
    const paperAccountUpdatedAt =
      paperAccount.updatedAt?.toISOString() ?? generatedAt;
    const artifactRef = `paper-account:${paperAccount.id}:recovery:${generatedAt}`;
    const researchRun = await this.createResearchRun({
      budgetEnvelopeId: budget.id,
      objective:
        request.objective?.trim() ??
        `Reduce paper account ${paperAccount.id} exposure`,
      strategyFamily: 'paper_recovery',
      hypothesis:
        'A deterministic SELL-only recovery proposal can reduce simulated exposure without broker order placement.',
      datasetRefs: [
        {
          id: `paper-account:${paperAccount.id}:positions`,
          provider: 'internal_control_plane',
          source: 'paper_account_projection',
          windowStart: paperAccountUpdatedAt,
          windowEnd: generatedAt,
          availabilityTimestamp: generatedAt,
          marketDataTimestamp: generatedAt,
          timezone: 'UTC',
          frequency: 'event',
          universe: positions.map((position) => position.symbol),
          fields: ['symbol', 'assetClass', 'marketValue', 'weightPct'],
          adjustmentMode: 'paper_projection',
        },
      ],
      featureRefs: [
        'paper_account.positions.market_value',
        'paper_account.positions.weight_pct',
        'budget.policy.max_order_notional',
      ],
      timestampLagRules: [
        'Paper recovery uses the latest promoted paper-account projection only.',
        'No broker account, credentials, or live order endpoint is read or called.',
      ],
      noLookaheadChecked: true,
      benchmark: 'cash',
      costModel: 'fixed-10bps-paper-fee-v1',
      slippageModel: 'fixed-5bps-paper-slippage-v1',
      validationWindow: {
        start: paperAccountUpdatedAt,
        end: generatedAt,
      },
      backtestMetrics: {
        startValue: paperAccount.equity,
        endValue: paperAccount.equity,
        totalReturnPct: 0,
        benchmarkReturnPct: 0,
        excessReturnPct: 0,
        maxDrawdownPct: 0,
        sharpeRatio: 0,
        turnoverPct: this.roundMoney(
          (positions.reduce(
            (total, position) => total + Math.abs(position.marketValue),
            0,
          ) /
            paperAccount.equity) *
            100,
        ),
        grossExposurePct: paperAccount.grossExposurePct,
        totalFees: this.roundMoney(
          positions.reduce(
            (total, position) =>
              total +
              Math.min(
                position.marketValue,
                budget.policy?.maxOrderNotional ?? 1_000_000,
              ) *
                0.001,
            0,
          ),
        ),
        tradeCount: positions.length,
        winRatePct: 0,
      },
      artifactRefs: [artifactRef],
      artifactHashes: {
        [artifactRef]: this.hashObject({
          paperAccountId: paperAccount.id,
          positions,
          generatedAt,
        }),
        [recoveryStateRef]: this.hashObject({
          paperAccountId: paperAccount.id,
          positions,
          budgetId: budget.id,
        }),
      },
      knownFailureModes: [
        'Paper recovery is a deterministic simulation and does not prove broker liquidity.',
        'Oversized positions may require repeated recovery proposals if max order notional caps apply.',
        'Signed paper approval is still required before paper execution.',
      ],
    });

    const maxOrderNotional = budget.policy?.maxOrderNotional ?? 1_000_000;
    const orders: ProposedOrder[] = positions.map((position) => ({
      symbol: position.symbol,
      assetClass: position.assetClass,
      side: 'SELL',
      orderType: 'MARKET',
      notional: this.roundMoney(
        Math.min(position.marketValue, maxOrderNotional),
      ),
      targetPositionPct: 0,
    }));

    const proposal = await this.createProposal({
      budgetEnvelopeId: budget.id,
      researchRunId: researchRun.id,
      strategyId: `${researchRun.strategyFamily}:sell-only-baseline`,
      ruleId: 'paper-account-recovery-sell-only-v1',
      actor: 'scheduler',
      generatedAt,
      marketDataTimestamp: generatedAt,
      portfolioSnapshot: this.buildPaperAccountPortfolio(paperAccount),
      orders,
      thesis:
        'Recovery proposal generated from active paper-account positions. It is SELL-only and keeps broker/live execution disabled.',
      evidenceRefs: [
        recoveryStateRef,
        ...researchRun.artifactRefs,
        `paper-account:${paperAccount.id}`,
        `budget:${budget.id}`,
      ],
    });
    const riskEvaluation = await this.evaluateProposal(proposal.id);

    return { researchRun, proposal, riskEvaluation };
  }

  private buildRecoveryStateRef(
    paperAccount: PaperAccount,
    budget: BudgetEnvelope,
    positions: PortfolioSnapshot['positions'],
    maxPositions: number,
  ): string {
    const stateHash = this.hashObject({
      paperAccountId: paperAccount.id,
      paperAccountUpdatedAt: paperAccount.updatedAt?.toISOString() ?? null,
      budgetId: budget.id,
      maxPositions,
      maxOrderNotional: budget.policy?.maxOrderNotional ?? 1_000_000,
      cash: this.roundMoney(paperAccount.cash),
      equity: this.roundMoney(paperAccount.equity),
      grossExposurePct: this.roundMoney(paperAccount.grossExposurePct),
      positions: [...(positions ?? [])]
        .map((position) => ({
          symbol: position.symbol,
          assetClass: position.assetClass,
          marketValue: this.roundMoney(position.marketValue),
          weightPct:
            position.weightPct === undefined
              ? undefined
              : this.roundMoney(position.weightPct),
          quantity:
            position.quantity === undefined
              ? undefined
              : this.roundQuantity(position.quantity),
          averagePrice:
            position.averagePrice === undefined
              ? undefined
              : this.roundMoney(position.averagePrice),
          costBasis:
            position.costBasis === undefined
              ? undefined
              : this.roundMoney(position.costBasis),
          realizedPnl:
            position.realizedPnl === undefined
              ? undefined
              : this.roundMoney(position.realizedPnl),
        }))
        .sort((left, right) => left.symbol.localeCompare(right.symbol)),
    });

    return `paper-recovery-state:${stateHash}`;
  }

  private async findExistingRecoveryProposal(
    recoveryStateRef: string,
  ): Promise<RunRecoveryProposalResponse | null> {
    const proposal = (
      await this.proposalRepository.find({
        where: { ruleId: 'paper-account-recovery-sell-only-v1' },
        order: { updatedAt: 'DESC' },
      })
    ).find((candidate) =>
      (candidate.evidenceRefs ?? []).includes(recoveryStateRef),
    );

    if (!proposal?.researchRunId) {
      return null;
    }

    const researchRun = await this.researchRunRepository.findOne({
      where: { id: proposal.researchRunId },
    });

    if (!researchRun) {
      return null;
    }

    const riskEvaluation =
      (await this.findLatestRiskEvaluation(proposal.id)) ??
      (await this.evaluateProposal(proposal.id));

    return { researchRun, proposal, riskEvaluation };
  }

  private getResearchRunBlockedReasons(
    request: CreateResearchRunRequest,
  ): string[] {
    const reasons: string[] = [];

    if (!request.benchmark) {
      reasons.push('Benchmark is required');
    }

    if (!request.costModel) {
      reasons.push('Transaction cost model is required');
    }

    if (!request.slippageModel) {
      reasons.push('Slippage model is required');
    }

    if (!request.noLookaheadChecked) {
      reasons.push('No-lookahead check must pass before proposal creation');
    }

    const datasetRefs = request.datasetRefs ?? [];
    const artifactRefs = request.artifactRefs ?? [];
    const artifactHashes = request.artifactHashes ?? {};

    if (!datasetRefs.length) {
      reasons.push('At least one dataset reference is required');
    }

    for (const datasetRef of datasetRefs) {
      if (!datasetRef.availabilityTimestamp) {
        reasons.push(`Dataset ${datasetRef.id} is missing availability time`);
      }

      const availabilityTimestamp = this.parseRequiredDate(
        datasetRef.availabilityTimestamp,
      );
      const marketDataTimestamp = this.parseRequiredDate(
        datasetRef.marketDataTimestamp,
      );

      if (!availabilityTimestamp) {
        reasons.push(`Dataset ${datasetRef.id} has invalid availability time`);
      } else if (availabilityTimestamp.getTime() > Date.now()) {
        reasons.push(`Dataset ${datasetRef.id} availability time is in future`);
      }

      if (!marketDataTimestamp) {
        reasons.push(`Dataset ${datasetRef.id} has invalid market data time`);
      }
    }

    if (!request.validationWindow?.start || !request.validationWindow?.end) {
      reasons.push('Validation window is required');
    } else {
      const validationStart = this.parseRequiredDate(
        request.validationWindow.start,
      );
      const validationEnd = this.parseRequiredDate(
        request.validationWindow.end,
      );

      if (!validationStart || !validationEnd) {
        reasons.push('Validation window dates must be parseable');
      } else if (validationStart.getTime() > validationEnd.getTime()) {
        reasons.push('Validation window start must be before end');
      }
    }

    if (!artifactRefs.length) {
      reasons.push('At least one audit artifact is required');
    }

    for (const artifactRef of artifactRefs) {
      if (!artifactHashes[artifactRef]) {
        reasons.push(`Artifact ${artifactRef} is missing a hash`);
      }
    }

    const metrics = request.backtestMetrics;
    const coreMetrics = [
      ['totalReturnPct', metrics.totalReturnPct],
      ['benchmarkReturnPct', metrics.benchmarkReturnPct],
      ['maxDrawdownPct', metrics.maxDrawdownPct],
      ['sharpeRatio', metrics.sharpeRatio],
      ['turnoverPct', metrics.turnoverPct],
      ['tradeCount', metrics.tradeCount],
    ] as const;

    for (const [name, value] of coreMetrics) {
      if (!Number.isFinite(value)) {
        reasons.push(`Backtest metric ${name} must be finite`);
      }
    }

    if (metrics.tradeCount <= 0) {
      reasons.push('Backtest must include at least one trade');
    }

    const modelCategory = request.modelCategory ?? 'baseline';
    if (this.disallowedModelCategories.has(modelCategory)) {
      reasons.push(`Model category ${modelCategory} is not allowed`);
    }

    if (modelCategory !== 'baseline') {
      if (!request.trainingWindow?.start || !request.trainingWindow?.end) {
        reasons.push('Trained models require a training window');
      }

      if (!request.modelName) {
        reasons.push('Trained models require a model name');
      }
    }

    return reasons;
  }

  async createRun(
    request: CreateAutonomousRunRequest | string,
  ): Promise<AutonomousRun> {
    const objective =
      typeof request === 'string' ? request : request.objective?.trim();

    if (!objective) {
      throw new BadRequestException('Autonomous run requires objective');
    }

    const budgetEnvelopeId =
      typeof request === 'string' ? undefined : request.budgetEnvelopeId;

    if (budgetEnvelopeId) {
      const budget = await this.budgetRepository.findOne({
        where: { id: budgetEnvelopeId },
      });

      if (!budget) {
        throw new NotFoundException(
          `Budget envelope ${budgetEnvelopeId} not found`,
        );
      }
    }

    const now = new Date().toISOString();
    const run = this.runRepository.create({
      objective,
      budgetEnvelopeId,
      status: 'idle',
      currentStage: 'budget_defined',
      timeline: [
        {
          at: now,
          stage: 'idle',
          message: 'Run created. Waiting for research and proposal generation.',
        },
      ],
      lastAction: 'Created run ledger entry',
      nextAction: budgetEnvelopeId
        ? 'Advance run to generate research, proposal, and risk evaluation'
        : 'Attach or create an active budget envelope before advancing',
    });

    return this.runRepository.save(run);
  }

  async listRuns(): Promise<AutonomousRun[]> {
    return this.runRepository.find({ order: { updatedAt: 'DESC' } });
  }

  async createRunSchedule(
    request: CreateAutonomousRunScheduleRequest,
  ): Promise<AutonomousRunSchedule> {
    this.validateCreateRunScheduleRequest(request);

    if (!request.objective?.trim()) {
      throw new BadRequestException('Autonomous schedule requires objective');
    }

    const budget = await this.budgetRepository.findOne({
      where: { id: request.budgetEnvelopeId },
    });

    if (!budget) {
      throw new NotFoundException(
        `Budget envelope ${request.budgetEnvelopeId} not found`,
      );
    }

    if (budget.status !== 'active') {
      throw new BadRequestException(
        'Autonomous schedule requires an active budget envelope',
      );
    }

    const cadenceMinutes = request.cadenceMinutes ?? 60;
    const mode = request.mode ?? 'dry_run';
    const attemptPaperExecution =
      mode === 'paper' && (request.attemptPaperExecution ?? true);
    const autoPaperApprovalEnabled = request.autoPaperApprovalEnabled === true;
    const researchDatasetId = request.researchDatasetId?.trim() || null;
    const researchSymbol = request.researchSymbol?.trim().toUpperCase() || null;
    const researchBenchmark =
      request.researchBenchmark?.trim().toUpperCase() || null;
    const researchMaxDataAgeMinutes = request.researchMaxDataAgeMinutes ?? null;
    const hasDatasetResearch =
      Boolean(researchDatasetId) ||
      Boolean(researchSymbol) ||
      Boolean(researchBenchmark);

    if (hasDatasetResearch) {
      if (!researchDatasetId || !researchSymbol || !researchBenchmark) {
        throw new BadRequestException(
          'Schedule dataset research requires researchDatasetId, researchSymbol, and researchBenchmark',
        );
      }

      await this.assertScheduleResearchDatasetReady({
        researchDatasetId,
        researchSymbol,
        researchBenchmark,
        researchMaxDataAgeMinutes,
      });
    }

    if (mode === 'paper' && !hasDatasetResearch) {
      throw new BadRequestException(
        'Paper schedules require pinned imported market data: researchDatasetId, researchSymbol, and researchBenchmark',
      );
    }

    if (autoPaperApprovalEnabled) {
      if (mode !== 'paper' || budget.mode !== 'paper') {
        throw new BadRequestException(
          'Paper auto approval requires schedule and budget mode paper',
        );
      }

      if (!attemptPaperExecution) {
        throw new BadRequestException(
          'Paper auto approval requires attemptPaperExecution',
        );
      }

      if (
        budget.policy?.allowPaperAutoApproval !== true ||
        budget.brokerExecutionEnabled ||
        budget.liveTradingEnabled
      ) {
        throw new BadRequestException(
          'Paper auto approval requires an active paper budget policy with broker/live execution disabled',
        );
      }
    }

    const nextRunAt = request.nextRunAt
      ? new Date(request.nextRunAt)
      : new Date();

    if (Number.isNaN(nextRunAt.getTime())) {
      throw new BadRequestException('Autonomous schedule nextRunAt is invalid');
    }

    return this.runScheduleRepository.save(
      this.runScheduleRepository.create({
        budgetEnvelopeId: budget.id,
        objective: request.objective.trim(),
        mode,
        cadenceMinutes,
        nextRunAt,
        enabled: request.enabled ?? true,
        attemptPaperExecution,
        autoPaperApprovalEnabled,
        autoPaperApprover: autoPaperApprovalEnabled
          ? (request.autoPaperApprover?.trim() ?? 'system:paper-auto-approval')
          : null,
        autoPaperApprovalReason: autoPaperApprovalEnabled
          ? (request.autoPaperApprovalReason?.trim() ??
            'Standing schedule authorization for paper-only autonomous execution. Broker and live trading remain disabled.')
          : null,
        autoPaperApprovalSignerKeyRef: autoPaperApprovalEnabled
          ? (request.autoPaperApprovalSignerKeyRef?.trim() ??
            'local-paper-auto-approval-key-v1')
          : null,
        autoPaperApprovalBudgetHash: autoPaperApprovalEnabled
          ? this.buildAutoPaperApprovalBudgetHash(budget)
          : null,
        researchDatasetId,
        researchSymbol,
        researchBenchmark,
        researchMaxDataAgeMinutes,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
  }

  async listRunSchedules(): Promise<AutonomousRunSchedule[]> {
    return this.runScheduleRepository.find({ order: { updatedAt: 'DESC' } });
  }

  async listDueRunSchedules(
    limit = 5,
    now = new Date(),
  ): Promise<AutonomousRunSchedule[]> {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new BadRequestException('Due schedule limit must be positive');
    }

    return this.runScheduleRepository.find({
      where: [
        {
          enabled: true,
          nextRunAt: LessThanOrEqual(now),
          leaseExpiresAt: IsNull(),
        },
        {
          enabled: true,
          nextRunAt: LessThanOrEqual(now),
          leaseExpiresAt: LessThanOrEqual(now),
        },
      ],
      order: { nextRunAt: 'ASC' },
      take: limit,
    });
  }

  async tickRunSchedule(
    scheduleId: number,
    request: TickAutonomousRunScheduleRequest = {},
  ): Promise<AutonomousRun> {
    this.validateTickRunScheduleRequest(request);

    const schedule = await this.runScheduleRepository.findOne({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException(
        `Autonomous schedule ${scheduleId} not found`,
      );
    }

    const now = new Date();
    const force = request.force ?? false;

    if (!schedule.enabled && !force) {
      throw new BadRequestException('Autonomous schedule is disabled');
    }

    if (schedule.nextRunAt.getTime() > now.getTime() && !force) {
      throw new BadRequestException('Autonomous schedule is not due yet');
    }

    const executionControl = await this.getExecutionControlState();
    if (
      executionControl.state === 'paused' ||
      executionControl.state === 'halted'
    ) {
      throw new BadRequestException(
        `Execution control is ${executionControl.state}; schedule tick was not consumed`,
      );
    }

    const leaseTtlSeconds = request.leaseTtlSeconds ?? 120;
    const leaseOwner = (
      request.leaseOwner ??
      request.actor ??
      'manual-tick'
    ).trim();
    const leaseExpiresAt = new Date(now.getTime() + leaseTtlSeconds * 1000);
    const cycleKey = `schedule:${schedule.id}:${schedule.nextRunAt.toISOString()}`;
    const leaseCriteria = force
      ? [
          { id: schedule.id, leaseExpiresAt: IsNull() },
          { id: schedule.id, leaseExpiresAt: LessThanOrEqual(now) },
        ]
      : [
          {
            id: schedule.id,
            enabled: true,
            nextRunAt: schedule.nextRunAt,
            leaseExpiresAt: IsNull(),
          },
          {
            id: schedule.id,
            enabled: true,
            nextRunAt: schedule.nextRunAt,
            leaseExpiresAt: LessThanOrEqual(now),
          },
        ];
    const leaseResult = await this.runScheduleRepository.update(leaseCriteria, {
      leaseOwner,
      leaseExpiresAt,
      lastTickAt: now,
      lastError: null,
    });

    if (!leaseResult.affected) {
      throw new BadRequestException(
        `Autonomous schedule is already leased by ${schedule.leaseOwner ?? 'unknown'}`,
      );
    }

    try {
      const budget = await this.budgetRepository.findOne({
        where: { id: schedule.budgetEnvelopeId, status: 'active' },
      });

      if (!budget) {
        throw new BadRequestException(
          'Autonomous schedule requires an active budget envelope',
        );
      }

      let run = await this.findRunByScheduleCycle(schedule.id, cycleKey);

      if (!run) {
        run = this.runRepository.create({
          objective: schedule.objective,
          budgetEnvelopeId: schedule.budgetEnvelopeId,
          scheduleId: schedule.id,
          cycleKey,
          status: 'idle',
          currentStage: 'budget_defined',
          startedAt: new Date(),
          timeline: [
            {
              at: new Date().toISOString(),
              stage: 'idle',
              message: 'Created run ledger entry',
            },
          ],
          lastAction: 'Created run ledger entry',
          nextAction:
            'Advance run to generate research, proposal, and risk evaluation',
        });
        this.appendRunTimeline(
          run,
          'idle',
          `Schedule ${schedule.id} tick acquired by ${leaseOwner}.`,
        );
        run = await this.runRepository.save(run);
      }

      const advancedRun = await this.advanceRun(run.id, {
        attemptPaperExecution:
          schedule.mode === 'paper' &&
          (request.attemptPaperExecution ?? schedule.attemptPaperExecution),
      });
      const nextRunAt = new Date(
        schedule.nextRunAt.getTime() + schedule.cadenceMinutes * 60_000,
      );
      await this.releaseScheduleLease(schedule, leaseOwner, leaseExpiresAt, {
        lastRunId: advancedRun.id,
        lastCycleKey: cycleKey,
        nextRunAt,
        lastError:
          advancedRun.status === 'failed' ? (advancedRun.error ?? null) : null,
      });

      return advancedRun;
    } catch (error) {
      await this.releaseScheduleLease(schedule, leaseOwner, leaseExpiresAt, {
        lastError:
          error instanceof Error
            ? error.message
            : 'Autonomous schedule tick failed',
      });
      throw error;
    }
  }

  async advanceRun(
    runId: number,
    request: AdvanceAutonomousRunRequest = {},
  ): Promise<AutonomousRun> {
    const run = await this.runRepository.findOne({ where: { id: runId } });

    if (!run) {
      throw new NotFoundException(`Autonomous run ${runId} not found`);
    }

    try {
      const executionControl = await this.getExecutionControlState();
      if (
        executionControl.state === 'paused' ||
        executionControl.state === 'halted'
      ) {
        run.status = executionControl.state;
        run.currentStage = 'execution_control_blocked';
        run.lastAction = `Execution control is ${executionControl.state}`;
        run.nextAction =
          'Resume execution control before advancing the autonomous run';
        this.appendRunTimeline(
          run,
          executionControl.state,
          `Run did not advance because execution control is ${executionControl.state}.`,
        );
        return this.runRepository.save(run);
      }

      const budget = await this.findBudgetForRun(run);

      if (!budget) {
        run.status = 'failed';
        run.currentStage = 'budget_missing';
        run.lastAction = 'Budget lookup failed';
        run.nextAction = 'Create or attach an active budget envelope';
        run.error = 'Autonomous run requires an active budget envelope';
        this.appendRunTimeline(run, 'failed', run.error);
        return this.runRepository.save(run);
      }

      run.budgetEnvelopeId = budget.id;

      if (executionControl.state === 'reducing') {
        return this.advanceReducingRun(run, budget, request);
      }

      run.status = 'researching';
      run.currentStage = 'research_running';
      run.lastAction = `Selected budget envelope ${budget.id}`;
      run.nextAction = 'Run deterministic baseline research';
      this.appendRunTimeline(
        run,
        'researching',
        `Selected budget ${budget.name} (${budget.currency} ${budget.totalBudget}).`,
      );
      await this.runRepository.save(run);

      const researchRun = run.researchRunId
        ? await this.researchRunRepository.findOne({
            where: { id: run.researchRunId },
          })
        : await this.runBaselineResearch(
            await this.buildBaselineResearchRequestForRun(run, budget),
          );

      if (!researchRun) {
        throw new NotFoundException(
          `Research run ${run.researchRunId} not found`,
        );
      }

      run.researchRunId = researchRun.id;
      this.appendRunTimeline(
        run,
        'researching',
        `Research run ${researchRun.id} finished with status ${researchRun.status}.`,
      );

      if (!researchRun.advanceEligible) {
        run.status = 'failed';
        run.currentStage = 'research_blocked';
        run.lastAction = `Research run ${researchRun.id} is blocked`;
        run.nextAction =
          'Review research blocked reasons before proposal generation';
        run.error = researchRun.blockedReasons.join('; ');
        this.appendRunTimeline(run, 'failed', run.error);
        return this.runRepository.save(run);
      }

      const proposal = run.proposalId
        ? await this.proposalRepository.findOne({
            where: { id: run.proposalId },
          })
        : await this.createBaselineProposalFromRun(researchRun, budget);

      if (!proposal) {
        throw new NotFoundException(`Proposal ${run.proposalId} not found`);
      }

      run.proposalId = proposal.id;
      run.status = 'proposed';
      run.currentStage = 'proposal_generated';
      run.lastAction = `Generated proposal ${proposal.id}`;
      run.nextAction = 'Evaluate proposal risk';
      this.appendRunTimeline(
        run,
        'proposed',
        `Proposal ${proposal.id} generated with ${proposal.orders.length} order(s).`,
      );
      await this.runRepository.save(run);

      const evaluation = run.riskEvaluationId
        ? await this.riskEvaluationRepository.findOne({
            where: { id: run.riskEvaluationId },
          })
        : await this.evaluateProposal(proposal.id);

      if (!evaluation) {
        throw new NotFoundException(
          `Risk evaluation ${run.riskEvaluationId} not found`,
        );
      }

      run.riskEvaluationId = evaluation.id;
      run.status = 'risk_checked';
      run.currentStage = 'risk_evaluated';
      run.lastAction = `Risk evaluation ${evaluation.id} returned ${evaluation.decision}`;
      run.nextAction =
        evaluation.decision === 'ALLOW'
          ? 'Wait for signed paper approval and active paper account before execution'
          : 'Resolve risk decision before paper execution';
      this.appendRunTimeline(
        run,
        'risk_checked',
        `Risk evaluation ${evaluation.id} returned ${evaluation.decision}.`,
      );

      const paperPlan =
        request.attemptPaperExecution === false
          ? null
          : await this.tryPaperExecutionForRun(proposal, budget, run);

      if (paperPlan) {
        run.paperOrderPlanId = paperPlan.id;
        run.riskEvaluationId =
          paperPlan.riskEvaluationId ?? run.riskEvaluationId;
        run.status =
          paperPlan.status === 'blocked' ? 'risk_checked' : 'paper_ready';
        run.currentStage =
          paperPlan.status === 'blocked'
            ? 'paper_execution_blocked'
            : 'paper_execution_recorded';
        run.lastAction = `Paper order plan ${paperPlan.id} ${paperPlan.status}`;
        run.nextAction =
          paperPlan.status === 'blocked'
            ? paperPlan.blockedReasons.join('; ')
            : 'Reconcile paper order plan and broker read-only snapshot';
        this.appendRunTimeline(
          run,
          run.status,
          `Paper order plan ${paperPlan.id} ${paperPlan.status}.`,
        );
      }

      run.error = undefined;
      return this.runRepository.save(run);
    } catch (error) {
      run.status = 'failed';
      run.currentStage = 'failed';
      run.error =
        error instanceof Error ? error.message : 'Autonomous run failed';
      run.lastAction = 'Autonomous run advance failed';
      run.nextAction = 'Inspect the failed run timeline and fix the blocker';
      this.appendRunTimeline(run, 'failed', run.error);
      return this.runRepository.save(run);
    }
  }

  private async advanceReducingRun(
    run: AutonomousRun,
    budget: BudgetEnvelope,
    request: AdvanceAutonomousRunRequest,
  ): Promise<AutonomousRun> {
    run.status = 'researching';
    run.currentStage = 'recovery_research_running';
    run.lastAction = 'Execution control is reducing';
    run.nextAction = 'Generate SELL-only recovery proposal';
    this.appendRunTimeline(
      run,
      'researching',
      `Execution control is reducing; selected budget ${budget.name} (${budget.currency} ${budget.totalBudget}).`,
    );
    await this.runRepository.save(run);

    const recovery = await this.runRecoveryProposal({
      budgetEnvelopeId: budget.id,
      objective: run.objective,
    });

    run.researchRunId = recovery.researchRun.id;
    this.appendRunTimeline(
      run,
      'researching',
      `Recovery research run ${recovery.researchRun.id} generated from active paper positions.`,
    );

    run.proposalId = recovery.proposal.id;
    run.status = 'proposed';
    run.currentStage = 'recovery_proposal_generated';
    run.lastAction = `Generated recovery proposal ${recovery.proposal.id}`;
    run.nextAction = 'Evaluate recovery proposal risk';
    this.appendRunTimeline(
      run,
      'proposed',
      `Recovery proposal ${recovery.proposal.id} generated with ${recovery.proposal.orders.length} SELL order(s).`,
    );
    await this.runRepository.save(run);

    run.riskEvaluationId = recovery.riskEvaluation.id;
    run.status = 'risk_checked';
    run.currentStage = 'recovery_risk_evaluated';
    run.lastAction = `Recovery risk evaluation ${recovery.riskEvaluation.id} returned ${recovery.riskEvaluation.decision}`;
    run.nextAction =
      recovery.riskEvaluation.decision === 'ALLOW'
        ? 'Wait for signed recovery paper approval before execution'
        : 'Review recovery risk decision before paper execution';
    this.appendRunTimeline(
      run,
      'risk_checked',
      `Recovery risk evaluation ${recovery.riskEvaluation.id} returned ${recovery.riskEvaluation.decision}.`,
    );

    const paperPlan =
      request.attemptPaperExecution === false
        ? null
        : await this.tryPaperExecutionForRun(recovery.proposal, budget, run);

    if (paperPlan) {
      run.paperOrderPlanId = paperPlan.id;
      run.riskEvaluationId = paperPlan.riskEvaluationId ?? run.riskEvaluationId;
      run.status =
        paperPlan.status === 'blocked' ? 'risk_checked' : 'paper_ready';
      run.currentStage =
        paperPlan.status === 'blocked'
          ? 'recovery_paper_execution_blocked'
          : 'recovery_paper_execution_recorded';
      run.lastAction = `Recovery paper order plan ${paperPlan.id} ${paperPlan.status}`;
      run.nextAction =
        paperPlan.status === 'blocked'
          ? paperPlan.blockedReasons.join('; ')
          : 'Reconcile recovery paper order plan and broker read-only snapshot';
      this.appendRunTimeline(
        run,
        run.status,
        `Recovery paper order plan ${paperPlan.id} ${paperPlan.status}.`,
      );
    }

    run.error = undefined;
    return this.runRepository.save(run);
  }

  private async findBudgetForRun(
    run: AutonomousRun,
  ): Promise<BudgetEnvelope | null> {
    if (run.budgetEnvelopeId) {
      return this.budgetRepository.findOne({
        where: { id: run.budgetEnvelopeId, status: 'active' },
      });
    }

    return this.budgetRepository.findOne({
      where: { status: 'active' },
      order: { updatedAt: 'DESC' },
    });
  }

  private validateCreateRunScheduleRequest(
    request: CreateAutonomousRunScheduleRequest,
  ): void {
    if (
      !Number.isInteger(request.budgetEnvelopeId) ||
      request.budgetEnvelopeId <= 0
    ) {
      throw new BadRequestException(
        'Autonomous schedule requires a positive budgetEnvelopeId',
      );
    }

    const allowedModes = new Set(['dry_run', 'paper', 'broker_read_only']);

    if (request.mode && !allowedModes.has(request.mode)) {
      throw new BadRequestException(
        'Autonomous schedules cannot enable live trading',
      );
    }

    if (
      request.cadenceMinutes !== undefined &&
      (!Number.isInteger(request.cadenceMinutes) || request.cadenceMinutes < 5)
    ) {
      throw new BadRequestException(
        'Autonomous schedule cadence must be at least 5 minutes',
      );
    }

    this.validateOptionalBoolean(
      request.enabled,
      'Autonomous schedule enabled must be boolean',
    );
    this.validateOptionalBoolean(
      request.attemptPaperExecution,
      'Autonomous schedule attemptPaperExecution must be boolean',
    );
    this.validateOptionalBoolean(
      request.autoPaperApprovalEnabled,
      'Autonomous schedule autoPaperApprovalEnabled must be boolean',
    );
    this.validateOptionalNonEmptyString(
      request.autoPaperApprover,
      'Autonomous schedule autoPaperApprover must be a non-empty string',
    );
    this.validateOptionalNonEmptyString(
      request.autoPaperApprovalReason,
      'Autonomous schedule autoPaperApprovalReason must be a non-empty string',
    );
    this.validateOptionalNonEmptyString(
      request.autoPaperApprovalSignerKeyRef,
      'Autonomous schedule autoPaperApprovalSignerKeyRef must be a non-empty string',
    );
    this.validateOptionalNonEmptyString(
      request.researchDatasetId,
      'Autonomous schedule researchDatasetId must be a non-empty string',
    );
    this.validateOptionalNonEmptyString(
      request.researchSymbol,
      'Autonomous schedule researchSymbol must be a non-empty string',
    );
    this.validateOptionalNonEmptyString(
      request.researchBenchmark,
      'Autonomous schedule researchBenchmark must be a non-empty string',
    );

    if (
      request.researchMaxDataAgeMinutes !== undefined &&
      (!Number.isInteger(request.researchMaxDataAgeMinutes) ||
        request.researchMaxDataAgeMinutes < 1)
    ) {
      throw new BadRequestException(
        'Autonomous schedule researchMaxDataAgeMinutes must be a positive integer',
      );
    }
  }

  private validateTickRunScheduleRequest(
    request: TickAutonomousRunScheduleRequest,
  ): void {
    this.validateOptionalBoolean(
      request.force,
      'Autonomous schedule force must be boolean',
    );
    this.validateOptionalBoolean(
      request.attemptPaperExecution,
      'Autonomous schedule attemptPaperExecution must be boolean',
    );

    if (
      request.leaseTtlSeconds !== undefined &&
      (!Number.isInteger(request.leaseTtlSeconds) ||
        request.leaseTtlSeconds < 1 ||
        request.leaseTtlSeconds > 3600)
    ) {
      throw new BadRequestException(
        'Autonomous schedule leaseTtlSeconds must be between 1 and 3600',
      );
    }

    this.validateOptionalNonEmptyString(
      request.actor,
      'Autonomous schedule actor must be a non-empty string',
    );
    this.validateOptionalNonEmptyString(
      request.leaseOwner,
      'Autonomous schedule leaseOwner must be a non-empty string',
    );
  }

  private validateOptionalBoolean(value: unknown, message: string): void {
    if (value !== undefined && typeof value !== 'boolean') {
      throw new BadRequestException(message);
    }
  }

  private validateOptionalNonEmptyString(
    value: unknown,
    message: string,
  ): void {
    if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
      throw new BadRequestException(message);
    }
  }

  private async releaseScheduleLease(
    schedule: AutonomousRunSchedule,
    leaseOwner: string,
    leaseExpiresAt: Date,
    update: Partial<AutonomousRunSchedule>,
  ): Promise<void> {
    await this.runScheduleRepository.update(
      {
        id: schedule.id,
        leaseOwner,
        leaseExpiresAt,
      },
      {
        ...update,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    );
  }

  private async findRunByScheduleCycle(
    scheduleId: number,
    cycleKey: string,
  ): Promise<AutonomousRun | null> {
    return this.runRepository.findOne({
      where: { scheduleId, cycleKey },
    });
  }

  private async buildBaselineResearchRequestForRun(
    run: AutonomousRun,
    budget: BudgetEnvelope,
  ): Promise<RunBaselineResearchRequest> {
    const request: RunBaselineResearchRequest = {
      budgetEnvelopeId: budget.id,
      objective: run.objective,
      initialCapital: budget.totalBudget,
    };

    if (!run.scheduleId) {
      return request;
    }

    const schedule = await this.runScheduleRepository.findOne({
      where: { id: run.scheduleId },
    });

    if (
      !schedule?.researchDatasetId ||
      !schedule.researchSymbol ||
      !schedule.researchBenchmark
    ) {
      return request;
    }

    await this.assertScheduleResearchDatasetReady({
      researchDatasetId: schedule.researchDatasetId,
      researchSymbol: schedule.researchSymbol,
      researchBenchmark: schedule.researchBenchmark,
      researchMaxDataAgeMinutes: schedule.researchMaxDataAgeMinutes ?? null,
    });

    return {
      ...request,
      datasetId: schedule.researchDatasetId,
      symbol: schedule.researchSymbol,
      benchmark: schedule.researchBenchmark,
    };
  }

  private async assertScheduleResearchDatasetReady(schedule: {
    researchDatasetId: string;
    researchSymbol: string;
    researchBenchmark: string;
    researchMaxDataAgeMinutes?: number | null;
  }): Promise<void> {
    const marketDataset = await this.buildBaselineMarketDataset({
      datasetId: schedule.researchDatasetId,
      symbol: schedule.researchSymbol,
      benchmark: schedule.researchBenchmark,
    });

    if (!schedule.researchMaxDataAgeMinutes) {
      return;
    }

    const latestAvailabilityMs = Math.max(
      ...marketDataset.bars.flatMap((bar) => [
        new Date(bar.assetAvailabilityTimestamp).getTime(),
        new Date(bar.benchmarkAvailabilityTimestamp).getTime(),
      ]),
    );
    const ageMinutes = Math.floor((Date.now() - latestAvailabilityMs) / 60_000);

    if (ageMinutes > schedule.researchMaxDataAgeMinutes) {
      throw new BadRequestException(
        `Schedule research dataset ${schedule.researchDatasetId} is stale: latest availability is ${ageMinutes} minutes old`,
      );
    }
  }

  private async createBaselineProposalFromRun(
    researchRun: ResearchRun,
    budget: BudgetEnvelope,
  ): Promise<InvestmentProposal> {
    const generatedAt = new Date().toISOString();
    const investableBudget = this.roundMoney(
      budget.totalBudget * (1 - budget.cashReservePct / 100),
    );
    const maxSinglePositionNotional = this.roundMoney(
      budget.totalBudget * ((budget.policy?.maxSinglePositionPct ?? 20) / 100),
    );
    const orderNotional = this.roundMoney(
      Math.min(
        investableBudget,
        maxSinglePositionNotional,
        budget.policy?.maxOrderNotional ?? 1_000_000,
      ),
    );
    const symbol =
      researchRun.datasetRefs[0]?.universe?.[0] ?? 'SAMPLE_MOMENTUM_BASKET';
    const marketDataTimestamp =
      researchRun.datasetRefs[0]?.marketDataTimestamp ??
      researchRun.datasetRefs[0]?.availabilityTimestamp ??
      generatedAt;
    const order: ProposedOrder = {
      symbol,
      assetClass: 'domestic_etf',
      side: 'BUY',
      orderType: 'MARKET',
      notional: orderNotional,
      targetPositionPct: this.roundMoney(
        (orderNotional / budget.totalBudget) * 100,
      ),
    };

    return this.createProposal({
      budgetEnvelopeId: budget.id,
      researchRunId: researchRun.id,
      strategyId: `${researchRun.strategyFamily}:autonomous-baseline`,
      ruleId: 'budget-capped-single-position-v1',
      actor: 'scheduler',
      generatedAt,
      marketDataTimestamp,
      portfolioSnapshot: {
        currency: budget.currency,
        equity: budget.totalBudget,
        cash: budget.totalBudget,
        grossExposurePct: 0,
        positions: [],
      },
      orders: [order],
      thesis:
        'Autonomous baseline proposal generated from a reproducible research run and capped by the active budget risk policy.',
      evidenceRefs: researchRun.artifactRefs,
    });
  }

  private async tryPaperExecutionForRun(
    proposal: InvestmentProposal,
    budget?: BudgetEnvelope | null,
    run?: AutonomousRun,
  ): Promise<PaperOrderPlan | null> {
    const existingPlan = (
      await this.findPaperOrderPlansForProposal(proposal.id)
    )
      .filter((plan) => plan.status !== 'blocked')
      .sort(
        (left, right) =>
          (right.updatedAt?.getTime?.() ?? right.id ?? 0) -
          (left.updatedAt?.getTime?.() ?? left.id ?? 0),
      )[0];

    if (existingPlan) {
      return existingPlan;
    }

    let activeApproval = (
      await this.orderPlanApprovalRepository.find({
        order: { updatedAt: 'DESC' },
      })
    ).find(
      (approval) =>
        approval.proposalId === proposal.id && approval.status === 'active',
    );
    const paperAccount = await this.findPaperAccountForProposal(proposal);

    if (!activeApproval) {
      activeApproval = await this.maybeCreatePaperAutoApproval(
        proposal,
        budget,
        run,
      );
    }

    if (!activeApproval || !paperAccount) {
      return null;
    }

    return this.paperExecuteProposal(proposal.id, {
      idempotencyKey: activeApproval.idempotencyKey,
      orderPlanApprovalId: activeApproval.id,
      expectedRiskEvaluationId: activeApproval.riskEvaluationId,
    });
  }

  private async maybeCreatePaperAutoApproval(
    proposal: InvestmentProposal,
    budget?: BudgetEnvelope | null,
    run?: AutonomousRun,
  ): Promise<OrderPlanApproval | null> {
    const resolvedBudget =
      budget ??
      (proposal.budgetEnvelopeId
        ? await this.budgetRepository.findOne({
            where: { id: proposal.budgetEnvelopeId },
          })
        : null);

    if (!run?.scheduleId) {
      return null;
    }

    const schedule = await this.runScheduleRepository.findOne({
      where: { id: run.scheduleId },
    });

    if (
      !schedule ||
      schedule.autoPaperApprovalEnabled !== true ||
      schedule.mode !== 'paper' ||
      schedule.attemptPaperExecution !== true ||
      schedule.brokerExecutionEnabled ||
      schedule.liveTradingEnabled
    ) {
      return null;
    }

    if (
      !resolvedBudget ||
      resolvedBudget.mode !== 'paper' ||
      resolvedBudget.policy?.allowPaperAutoApproval !== true ||
      resolvedBudget.brokerExecutionEnabled ||
      resolvedBudget.liveTradingEnabled ||
      proposal.brokerExecutionEnabled
    ) {
      return null;
    }

    const budgetHash = this.buildAutoPaperApprovalBudgetHash(resolvedBudget);

    if (schedule.autoPaperApprovalBudgetHash !== budgetHash) {
      return null;
    }

    if (!proposal.researchRunId) {
      return null;
    }

    const researchRun = await this.researchRunRepository.findOne({
      where: { id: proposal.researchRunId },
    });
    const datasetRef = researchRun?.datasetRefs[0];
    const isPinnedScheduleResearch =
      Boolean(schedule.researchDatasetId) &&
      Boolean(schedule.researchSymbol) &&
      Boolean(schedule.researchBenchmark) &&
      datasetRef?.id === schedule.researchDatasetId &&
      datasetRef.universe?.[0] === schedule.researchSymbol &&
      datasetRef.universe?.[1] === schedule.researchBenchmark;
    const isPaperRecoveryProposal =
      await this.isPaperRecoveryAutoApprovalCandidate(proposal, researchRun);

    if (!isPinnedScheduleResearch && !isPaperRecoveryProposal) {
      return null;
    }

    if (isPinnedScheduleResearch) {
      await this.assertScheduleResearchDatasetReady({
        researchDatasetId: schedule.researchDatasetId!,
        researchSymbol: schedule.researchSymbol!,
        researchBenchmark: schedule.researchBenchmark!,
        researchMaxDataAgeMinutes: schedule.researchMaxDataAgeMinutes ?? null,
      });
    }

    const paperAccount = await this.findPaperAccountForProposal(proposal);

    if (!paperAccount) {
      return null;
    }

    const latestPaperAccountEvent = await this.getLatestPaperAccountEvent(
      paperAccount.id,
    );

    if (!latestPaperAccountEvent) {
      return null;
    }

    return this.createOrderPlanApproval(proposal.id, {
      approver:
        schedule.autoPaperApprover ??
        (isPaperRecoveryProposal
          ? 'system:paper-recovery-auto-approval'
          : 'system:paper-auto-approval'),
      reason:
        schedule.autoPaperApprovalReason ??
        (isPaperRecoveryProposal
          ? 'Standing schedule authorization for paper-only recovery execution. Broker and live trading remain disabled.'
          : 'Standing schedule authorization for paper-only autonomous execution. Broker and live trading remain disabled.'),
      idempotencyKey: `${isPaperRecoveryProposal ? 'auto-paper-recovery-approval' : 'auto-paper-approval'}:schedule:${schedule.id}:cycle:${run.cycleKey ?? run.id}:proposal:${proposal.id}`,
      expectedPaperAccountEventHash: latestPaperAccountEvent.eventHash,
      signerKeyRef:
        schedule.autoPaperApprovalSignerKeyRef ??
        (isPaperRecoveryProposal
          ? 'local-paper-recovery-auto-approval-key-v1'
          : 'local-paper-auto-approval-key-v1'),
      approvalSource: isPaperRecoveryProposal ? 'recovery_auto' : 'paper_auto',
      approvedByRunId: run.id,
      approvedByScheduleId: schedule.id,
      autoApprovalPolicyRef: schedule.autoPaperApprovalBudgetHash,
    });
  }

  private buildAutoPaperApprovalBudgetHash(budget: BudgetEnvelope): string {
    return this.hashObject({
      budgetEnvelopeId: budget.id,
      mode: budget.mode,
      totalBudget: budget.totalBudget,
      cashReservePct: budget.cashReservePct,
      allowedAssetClasses: budget.allowedAssetClasses,
      policy: budget.policy,
      brokerExecutionEnabled: budget.brokerExecutionEnabled,
      liveTradingEnabled: budget.liveTradingEnabled,
    });
  }

  private async isPaperRecoveryAutoApprovalCandidate(
    proposal: InvestmentProposal,
    researchRun?: ResearchRun | null,
  ): Promise<boolean> {
    if (
      proposal.ruleId !== 'paper-account-recovery-sell-only-v1' ||
      researchRun?.strategyFamily !== 'paper_recovery' ||
      !proposal.orders.length ||
      proposal.brokerExecutionEnabled
    ) {
      return false;
    }

    const executionControl = await this.getExecutionControlState();

    if (executionControl.state !== 'reducing') {
      return false;
    }

    const datasetRef = researchRun.datasetRefs[0];
    const marketDataTimestamp = this.parseRequiredDate(
      datasetRef?.marketDataTimestamp,
    );
    const availabilityTimestamp = this.parseRequiredDate(
      datasetRef?.availabilityTimestamp,
    );

    if (
      datasetRef?.provider !== 'internal_control_plane' ||
      datasetRef.source !== 'paper_account_projection' ||
      !datasetRef.id.startsWith('paper-account:') ||
      !marketDataTimestamp ||
      !availabilityTimestamp ||
      marketDataTimestamp.getTime() > Date.now() ||
      availabilityTimestamp.getTime() > Date.now()
    ) {
      return false;
    }

    return proposal.orders.every(
      (order) =>
        order.side === 'SELL' &&
        order.orderType === 'MARKET' &&
        order.notional > 0 &&
        order.targetPositionPct === 0,
    );
  }

  private appendRunTimeline(
    run: AutonomousRun,
    stage: AutonomousRun['status'],
    message: string,
  ): void {
    run.timeline = [
      ...(run.timeline ?? []),
      {
        at: new Date().toISOString(),
        stage,
        message,
      },
    ];
  }
}
