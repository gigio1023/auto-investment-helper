import { AutonomousRun } from '../../entities/autonomous-run.entity';
import { AutonomousRunSchedule } from '../../entities/autonomous-run-schedule.entity';
import { BrokerFill } from '../../entities/broker-fill.entity';
import { BrokerOrderCommand } from '../../entities/broker-order-command.entity';
import { BrokerOrderStatusRecord } from '../../entities/broker-order-status.entity';
import { BrokerSnapshot } from '../../entities/broker-snapshot.entity';
import { BudgetEnvelope } from '../../entities/budget-envelope.entity';
import { ExecutionControlState } from '../../entities/execution-control-state.entity';
import { FundingReadinessRecord } from '../../entities/funding-readiness-record.entity';
import { InvestmentProposal } from '../../entities/investment-proposal.entity';
import { LivePilotReadinessRecord } from '../../entities/live-pilot-readiness-record.entity';
import { MarketDataBar } from '../../entities/market-data-bar.entity';
import { OrderPlanApproval } from '../../entities/order-plan-approval.entity';
import { PaperAccountEvent } from '../../entities/paper-account-event.entity';
import { PaperAccount } from '../../entities/paper-account.entity';
import { PaperOrderPlan } from '../../entities/paper-order-plan.entity';
import { PaperReservationHoldRecord } from '../../entities/paper-reservation-hold.entity';
import { ResearchRun } from '../../entities/research-run.entity';
import { RiskEvaluation } from '../../entities/risk-evaluation.entity';
import { RiskGateService } from '../risk-gate/risk-gate.service';
import { ControlPlaneService } from './control-plane.service';

describe('ControlPlaneService', () => {
  let service: ControlPlaneService;
  let budgets: BudgetEnvelope[];
  let brokerFills: BrokerFill[];
  let brokerOrderCommands: BrokerOrderCommand[];
  let brokerOrderStatuses: BrokerOrderStatusRecord[];
  let brokerSnapshots: BrokerSnapshot[];
  let fundingReadinessRecords: FundingReadinessRecord[];
  let livePilotReadinessRecords: LivePilotReadinessRecord[];
  let orderPlanApprovals: OrderPlanApproval[];
  let researchRuns: ResearchRun[];
  let marketDataBars: MarketDataBar[];
  let proposals: InvestmentProposal[];
  let paperAccounts: PaperAccount[];
  let paperAccountEvents: PaperAccountEvent[];
  let paperOrderPlans: PaperOrderPlan[];
  let paperReservationHolds: PaperReservationHoldRecord[];
  let executionControlStates: ExecutionControlState[];
  let evaluations: RiskEvaluation[];
  let runs: AutonomousRun[];
  let runSchedules: AutonomousRunSchedule[];

  const makeRepository = <T extends { id?: number }>(items: T[]) => ({
    create: jest.fn((value: Partial<T>) => value as T),
    save: jest.fn(async (value: T) => {
      if (!value.id) {
        value.id = items.length + 1;
        items.push(value);
      } else {
        const existingIndex = items.findIndex((item) => item.id === value.id);
        if (existingIndex >= 0) {
          items[existingIndex] = value;
        }
      }
      return value;
    }),
    find: jest.fn(async (options?: { where?: Partial<T> }) => {
      if (!options?.where) {
        return [...items];
      }

      return items.filter((item) =>
        Object.entries(options.where ?? {}).every(
          ([key, value]) => item[key] === value,
        ),
      );
    }),
    findOne: jest.fn(
      async (options: {
        where: Partial<T>;
        order?: Partial<Record<keyof T, 'ASC' | 'DESC'>>;
      }) => {
        const { where, order } = options;
        const matches = items.filter((item) =>
          Object.entries(where).every(([key, value]) => item[key] === value),
        );
        const orderEntries = Object.entries(order ?? {}) as Array<
          [keyof T, 'ASC' | 'DESC']
        >;

        if (orderEntries.length > 0) {
          matches.sort((left, right) => {
            for (const [key, direction] of orderEntries) {
              const leftValue = left[key];
              const rightValue = right[key];
              const leftComparable =
                leftValue instanceof Date
                  ? leftValue.getTime()
                  : typeof leftValue === 'number' ||
                      typeof leftValue === 'string'
                    ? leftValue
                    : leftValue === undefined || leftValue === null
                      ? undefined
                      : String(leftValue);
              const rightComparable =
                rightValue instanceof Date
                  ? rightValue.getTime()
                  : typeof rightValue === 'number' ||
                      typeof rightValue === 'string'
                    ? rightValue
                    : rightValue === undefined || rightValue === null
                      ? undefined
                      : String(rightValue);

              if (leftComparable === rightComparable) {
                continue;
              }

              if (leftComparable === undefined) {
                return direction === 'ASC' ? -1 : 1;
              }

              if (rightComparable === undefined) {
                return direction === 'ASC' ? 1 : -1;
              }

              return leftComparable > rightComparable
                ? direction === 'ASC'
                  ? 1
                  : -1
                : direction === 'ASC'
                  ? -1
                  : 1;
            }

            return 0;
          });
        }

        return matches[0] ?? null;
      },
    ),
    update: jest.fn(
      async (criteria: Partial<T> | Partial<T>[], value: Partial<T>) => {
        const criteriaList = Array.isArray(criteria) ? criteria : [criteria];
        const matchesValue = (itemValue: unknown, expected: unknown) => {
          if (
            expected &&
            typeof expected === 'object' &&
            ('_type' in expected || 'type' in expected)
          ) {
            const operator = expected as {
              _type?: string;
              type?: string;
              _value?: unknown;
              value?: unknown;
            };
            const type = operator._type ?? operator.type;
            const value = operator._value ?? operator.value;

            if (type === 'isNull') {
              return itemValue === null || itemValue === undefined;
            }

            if (type === 'lessThanOrEqual') {
              return (
                itemValue instanceof Date &&
                value instanceof Date &&
                itemValue.getTime() <= value.getTime()
              );
            }
          }

          return itemValue === expected;
        };
        const matchesCriteria = (item: T, where: Partial<T>) =>
          Object.entries(where).every(([key, expected]) =>
            matchesValue(item[key], expected),
          );
        const matched = items.filter((item) =>
          criteriaList.some((where) => matchesCriteria(item, where)),
        );

        matched.forEach((item) => Object.assign(item, value));
        return { affected: matched.length };
      },
    ),
    count: jest.fn(async () => items.length),
  });

  const makeBlockedBrokerAdapterStatus = () => ({
    provider: 'toss',
    configured: false,
    readOnlyEnabled: false,
    paperTradingEnabled: false,
    liveTradingEnabled: false,
    authMethod: 'oauth2_client_credentials',
    credentialRef: 'missing',
    credentialCustody: {
      mode: 'missing',
      configured: false,
      productionReady: false,
      secretRef: 'missing',
      detail: 'External secret custody is required.',
    },
    schemaVerified: false,
    sandboxVerified: false,
    readOnlyPoll: {
      provider: 'toss',
      enabled: false,
      configured: false,
      schemaVerified: false,
      canPoll: false,
      canPollFills: false,
      baseUrl: 'https://openapi.tossinvest.com',
      accountRef: 'missing',
      allowedEndpoints: [],
      cron: '*/5 * * * *',
      running: false,
      brokerExecutionEnabled: false,
      liveTradingEnabled: false,
    },
    emergencyControls: {
      runtimeKillSwitchReady: true,
      brokerCancelReady: false,
      brokerFlattenReady: false,
      openOrderPollingReady: false,
      brokerWriteEnabled: false,
      dryRunOnly: true,
      checkedAt: new Date().toISOString(),
      blockers: [],
      detail:
        'Runtime stop can halt autonomous advancement, but broker-order cancel/flatten emergency controls are not implemented.',
    },
    capabilities: [],
    blockers: [],
    brokerExecutionEnabled: false,
  });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-23T00:00:00.000Z'));
    delete process.env.TYPEORM_SYNCHRONIZE;
    delete process.env.TYPEORM_MIGRATIONS_RUN;
    budgets = [];
    brokerFills = [];
    brokerOrderCommands = [];
    brokerOrderStatuses = [];
    brokerSnapshots = [];
    fundingReadinessRecords = [];
    livePilotReadinessRecords = [];
    orderPlanApprovals = [];
    researchRuns = [];
    marketDataBars = [];
    proposals = [];
    paperAccounts = [];
    paperAccountEvents = [];
    paperOrderPlans = [];
    paperReservationHolds = [];
    executionControlStates = [];
    evaluations = [];
    runs = [];
    runSchedules = [];
    service = new ControlPlaneService(
      makeRepository(budgets) as any,
      makeRepository(brokerFills) as any,
      makeRepository(brokerOrderCommands) as any,
      makeRepository(brokerOrderStatuses) as any,
      makeRepository(brokerSnapshots) as any,
      makeRepository(fundingReadinessRecords) as any,
      makeRepository(livePilotReadinessRecords) as any,
      makeRepository(proposals) as any,
      makeRepository(marketDataBars) as any,
      makeRepository(orderPlanApprovals) as any,
      makeRepository(researchRuns) as any,
      makeRepository(paperAccounts) as any,
      makeRepository(paperAccountEvents) as any,
      makeRepository(paperOrderPlans) as any,
      makeRepository(paperReservationHolds) as any,
      makeRepository(executionControlStates) as any,
      makeRepository(evaluations) as any,
      makeRepository(runs) as any,
      makeRepository(runSchedules) as any,
      new RiskGateService(),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a budget envelope that cannot enable live trading', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Aggressive dry run',
      totalBudget: 10_000_000,
      policy: { allowLiveTrading: true },
    });

    expect(budget.status).toBe('active');
    expect(budget.brokerExecutionEnabled).toBe(false);
    expect(budget.liveTradingEnabled).toBe(false);
    expect(budget.policy.allowLiveTrading).toBe(false);
  });

  it('explicitly seeds a paper account with an append-only event', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Seed budget',
      totalBudget: 10_000_000,
    });

    const account = await service.seedPaperAccount({
      budgetEnvelopeId: budget.id,
      cash: 9_000_000,
      positions: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          marketValue: 1_000_000,
          weightPct: 10,
        },
      ],
      actor: 'unit-test-operator',
      reason: 'Seed the paper account before execution.',
      idempotencyKey: 'seed-paper-account-1',
    });

    expect(account).toEqual(
      expect.objectContaining({
        budgetEnvelopeId: budget.id,
        status: 'seeded',
        cash: 9_000_000,
        equity: 10_000_000,
        grossExposurePct: 10,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(paperAccountEvents).toHaveLength(1);
    expect(paperAccountEvents[0]).toEqual(
      expect.objectContaining({
        paperAccountId: account.id,
        eventType: 'explicit_seed',
        sequence: 1,
        cashBefore: 0,
        cashAfter: 9_000_000,
        equityAfter: 10_000_000,
        idempotencyKey: 'seed-paper-account-1',
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(paperAccountEvents[0].eventHash).toMatch(/^sha256:/);

    const replayed = await service.seedPaperAccount({
      budgetEnvelopeId: budget.id,
      cash: 9_000_000,
      positions: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          marketValue: 1_000_000,
          weightPct: 10,
        },
      ],
      actor: 'unit-test-operator',
      reason: 'Seed the paper account before execution.',
      idempotencyKey: 'seed-paper-account-1',
    });
    expect(replayed.id).toBe(account.id);
    expect(paperAccountEvents).toHaveLength(1);

    const promoted = await service.promotePaperAccount(account.id, {
      actor: 'unit-test-operator',
      reason: 'Promote seeded account for paper execution.',
      idempotencyKey: 'promote-paper-account-1',
      expectedEventHash: paperAccountEvents[0].eventHash,
    });
    expect(promoted.status).toBe('active');
    expect(paperAccountEvents).toHaveLength(2);
    expect(paperAccountEvents[1]).toEqual(
      expect.objectContaining({
        eventType: 'account_promoted',
        sequence: 2,
        previousEventHash: paperAccountEvents[0].eventHash,
      }),
    );

    await expect(
      service.seedPaperAccount({
        budgetEnvelopeId: budget.id,
        cash: 10_000_000,
        actor: 'unit-test-operator',
        reason: 'Duplicate active seed.',
        idempotencyKey: 'seed-paper-account-2',
      }),
    ).rejects.toThrow('already exists');
  });

  it('stores a proposal and persists the risk evaluation result', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Dry run',
      totalBudget: 10_000_000,
    });
    const researchRun = await service.createResearchRun({
      budgetEnvelopeId: budget.id,
      objective: 'Find a liquid long-only dry-run allocation',
      strategyFamily: 'momentum',
      hypothesis: 'Large cap momentum can outperform the benchmark.',
      datasetRefs: [
        {
          id: 'krx-daily-bars',
          source: 'sample',
          windowStart: '2025-01-01',
          windowEnd: '2026-05-22',
          availabilityTimestamp: '2026-05-22T23:50:00.000Z',
          marketDataTimestamp: '2026-05-22T23:50:00.000Z',
        },
      ],
      featureRefs: ['close_20d_return', 'volatility_20d'],
      timestampLagRules: ['Signals use only data available before close.'],
      noLookaheadChecked: true,
      benchmark: 'KOSPI',
      costModel: '10bps fixed commission and tax estimate',
      slippageModel: '5bps notional slippage',
      validationWindow: {
        start: '2026-01-01',
        end: '2026-05-22',
      },
      backtestMetrics: {
        totalReturnPct: 8.2,
        benchmarkReturnPct: 3.1,
        maxDrawdownPct: 4.3,
        sharpeRatio: 1.1,
        turnoverPct: 22,
        tradeCount: 12,
      },
      artifactRefs: ['artifacts/research-runs/momentum-v1/report.md'],
      artifactHashes: {
        'artifacts/research-runs/momentum-v1/report.md': 'sha256:test',
      },
      knownFailureModes: ['Trend reversal can cause delayed exits.'],
    });
    const proposal = await service.createProposal({
      budgetEnvelopeId: budget.id,
      researchRunId: researchRun.id,
      strategyId: 'momentum-v1',
      ruleId: 'long-only-breakout',
      generatedAt: '2026-05-22T23:59:00.000Z',
      marketDataTimestamp: '2026-05-22T23:55:00.000Z',
      portfolioSnapshot: {
        currency: 'KRW',
        equity: 10_000_000,
        cash: 10_000_000,
        grossExposurePct: 0,
      },
      orders: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          side: 'BUY',
          orderType: 'MARKET',
          notional: 500_000,
          targetPositionPct: 5,
        },
      ],
      thesis: 'Simple test proposal',
    });

    const evaluation = await service.evaluateProposal(proposal.id);

    expect(evaluation.decision).toBe('ALLOW');
    expect(evaluation.brokerExecutionEnabled).toBe(false);
    expect(evaluation.requestSnapshot.researchRunId).toBe(researchRun.id);
    expect(evaluations).toHaveLength(1);
    expect(proposals[0].status).toBe('evaluated');
    expect(researchRuns[0].status).toBe('proposal_ready');
    expect(researchRuns[0].phase).toBe('proposal_linked');
  });

  it('simulates paper execution only after an ALLOW risk evaluation', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Paper budget',
      totalBudget: 10_000_000,
    });
    const seededAccount = await service.seedPaperAccount({
      budgetEnvelopeId: budget.id,
      cash: 10_000_000,
      actor: 'unit-test-operator',
      reason: 'Seed paper account before paper execution.',
      idempotencyKey: 'seed-paper-budget-1',
    });
    await service.promotePaperAccount(seededAccount.id, {
      actor: 'unit-test-operator',
      reason: 'Promote paper account before paper execution.',
      idempotencyKey: 'promote-paper-budget-1',
      expectedEventHash: paperAccountEvents[0].eventHash,
    });
    const researchRun = await service.createResearchRun({
      budgetEnvelopeId: budget.id,
      objective: 'Paper execution research run',
      strategyFamily: 'momentum',
      hypothesis: 'Paper execution should simulate fills after risk approval.',
      datasetRefs: [
        {
          id: 'krx-daily-bars',
          source: 'sample',
          windowStart: '2025-01-01',
          windowEnd: '2026-05-22',
          availabilityTimestamp: '2026-05-22T23:50:00.000Z',
          marketDataTimestamp: '2026-05-22T23:50:00.000Z',
        },
      ],
      featureRefs: ['close_20d_return'],
      timestampLagRules: ['Signals use only data available before close.'],
      noLookaheadChecked: true,
      benchmark: 'KOSPI',
      costModel: '10bps fixed commission and tax estimate',
      slippageModel: '5bps notional slippage',
      validationWindow: {
        start: '2026-01-01',
        end: '2026-05-22',
      },
      backtestMetrics: {
        totalReturnPct: 8.2,
        benchmarkReturnPct: 3.1,
        maxDrawdownPct: 4.3,
        sharpeRatio: 1.1,
        turnoverPct: 22,
        tradeCount: 12,
      },
      artifactRefs: ['artifacts/research-runs/paper/report.md'],
      artifactHashes: {
        'artifacts/research-runs/paper/report.md': 'sha256:test',
      },
      knownFailureModes: ['Trend reversal can cause delayed exits.'],
    });
    const proposal = await service.createProposal({
      budgetEnvelopeId: budget.id,
      researchRunId: researchRun.id,
      strategyId: 'momentum-v1',
      ruleId: 'long-only-breakout',
      generatedAt: '2026-05-22T23:59:00.000Z',
      marketDataTimestamp: '2026-05-22T23:55:00.000Z',
      portfolioSnapshot: {
        currency: 'KRW',
        equity: 10_000_000,
        cash: 10_000_000,
        grossExposurePct: 0,
      },
      orders: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          side: 'BUY',
          orderType: 'MARKET',
          notional: 500_000,
          targetPositionPct: 5,
        },
      ],
      thesis: 'Paper execution test proposal',
    });

    await service.evaluateProposal(proposal.id);
    const approval = await service.createOrderPlanApproval(proposal.id, {
      idempotencyKey: 'paper-test-1',
      approver: 'unit-test-operator',
      reason: 'Approve the first paper execution cycle.',
      expectedPaperAccountEventHash: paperAccountEvents[1].eventHash,
    });
    const replayedApproval = await service.createOrderPlanApproval(
      proposal.id,
      {
        idempotencyKey: 'paper-test-1',
        approver: 'unit-test-operator',
        reason: 'Approve the first paper execution cycle.',
        expectedPaperAccountEventHash: paperAccountEvents[1].eventHash,
      },
    );

    expect(replayedApproval.id).toBe(approval.id);
    expect(approval).toEqual(
      expect.objectContaining({
        paperAccountId: seededAccount.id,
        paperAccountEventHash: paperAccountEvents[1].eventHash,
        paperAccountEventSequence: 2,
        custodyMode: 'local_hash_signature',
        signerKeyRef: 'local-paper-approval-key-v1',
        canonicalPayloadHash: expect.stringMatching(/^sha256:/),
        signature: expect.stringMatching(/^sha256:/),
      }),
    );
    expect(approval.approvalSnapshot).toEqual(
      expect.objectContaining({
        paperAccountId: seededAccount.id,
        paperAccountEventHash: paperAccountEvents[1].eventHash,
        paperAccountEventSequence: 2,
        custodyMode: 'local_hash_signature',
        signerKeyRef: 'local-paper-approval-key-v1',
        canonicalPayloadHash: approval.canonicalPayloadHash,
        signature: approval.signature,
      }),
    );
    await expect(
      service.createOrderPlanApproval(proposal.id, {
        idempotencyKey: 'paper-test-1',
        approver: 'unit-test-operator',
        reason: 'Changed approval reason.',
        expectedPaperAccountEventHash: paperAccountEvents[1].eventHash,
      }),
    ).rejects.toThrow('was already used with a different signed payload');
    const plan = await service.paperExecuteProposal(proposal.id, {
      idempotencyKey: 'paper-test-1',
      orderPlanApprovalId: approval.id,
    });

    expect(plan.status).toBe('filled');
    expect(plan.riskEvaluationId).toBe(evaluations[1].id);
    expect(plan.orderPlanApprovalId).toBe(approval.id);
    expect(plan.idempotencyKey).toBe('paper-test-1');
    expect(plan.proposalHash).toMatch(/^sha256:/);
    expect(plan.riskRequestHash).toMatch(/^sha256:/);
    expect(plan.planHash).toMatch(/^sha256:/);
    expect(plan.readinessSnapshot).toEqual(
      expect.objectContaining({
        latestRiskAllow: true,
        riskMatchesProposal: true,
        brokerExecutionDisabled: true,
        liveTradingDisabled: true,
        approvalCustodyVerified: true,
        accountEventFresh: true,
        approvalPaperAccountEventHash: paperAccountEvents[1].eventHash,
        currentPaperAccountEventHash: paperAccountEvents[1].eventHash,
        paperAccountEventSequence: 2,
        paperAccountLockVersion: 0,
        cashSufficient: true,
        noDuplicatePlan: true,
      }),
    );
    expect(plan.brokerExecutionEnabled).toBe(false);
    expect(plan.liveTradingEnabled).toBe(false);
    expect(plan.paperAccountId).toBeDefined();
    expect(plan.reservationHold).toEqual(
      expect.objectContaining({
        status: 'consumed',
        idempotencyKey: 'paper-test-1',
        cashAmount: 500_750,
        availableCashAtHold: 10_000_000,
        holdHash: expect.stringMatching(/^sha256:/),
        paperAccountEventHashAtHold: paperAccountEvents[1].eventHash,
        paperAccountEventSequenceAtHold: 2,
        accountLockVersionAtHold: 0,
        approvalCustodyVerifiedAtHold: true,
        consumedAt: '2026-05-23T00:00:00.000Z',
      }),
    );
    expect(paperReservationHolds).toHaveLength(1);
    expect(paperReservationHolds[0]).toEqual(
      expect.objectContaining({
        holdId: plan.reservationHold?.holdId,
        paperAccountId: plan.paperAccountId,
        proposalId: proposal.id,
        paperOrderPlanId: plan.id,
        status: 'consumed',
        cashAmount: 500_750,
        holdHash: plan.reservationHold?.holdHash,
        consumedAt: new Date('2026-05-23T00:00:00.000Z'),
      }),
    );
    expect(plan.orders).toHaveLength(1);
    expect(plan.orders[0]).toEqual(
      expect.objectContaining({
        paperOrderId: 'paper-order:1:0',
        proposalOrderIndex: 0,
        feeModelRef: 'fixed-10bps-paper-fee-v1',
        slippageModelRef: 'fixed-5bps-paper-slippage-v1',
      }),
    );
    expect(plan.fills).toHaveLength(1);
    expect(plan.fills[0]).toEqual(
      expect.objectContaining({
        paperFillId: 'paper-order:1:0:fill:0',
        paperOrderId: 'paper-order:1:0',
        symbol: '005930',
        quantity: 500_000,
        fillPrice: 1,
        grossNotional: 500_000,
        requestedNotional: 500_000,
        filledNotional: 500_000,
        fee: 500,
        feeCurrency: 'KRW',
        slippage: 250,
        netCashDelta: -500_750,
        costBasisBefore: 0,
        costBasisAfter: 500_750,
        realizedPnl: 0,
        realizedPnlAfter: 0,
        status: 'filled',
      }),
    );
    expect(plan.cashLedger).toEqual([
      expect.objectContaining({
        amount: -500_750,
        balanceAfter: 9_499_250,
      }),
    ]);
    expect(plan.positionLedger).toEqual([
      expect.objectContaining({
        symbol: '005930',
        quantityDelta: 500_000,
        notionalDelta: 500_000,
        quantityAfter: 500_000,
        positionNotionalAfter: 500_000,
        averagePriceAfter: 1,
        costBasisAfter: 500_750,
        realizedPnl: 0,
      }),
    ]);
    expect(plan.endingCash).toBe(9_499_250);
    expect(plan.endingEquity).toBe(9_999_250);
    expect(plan.reconciliation.status).toBe('pending');
    expect(plan.reconciliation.cashMatched).toBe(false);
    expect(plan.reconciliation.expectedCash).toBe(9_499_250);
    expect(paperAccounts[0]).toEqual(
      expect.objectContaining({
        lockVersion: 1,
        latestEventHash: paperAccountEvents[2].eventHash,
        latestEventSequence: 3,
      }),
    );
    expect(plan.killSwitchSnapshot).toEqual(
      expect.objectContaining({
        armed: true,
        tripped: false,
      }),
    );
    expect(proposals[0].status).toBe('paper_ready');
    expect(evaluations).toHaveLength(2);
    expect(evaluations[1].responseSnapshot.mode).toBe('paper');
    expect(evaluations[1].decision).toBe('ALLOW');
    expect(orderPlanApprovals).toHaveLength(1);
    expect(orderPlanApprovals[0]).toEqual(
      expect.objectContaining({
        status: 'consumed',
        consumedByPaperOrderPlanId: plan.id,
        canonicalPayloadHash: approval.canonicalPayloadHash,
        signature: approval.signature,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(paperAccounts).toHaveLength(1);
    expect(plan.paperAccountId).toBe(paperAccounts[0].id);
    expect(paperAccounts[0]).toEqual(
      expect.objectContaining({
        budgetEnvelopeId: budget.id,
        cash: 9_499_250,
        equity: 9_999_250,
        grossExposurePct: 5,
        lastAppliedPlanId: plan.id,
      }),
    );
    expect(paperAccounts[0].positions).toEqual([
      expect.objectContaining({
        symbol: '005930',
        marketValue: 500_000,
        weightPct: 5,
        quantity: 500_000,
        costBasis: 500_750,
        unrealizedPnl: -750,
      }),
    ]);
    expect(paperAccounts[0].cashLedger).toHaveLength(1);
    expect(paperAccounts[0].positionLedger).toHaveLength(1);
    expect(paperAccounts[0].appliedPlanIds).toEqual([plan.id]);
    expect(paperAccountEvents).toEqual([
      expect.objectContaining({
        eventType: 'explicit_seed',
        sequence: 1,
        cashAfter: 10_000_000,
        eventHash: expect.stringMatching(/^sha256:/),
      }),
      expect.objectContaining({
        eventType: 'account_promoted',
        sequence: 2,
        previousEventHash: paperAccountEvents[0].eventHash,
        eventHash: expect.stringMatching(/^sha256:/),
      }),
      expect.objectContaining({
        eventType: 'paper_order_plan',
        sourceId: plan.id,
        sequence: 3,
        cashBefore: 10_000_000,
        cashAfter: 9_499_250,
        previousEventHash: paperAccountEvents[1].eventHash,
        eventHash: expect.stringMatching(/^sha256:/),
      }),
    ]);

    const idempotentReplay = await service.paperExecuteProposal(proposal.id, {
      idempotencyKey: 'paper-test-1',
    });
    expect(idempotentReplay.id).toBe(plan.id);
    expect(paperAccounts[0].appliedPlanIds).toEqual([plan.id]);
    expect(paperAccountEvents).toHaveLength(3);

    const reconciled = await service.reconcilePaperOrderPlan(plan.id, {
      notes: ['Unit test reconciliation.'],
    });
    expect(reconciled.status).toBe('reconciled');
    expect(reconciled.reconciliation.status).toBe('matched');
    expect(reconciled.reconciliation.cashMatched).toBe(true);
    expect(reconciled.reconciliation.positionsMatched).toBe(true);
    expect(paperAccounts[0].lastReconciledAt).toBeDefined();

    const secondProposal = await service.createProposal({
      budgetEnvelopeId: budget.id,
      researchRunId: researchRun.id,
      strategyId: 'momentum-v1',
      ruleId: 'long-only-breakout',
      generatedAt: '2026-05-22T23:59:30.000Z',
      marketDataTimestamp: '2026-05-22T23:55:00.000Z',
      portfolioSnapshot: {
        currency: 'KRW',
        equity: 10_000_000,
        cash: 10_000_000,
        grossExposurePct: 0,
      },
      orders: [
        {
          symbol: '000660',
          assetClass: 'domestic_stock',
          side: 'BUY',
          orderType: 'MARKET',
          notional: 250_000,
          targetPositionPct: 2.5,
        },
      ],
      thesis: 'Second paper cycle should start from durable paper account.',
    });
    expect(paperAccounts[0].cash).toBe(9_499_250);

    const secondApproval = await service.createOrderPlanApproval(
      secondProposal.id,
      {
        idempotencyKey: 'paper-test-2',
        approver: 'unit-test-operator',
        reason: 'Approve the second paper execution cycle.',
        expectedPaperAccountEventHash: paperAccountEvents[2].eventHash,
      },
    );
    const secondPlan = await service.paperExecuteProposal(secondProposal.id, {
      idempotencyKey: 'paper-test-2',
      orderPlanApprovalId: secondApproval.id,
    });
    expect(secondProposal.budgetEnvelopeId).toBe(budget.id);
    expect(paperAccounts).toHaveLength(1);
    expect(secondProposal.id).toBe(2);
    expect(secondPlan.proposalId).toBe(secondProposal.id);
    expect(secondPlan.paperAccountId).toBe(paperAccounts[0].id);
    expect(secondPlan.startingCash).toBe(9_499_250);
    expect(secondPlan.endingCash).toBe(9_248_875);
    expect(evaluations[2].requestSnapshot.portfolio.cash).toBe(9_499_250);
    expect(evaluations[2].requestSnapshot.portfolio.positions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: '005930',
          marketValue: 500_000,
        }),
      ]),
    );
    expect(paperAccounts[0].cash).toBe(9_248_875);
    expect(paperAccounts[0].appliedPlanIds).toEqual([plan.id, secondPlan.id]);
    expect(paperAccountEvents).toHaveLength(4);
    expect(paperAccountEvents[3]).toEqual(
      expect.objectContaining({
        eventType: 'paper_order_plan',
        sourceId: secondPlan.id,
        sequence: 4,
        cashBefore: 9_499_250,
        cashAfter: 9_248_875,
        previousEventHash: paperAccountEvents[2].eventHash,
      }),
    );
    expect(paperAccounts[0].positions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: '005930',
          marketValue: 500_000,
        }),
        expect.objectContaining({
          symbol: '000660',
          marketValue: 250_000,
        }),
      ]),
    );
  });

  it('blocks paper execution when the signed approval account event is stale', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Stale approval budget',
      totalBudget: 10_000_000,
    });
    const seededAccount = await service.seedPaperAccount({
      budgetEnvelopeId: budget.id,
      cash: 10_000_000,
      actor: 'unit-test-operator',
      reason: 'Seed paper account before stale approval test.',
      idempotencyKey: 'seed-stale-approval-account',
    });
    await service.promotePaperAccount(seededAccount.id, {
      actor: 'unit-test-operator',
      reason: 'Promote paper account before stale approval test.',
      idempotencyKey: 'promote-stale-approval-account',
      expectedEventHash: paperAccountEvents[0].eventHash,
    });
    const researchRun = await service.runBaselineResearch({
      budgetEnvelopeId: budget.id,
    });
    const proposal = await service.createProposal({
      budgetEnvelopeId: budget.id,
      researchRunId: researchRun.id,
      strategyId: 'stale-approval-v1',
      ruleId: 'account-event-freshness',
      generatedAt: '2026-05-22T23:59:00.000Z',
      marketDataTimestamp: '2026-05-22T23:55:00.000Z',
      portfolioSnapshot: {
        currency: 'KRW',
        equity: 10_000_000,
        cash: 10_000_000,
        grossExposurePct: 0,
      },
      orders: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          side: 'BUY',
          orderType: 'MARKET',
          notional: 500_000,
          targetPositionPct: 5,
        },
      ],
    });
    const approval = await service.createOrderPlanApproval(proposal.id, {
      idempotencyKey: 'stale-account-event-plan',
      approver: 'unit-test-operator',
      reason: 'Approve before an account event advances.',
      expectedPaperAccountEventHash: paperAccountEvents[1].eventHash,
    });
    const previousEvent = paperAccountEvents[1];
    const advancedEventHash = 'sha256:advanced-account-event';
    paperAccountEvents.push({
      ...previousEvent,
      id: 3,
      eventType: 'reconciliation',
      idempotencyKey: 'advance-account-event-after-approval',
      actor: 'unit-test-operator',
      reason: 'Account event advanced after approval.',
      sequence: 3,
      previousEventHash: previousEvent.eventHash,
      requestHash: 'sha256:advanced-account-request',
      eventHash: advancedEventHash,
      eventSnapshot: {
        ...previousEvent.eventSnapshot,
        eventType: 'reconciliation',
        idempotencyKey: 'advance-account-event-after-approval',
        actor: 'unit-test-operator',
        reason: 'Account event advanced after approval.',
        sequence: 3,
        previousEventHash: previousEvent.eventHash,
        requestHash: 'sha256:advanced-account-request',
        recordedAt: '2026-05-23T00:00:00.000Z',
      },
      createdAt: new Date('2026-05-23T00:00:01.000Z'),
    } as PaperAccountEvent);
    const replayedApproval = await service.createOrderPlanApproval(
      proposal.id,
      {
        idempotencyKey: 'stale-account-event-plan',
        approver: 'unit-test-operator',
        reason: 'Approve before an account event advances.',
        expectedPaperAccountEventHash: previousEvent.eventHash,
      },
    );

    const plan = await service.paperExecuteProposal(proposal.id, {
      idempotencyKey: 'stale-account-event-plan',
      orderPlanApprovalId: approval.id,
    });

    expect(replayedApproval.id).toBe(approval.id);
    expect(plan.status).toBe('blocked');
    expect(plan.fills).toHaveLength(0);
    expect(plan.blockedReasons).toContain(
      'Signed order-plan approval paper account event hash is stale',
    );
    expect(plan.readinessSnapshot).toEqual(
      expect.objectContaining({
        approvalCustodyVerified: true,
        accountEventFresh: false,
        approvalPaperAccountEventHash: paperAccountEvents[1].eventHash,
        currentPaperAccountEventHash: advancedEventHash,
        paperAccountEventSequence: 3,
      }),
    );
    expect(orderPlanApprovals[0].status).toBe('active');
    expect(paperAccounts[0].cash).toBe(10_000_000);
  });

  it('blocks paper account apply when the event chain advances after readiness checks', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Pre-apply guard budget',
      totalBudget: 10_000_000,
    });
    const seededAccount = await service.seedPaperAccount({
      budgetEnvelopeId: budget.id,
      cash: 10_000_000,
      actor: 'unit-test-operator',
      reason: 'Seed paper account before pre-apply guard test.',
      idempotencyKey: 'seed-pre-apply-guard-account',
    });
    await service.promotePaperAccount(seededAccount.id, {
      actor: 'unit-test-operator',
      reason: 'Promote paper account before pre-apply guard test.',
      idempotencyKey: 'promote-pre-apply-guard-account',
      expectedEventHash: paperAccountEvents[0].eventHash,
    });
    const researchRun = await service.runBaselineResearch({
      budgetEnvelopeId: budget.id,
    });
    const proposal = await service.createProposal({
      budgetEnvelopeId: budget.id,
      researchRunId: researchRun.id,
      strategyId: 'pre-apply-guard-v1',
      ruleId: 'account-event-final-check',
      generatedAt: '2026-05-22T23:59:00.000Z',
      marketDataTimestamp: '2026-05-22T23:55:00.000Z',
      portfolioSnapshot: {
        currency: 'KRW',
        equity: 10_000_000,
        cash: 10_000_000,
        grossExposurePct: 0,
      },
      orders: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          side: 'BUY',
          orderType: 'MARKET',
          notional: 500_000,
          targetPositionPct: 5,
        },
      ],
    });
    const approval = await service.createOrderPlanApproval(proposal.id, {
      idempotencyKey: 'pre-apply-account-event-plan',
      approver: 'unit-test-operator',
      reason: 'Approve before the final account event check.',
      expectedPaperAccountEventHash: paperAccountEvents[1].eventHash,
    });
    const originalGetLatestPaperAccountEvent = (
      service as unknown as {
        getLatestPaperAccountEvent: (
          paperAccountId: number,
        ) => Promise<PaperAccountEvent | null>;
      }
    ).getLatestPaperAccountEvent.bind(service);
    let latestEventLookupCount = 0;
    jest
      .spyOn(
        service as unknown as {
          getLatestPaperAccountEvent: (
            paperAccountId: number,
          ) => Promise<PaperAccountEvent | null>;
        },
        'getLatestPaperAccountEvent',
      )
      .mockImplementation(async (paperAccountId: number) => {
        latestEventLookupCount += 1;
        const event = await originalGetLatestPaperAccountEvent(paperAccountId);

        if (latestEventLookupCount === 2 && event) {
          paperAccountEvents.push({
            ...event,
            id: 3,
            eventType: 'reconciliation',
            idempotencyKey: 'advance-account-event-before-apply',
            actor: 'unit-test-operator',
            reason: 'Account event advanced before paper account apply.',
            sequence: 3,
            previousEventHash: event.eventHash,
            requestHash: 'sha256:pre-apply-account-request',
            eventHash: 'sha256:pre-apply-account-event',
            eventSnapshot: {
              ...event.eventSnapshot,
              eventType: 'reconciliation',
              idempotencyKey: 'advance-account-event-before-apply',
              actor: 'unit-test-operator',
              reason: 'Account event advanced before paper account apply.',
              sequence: 3,
              previousEventHash: event.eventHash,
              requestHash: 'sha256:pre-apply-account-request',
              recordedAt: '2026-05-23T00:00:00.000Z',
            },
            createdAt: new Date('2026-05-23T00:00:01.000Z'),
          } as PaperAccountEvent);
        }

        return originalGetLatestPaperAccountEvent(paperAccountId);
      });

    const plan = await service.paperExecuteProposal(proposal.id, {
      idempotencyKey: 'pre-apply-account-event-plan',
      orderPlanApprovalId: approval.id,
    });

    expect(plan.status).toBe('blocked');
    expect(plan.blockedReasons).toContain(
      'Paper account event changed before account apply',
    );
    expect(plan.fills).toHaveLength(0);
    expect(plan.cashLedger).toHaveLength(0);
    expect(plan.positionLedger).toHaveLength(0);
    expect(plan.endingCash).toBe(10_000_000);
    expect(plan.reservationHold).toEqual(
      expect.objectContaining({
        status: 'released',
        releasedAt: '2026-05-23T00:00:00.000Z',
      }),
    );
    expect(paperReservationHolds[0]).toEqual(
      expect.objectContaining({
        status: 'released',
        paperOrderPlanId: plan.id,
        releasedAt: new Date('2026-05-23T00:00:00.000Z'),
      }),
    );
    expect(orderPlanApprovals[0].status).toBe('active');
    expect(paperAccounts[0].cash).toBe(10_000_000);
    expect(paperAccountEvents).toHaveLength(3);
  });

  it('blocks paper account apply when the account lock version advances after readiness checks', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Pre-apply lock budget',
      totalBudget: 10_000_000,
    });
    const seededAccount = await service.seedPaperAccount({
      budgetEnvelopeId: budget.id,
      cash: 10_000_000,
      actor: 'unit-test-operator',
      reason: 'Seed paper account before lock guard test.',
      idempotencyKey: 'seed-pre-apply-lock-account',
    });
    await service.promotePaperAccount(seededAccount.id, {
      actor: 'unit-test-operator',
      reason: 'Promote paper account before lock guard test.',
      idempotencyKey: 'promote-pre-apply-lock-account',
      expectedEventHash: paperAccountEvents[0].eventHash,
    });
    const researchRun = await service.runBaselineResearch({
      budgetEnvelopeId: budget.id,
    });
    const proposal = await service.createProposal({
      budgetEnvelopeId: budget.id,
      researchRunId: researchRun.id,
      strategyId: 'pre-apply-lock-v1',
      ruleId: 'account-lock-final-check',
      generatedAt: '2026-05-22T23:59:00.000Z',
      marketDataTimestamp: '2026-05-22T23:55:00.000Z',
      portfolioSnapshot: {
        currency: 'KRW',
        equity: 10_000_000,
        cash: 10_000_000,
        grossExposurePct: 0,
      },
      orders: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          side: 'BUY',
          orderType: 'MARKET',
          notional: 500_000,
          targetPositionPct: 5,
        },
      ],
    });
    const approval = await service.createOrderPlanApproval(proposal.id, {
      idempotencyKey: 'pre-apply-account-lock-plan',
      approver: 'unit-test-operator',
      reason: 'Approve before the final account lock check.',
      expectedPaperAccountEventHash: paperAccountEvents[1].eventHash,
    });
    const originalGetLatestPaperAccountEvent = (
      service as unknown as {
        getLatestPaperAccountEvent: (
          paperAccountId: number,
        ) => Promise<PaperAccountEvent | null>;
      }
    ).getLatestPaperAccountEvent.bind(service);
    let latestEventLookupCount = 0;
    jest
      .spyOn(
        service as unknown as {
          getLatestPaperAccountEvent: (
            paperAccountId: number,
          ) => Promise<PaperAccountEvent | null>;
        },
        'getLatestPaperAccountEvent',
      )
      .mockImplementation(async (paperAccountId: number) => {
        latestEventLookupCount += 1;
        if (latestEventLookupCount === 2) {
          paperAccounts[0].lockVersion += 1;
        }

        return originalGetLatestPaperAccountEvent(paperAccountId);
      });

    const plan = await service.paperExecuteProposal(proposal.id, {
      idempotencyKey: 'pre-apply-account-lock-plan',
      orderPlanApprovalId: approval.id,
    });

    expect(plan.status).toBe('blocked');
    expect(plan.blockedReasons).toContain(
      'Paper account lock version changed before account apply',
    );
    expect(plan.fills).toHaveLength(0);
    expect(plan.cashLedger).toHaveLength(0);
    expect(plan.positionLedger).toHaveLength(0);
    expect(plan.endingCash).toBe(10_000_000);
    expect(plan.reservationHold).toEqual(
      expect.objectContaining({
        status: 'released',
        releasedAt: '2026-05-23T00:00:00.000Z',
      }),
    );
    expect(paperReservationHolds[0]).toEqual(
      expect.objectContaining({
        status: 'released',
        paperOrderPlanId: plan.id,
      }),
    );
    expect(orderPlanApprovals[0].status).toBe('active');
    expect(paperAccountEvents).toHaveLength(2);
  });

  it('blocks and rolls back paper account apply when account event append fails inside transaction', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Transactional apply budget',
      totalBudget: 10_000_000,
    });
    const seededAccount = await service.seedPaperAccount({
      budgetEnvelopeId: budget.id,
      cash: 10_000_000,
      actor: 'unit-test-operator',
      reason: 'Seed paper account before transactional apply test.',
      idempotencyKey: 'seed-transactional-apply-account',
    });
    await service.promotePaperAccount(seededAccount.id, {
      actor: 'unit-test-operator',
      reason: 'Promote paper account before transactional apply test.',
      idempotencyKey: 'promote-transactional-apply-account',
      expectedEventHash: paperAccountEvents[0].eventHash,
    });
    const researchRun = await service.runBaselineResearch({
      budgetEnvelopeId: budget.id,
    });
    const proposal = await service.createProposal({
      budgetEnvelopeId: budget.id,
      researchRunId: researchRun.id,
      strategyId: 'transactional-apply-v1',
      ruleId: 'account-event-append-rollback',
      generatedAt: '2026-05-22T23:59:00.000Z',
      marketDataTimestamp: '2026-05-22T23:55:00.000Z',
      portfolioSnapshot: {
        currency: 'KRW',
        equity: 10_000_000,
        cash: 10_000_000,
        grossExposurePct: 0,
      },
      orders: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          side: 'BUY',
          orderType: 'MARKET',
          notional: 500_000,
          targetPositionPct: 5,
        },
      ],
    });
    const approval = await service.createOrderPlanApproval(proposal.id, {
      idempotencyKey: 'transactional-apply-plan',
      approver: 'unit-test-operator',
      reason: 'Approve before transactional apply failure.',
      expectedPaperAccountEventHash: paperAccountEvents[1].eventHash,
    });
    const transaction = jest.fn(
      async (
        isolationOrCallback:
          | string
          | ((manager: { getRepository: (entity: any) => any }) => unknown),
        maybeCallback?: (manager: {
          getRepository: (entity: any) => any;
        }) => unknown,
      ) => {
        const snapshots = {
          paperAccounts: structuredClone(paperAccounts),
          paperAccountEvents: structuredClone(paperAccountEvents),
          paperOrderPlans: structuredClone(paperOrderPlans),
          paperReservationHolds: structuredClone(paperReservationHolds),
          orderPlanApprovals: structuredClone(orderPlanApprovals),
          proposals: structuredClone(proposals),
        };
        const restore = <T>(target: T[], values: T[]) => {
          target.splice(0, target.length, ...structuredClone(values));
        };
        const manager = {
          getRepository: (entity: any) => {
            if (entity === PaperAccount) {
              return makeRepository(paperAccounts);
            }

            if (entity === PaperAccountEvent) {
              const repository = makeRepository(paperAccountEvents);

              return {
                ...repository,
                save: jest.fn(async (value: PaperAccountEvent) => {
                  if (value.eventType === 'paper_order_plan') {
                    throw new Error('simulated event append failure');
                  }

                  return repository.save(value);
                }),
              };
            }

            if (entity === PaperOrderPlan) {
              return makeRepository(paperOrderPlans);
            }

            if (entity === PaperReservationHoldRecord) {
              return makeRepository(paperReservationHolds);
            }

            if (entity === OrderPlanApproval) {
              return makeRepository(orderPlanApprovals);
            }

            if (entity === InvestmentProposal) {
              return makeRepository(proposals);
            }

            throw new Error(`Unexpected repository ${entity?.name}`);
          },
        };

        const callback =
          typeof isolationOrCallback === 'function'
            ? isolationOrCallback
            : maybeCallback;

        try {
          return await callback?.(manager);
        } catch (error) {
          restore(paperAccounts, snapshots.paperAccounts);
          restore(paperAccountEvents, snapshots.paperAccountEvents);
          restore(paperOrderPlans, snapshots.paperOrderPlans);
          restore(paperReservationHolds, snapshots.paperReservationHolds);
          restore(orderPlanApprovals, snapshots.orderPlanApprovals);
          restore(proposals, snapshots.proposals);
          throw error;
        }
      },
    );
    (
      service as unknown as {
        dataSource: { transaction: typeof transaction };
      }
    ).dataSource = { transaction };

    const plan = await service.paperExecuteProposal(proposal.id, {
      idempotencyKey: 'transactional-apply-plan',
      orderPlanApprovalId: approval.id,
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(plan.status).toBe('blocked');
    expect(plan.blockedReasons).toContain(
      'Paper account apply transaction failed: simulated event append failure',
    );
    expect(plan.fills).toHaveLength(0);
    expect(plan.cashLedger).toHaveLength(0);
    expect(plan.positionLedger).toHaveLength(0);
    expect(plan.reservationHold).toEqual(
      expect.objectContaining({
        status: 'released',
        releasedAt: '2026-05-23T00:00:00.000Z',
      }),
    );
    expect(paperReservationHolds).toHaveLength(0);
    expect(orderPlanApprovals[0].status).toBe('active');
    expect(paperAccounts[0].cash).toBe(10_000_000);
    expect(paperAccounts[0].appliedPlanIds).toEqual([]);
    expect(paperAccountEvents).toHaveLength(2);
    expect(
      paperAccountEvents.some(
        (event) => event.eventType === 'paper_order_plan',
      ),
    ).toBe(false);
  });

  it('generates a SELL-only recovery proposal from active paper positions', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Recovery paper budget',
      mode: 'paper',
      totalBudget: 10_000_000,
    });
    const seededAccount = await service.seedPaperAccount({
      budgetEnvelopeId: budget.id,
      cash: 6_500_000,
      positions: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          marketValue: 3_500_000,
          weightPct: 35,
        },
      ],
      actor: 'unit-test-operator',
      reason: 'Seed paper account with an oversized position.',
      idempotencyKey: 'seed-recovery-paper-account',
    });
    await service.promotePaperAccount(seededAccount.id, {
      actor: 'unit-test-operator',
      reason: 'Promote paper account before recovery.',
      idempotencyKey: 'promote-recovery-paper-account',
      expectedEventHash: paperAccountEvents[0].eventHash,
    });

    const recovery = await service.runRecoveryProposal({
      budgetEnvelopeId: budget.id,
      paperAccountId: seededAccount.id,
      maxPositions: 1,
    });

    expect(recovery.researchRun).toEqual(
      expect.objectContaining({
        strategyFamily: 'paper_recovery',
        status: 'proposal_ready',
        advanceEligible: true,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(recovery.proposal.orders).toEqual([
      expect.objectContaining({
        symbol: '005930',
        side: 'SELL',
        orderType: 'MARKET',
        notional: 1_000_000,
        targetPositionPct: 0,
      }),
    ]);
    expect(recovery.proposal.portfolioSnapshot.positions?.[0]).toEqual(
      expect.objectContaining({
        symbol: '005930',
        marketValue: 3_500_000,
      }),
    );
    expect(recovery.riskEvaluation.decision).toBe('REVIEW');
    expect(recovery.riskEvaluation.reasons).toContain(
      'Human approval is required outside dry-run mode',
    );

    const recoveryReplay = await service.runRecoveryProposal({
      budgetEnvelopeId: budget.id,
      paperAccountId: seededAccount.id,
      maxPositions: 1,
    });

    expect(recoveryReplay.researchRun.id).toBe(recovery.researchRun.id);
    expect(recoveryReplay.proposal.id).toBe(recovery.proposal.id);
    expect(recoveryReplay.riskEvaluation.id).toBe(recovery.riskEvaluation.id);
    expect(recovery.proposal.evidenceRefs).toEqual(
      expect.arrayContaining([expect.stringMatching(/^paper-recovery-state:/)]),
    );

    const approval = await service.createOrderPlanApproval(
      recovery.proposal.id,
      {
        idempotencyKey: 'paper-recovery-approval',
        approver: 'unit-test-operator',
        reason: 'Approve SELL-only recovery simulation.',
        expectedPaperAccountEventHash: paperAccountEvents[1].eventHash,
      },
    );
    const plan = await service.paperExecuteProposal(recovery.proposal.id, {
      idempotencyKey: 'paper-recovery-approval',
      orderPlanApprovalId: approval.id,
    });
    const recoveredAccount = await service.getPaperAccountState();

    expect(plan.status).toBe('filled');
    expect(plan.fills[0]).toEqual(
      expect.objectContaining({
        symbol: '005930',
        side: 'SELL',
        filledNotional: 1_000_000,
        netCashDelta: 998_500,
        costBasisBefore: 3_500_000,
        costBasisAfter: 2_500_000,
        realizedPnl: -1_500,
        realizedPnlAfter: -1_500,
      }),
    );
    expect(recoveredAccount.cash).toBe(7_498_500);
    expect(recoveredAccount.positions[0]).toEqual(
      expect.objectContaining({
        symbol: '005930',
        marketValue: 2_500_000,
        quantity: 2_500_000,
        costBasis: 2_500_000,
        realizedPnl: -1_500,
      }),
    );
    expect(recoveredAccount.brokerExecutionEnabled).toBe(false);
    expect(recoveredAccount.liveTradingEnabled).toBe(false);
  });

  it('imports a read-only broker snapshot and reconciles it against paper account state', async () => {
    paperAccounts.push({
      id: 1,
      name: 'Paper account',
      status: 'active',
      currency: 'KRW',
      cash: 9_500_000,
      equity: 10_000_000,
      grossExposurePct: 5,
      positions: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          marketValue: 500_000,
          weightPct: 5,
        },
      ],
      cashLedger: [],
      positionLedger: [],
      appliedPlanIds: [],
      brokerExecutionEnabled: false,
      liveTradingEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PaperAccount);

    const snapshot = await service.importBrokerSnapshot({
      provider: 'manual',
      accountRef: 'raw-account-id-must-be-hashed',
      sourceRef: 'operator-import',
      asOf: '2026-05-22T23:59:00.000Z',
      currency: 'KRW',
      cash: 9_500_000,
      equity: 10_000_000,
      positions: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          marketValue: 500_000,
          weightPct: 5,
        },
      ],
    });

    expect(snapshot.brokerExecutionEnabled).toBe(false);
    expect(snapshot.liveTradingEnabled).toBe(false);
    expect(snapshot.accountRefHash).toMatch(/^sha256:/);
    expect(snapshot).not.toHaveProperty('accountRef');
    expect(snapshot.reconciliation.status).toBe('not_checked');

    const reconciled = await service.reconcileBrokerSnapshot(snapshot.id, {
      tolerance: 0.01,
      maxAgeMinutes: 120,
      notes: ['Unit test broker reconciliation.'],
    });

    expect(reconciled.status).toBe('matched');
    expect(reconciled.reconciliation).toEqual(
      expect.objectContaining({
        status: 'matched',
        paperAccountId: paperAccounts[0].id,
        cashMatched: true,
        equityMatched: true,
        positionsMatched: true,
        cashDiff: 0,
        equityDiff: 0,
      }),
    );
  });

  it('records ready funding readiness from a matched broker snapshot', async () => {
    const snapshot = await service.importBrokerSnapshot({
      provider: 'manual',
      accountRef: 'funding-account-ref',
      sourceRef: 'operator-funding-import',
      asOf: '2026-05-22T23:59:00.000Z',
      currency: 'KRW',
      cash: 10_000_000,
      equity: 10_000_000,
      positions: [],
    });
    snapshot.status = 'matched';
    snapshot.reconciliation.status = 'matched';

    const readiness = await service.assessFundingReadiness(snapshot.id, {
      expectedDepositAmount: 10_000_000,
      maxAgeMinutes: 120,
      idempotencyKey: 'funding-ready-1',
      notes: ['Operator confirmed funding boundary.'],
    });

    expect(readiness.status).toBe('ready');
    expect(readiness.accountRefHash).toBe(snapshot.accountRefHash);
    expect(readiness.brokerSnapshotId).toBe(snapshot.id);
    expect(readiness.readinessSnapshot).toEqual(
      expect.objectContaining({
        expectedDepositAmount: 10_000_000,
        actualBrokerCash: 10_000_000,
        actualBrokerEquity: 10_000_000,
        brokerSnapshotReconciliationStatus: 'matched',
        cashSufficient: true,
        equitySufficient: true,
        currencyMatched: true,
        accountMatched: true,
        snapshotFresh: true,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
        blockers: [],
      }),
    );
    expect(readiness.brokerExecutionEnabled).toBe(false);
    expect(readiness.liveTradingEnabled).toBe(false);

    const status = await service.getStatus();
    expect(status.fundingReadiness).toEqual(
      expect.objectContaining({
        id: readiness.id,
        status: 'ready',
      }),
    );
    expect(status.readiness).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'fundingCapitalUsable',
          ready: true,
        }),
      ]),
    );
  });

  it('blocks funding readiness when broker truth does not match expected deposit', async () => {
    const snapshot = await service.importBrokerSnapshot({
      provider: 'manual',
      accountRef: 'funding-account-ref',
      sourceRef: 'operator-funding-import',
      asOf: '2026-05-22T20:00:00.000Z',
      currency: 'KRW',
      cash: 7_000_000,
      equity: 7_000_000,
      positions: [],
    });

    const readiness = await service.assessFundingReadiness(snapshot.id, {
      expectedDepositAmount: 10_000_000,
      maxAgeMinutes: 60,
      idempotencyKey: 'funding-blocked-1',
    });

    expect(readiness.status).toBe('blocked');
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        'Broker snapshot reconciliation is not matched',
        'Broker cash is below expected deposit',
        'Broker equity is below expected deposit',
        'Broker snapshot is stale',
      ]),
    );
    expect(readiness.readinessSnapshot.brokerExecutionEnabled).toBe(false);
    expect(readiness.readinessSnapshot.liveTradingEnabled).toBe(false);
  });

  it('rejects funding readiness requests that include raw account refs or order intent', async () => {
    const snapshot = await service.importBrokerSnapshot({
      provider: 'manual',
      accountRef: 'funding-account-ref',
      asOf: '2026-05-22T23:59:00.000Z',
      cash: 10_000_000,
      equity: 10_000_000,
      positions: [],
    });

    await expect(
      service.assessFundingReadiness(snapshot.id, {
        expectedDepositAmount: 10_000_000,
        accountRef: 'raw-account-ref',
      } as any),
    ).rejects.toThrow('Funding readiness cannot include accountRef');

    await expect(
      service.assessFundingReadiness(snapshot.id, {
        expectedDepositAmount: 10_000_000,
        orders: [],
      } as any),
    ).rejects.toThrow('Funding readiness cannot include orders');
  });

  it('records blocked broker-write pre-trade risk check before broker write controls exist', async () => {
    const snapshot = await service.importBrokerSnapshot({
      provider: 'manual',
      accountRef: 'pilot-account-ref',
      asOf: '2026-05-22T23:59:00.000Z',
      currency: 'KRW',
      cash: 10_000_000,
      equity: 10_000_000,
      positions: [],
    });
    snapshot.status = 'matched';
    snapshot.reconciliation.status = 'matched';
    const funding = await service.assessFundingReadiness(snapshot.id, {
      expectedDepositAmount: 10_000_000,
      maxAgeMinutes: 120,
      idempotencyKey: 'pilot-funding-ready-1',
    });

    const readiness = await service.assessLivePilotReadiness(
      {
        fundingReadinessId: funding.id,
        pilotBudgetAmount: 500_000,
        maxPilotBudgetAmount: 1_000_000,
        maxSingleOrderNotional: 100_000,
        idempotencyKey: 'live-pilot-blocked-1',
        notes: [
          'Operator requested broker-write pre-trade risk check evidence.',
        ],
      },
      {
        provider: 'toss',
        configured: false,
        readOnlyEnabled: false,
        paperTradingEnabled: false,
        liveTradingEnabled: false,
        authMethod: 'oauth2_client_credentials',
        credentialRef: 'missing',
        credentialCustody: {
          mode: 'missing',
          configured: false,
          productionReady: false,
          secretRef: 'missing',
          detail: 'External secret custody is required.',
        },
        schemaVerified: false,
        sandboxVerified: false,
        readOnlyPoll: {
          provider: 'toss',
          enabled: false,
          configured: false,
          schemaVerified: false,
          canPoll: false,
          canPollFills: false,
          baseUrl: 'https://openapi.tossinvest.com',
          accountRef: 'missing',
          allowedEndpoints: [],
          cron: '*/5 * * * *',
          running: false,
          brokerExecutionEnabled: false,
          liveTradingEnabled: false,
        },
        emergencyControls: {
          runtimeKillSwitchReady: true,
          brokerCancelReady: false,
          brokerFlattenReady: false,
          openOrderPollingReady: false,
          brokerWriteEnabled: false,
          dryRunOnly: true,
          checkedAt: new Date().toISOString(),
          blockers: [],
          detail:
            'Runtime stop can halt autonomous advancement, but broker-order cancel/flatten emergency controls are not implemented.',
        },
        capabilities: [],
        blockers: [],
        brokerExecutionEnabled: false,
      },
    );

    expect(readiness.status).toBe('blocked');
    expect(readiness.fundingReadinessId).toBe(funding.id);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        'Broker-write pre-trade risk check requires a budget envelope in live mode',
        'Production broker credential custody is not ready',
        'Broker OpenAPI schema is not verified',
        'Broker sandbox or paper environment is not verified',
        'Broker cancel/flatten/open-order emergency controls are not ready',
        'Live order endpoint is not implemented',
        'Broker write access is disabled',
        'Production signed order-plan custody is not implemented',
      ]),
    );
    expect(readiness.readinessSnapshot).toEqual(
      expect.objectContaining({
        fundingReady: true,
        orderEndpointImplemented: false,
        brokerWriteEnabled: false,
        productionApprovalCustodyReady: false,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );

    const status = await service.getStatus();
    expect(status.livePilotReadiness).toEqual(
      expect.objectContaining({
        id: readiness.id,
        status: 'blocked',
      }),
    );
    expect(status.readiness).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'livePilotReady',
          ready: false,
        }),
      ]),
    );
  });

  it('rejects broker-write pre-trade risk check requests that include order intent', async () => {
    await expect(
      service.assessLivePilotReadiness({} as any, {
        provider: 'toss',
        configured: false,
        readOnlyEnabled: false,
        paperTradingEnabled: false,
        liveTradingEnabled: false,
        authMethod: 'oauth2_client_credentials',
        credentialRef: 'missing',
        credentialCustody: {
          mode: 'missing',
          configured: false,
          productionReady: false,
          secretRef: 'missing',
          detail: 'External secret custody is required.',
        },
        schemaVerified: false,
        sandboxVerified: false,
        readOnlyPoll: {
          provider: 'toss',
          enabled: false,
          configured: false,
          schemaVerified: false,
          canPoll: false,
          canPollFills: false,
          baseUrl: 'https://openapi.tossinvest.com',
          accountRef: 'missing',
          allowedEndpoints: [],
          cron: '*/5 * * * *',
          running: false,
          brokerExecutionEnabled: false,
          liveTradingEnabled: false,
        },
        emergencyControls: {
          runtimeKillSwitchReady: true,
          brokerCancelReady: false,
          brokerFlattenReady: false,
          openOrderPollingReady: false,
          brokerWriteEnabled: false,
          dryRunOnly: true,
          checkedAt: new Date().toISOString(),
          blockers: [],
          detail: 'blocked',
        },
        capabilities: [],
        blockers: [],
        brokerExecutionEnabled: false,
      }),
    ).rejects.toThrow(
      'Broker-write pre-trade risk check pilotBudgetAmount must be positive',
    );

    await expect(
      service.assessLivePilotReadiness(
        {
          pilotBudgetAmount: 500_000,
          placeOrder: true,
        } as any,
        {
          provider: 'toss',
          configured: false,
          readOnlyEnabled: false,
          paperTradingEnabled: false,
          liveTradingEnabled: false,
          authMethod: 'oauth2_client_credentials',
          credentialRef: 'missing',
          credentialCustody: {
            mode: 'missing',
            configured: false,
            productionReady: false,
            secretRef: 'missing',
            detail: 'External secret custody is required.',
          },
          schemaVerified: false,
          sandboxVerified: false,
          readOnlyPoll: {
            provider: 'toss',
            enabled: false,
            configured: false,
            schemaVerified: false,
            canPoll: false,
            canPollFills: false,
            baseUrl: 'https://openapi.tossinvest.com',
            accountRef: 'missing',
            allowedEndpoints: [],
            cron: '*/5 * * * *',
            running: false,
            brokerExecutionEnabled: false,
            liveTradingEnabled: false,
          },
          emergencyControls: {
            runtimeKillSwitchReady: true,
            brokerCancelReady: false,
            brokerFlattenReady: false,
            openOrderPollingReady: false,
            brokerWriteEnabled: false,
            dryRunOnly: true,
            checkedAt: new Date().toISOString(),
            blockers: [],
            detail: 'blocked',
          },
          capabilities: [],
          blockers: [],
          brokerExecutionEnabled: false,
        },
      ),
    ).rejects.toThrow(
      'Broker-write pre-trade risk check cannot include placeOrder',
    );
  });

  it('records blocked dry-run broker order commands without broker writes', async () => {
    paperOrderPlans.push({
      id: 42,
      proposalId: 7,
      orderPlanApprovalId: 11,
      planHash: 'sha256:paper-plan',
      status: 'filled',
      mode: 'paper',
      orders: [
        {
          paperOrderId: 'paper-order:42:0',
          proposalOrderIndex: 0,
          symbol: '005930',
          side: 'BUY',
          orderType: 'MARKET',
          requestedNotional: 100_000,
          marketDataTimestamp: '2026-05-22T23:55:00.000Z',
          feeModelRef: 'fixed-10bps-paper-fee-v1',
          slippageModelRef: 'fixed-5bps-paper-slippage-v1',
          sourceOrder: {
            symbol: '005930',
            assetClass: 'domestic_stock',
            side: 'BUY',
            orderType: 'MARKET',
            notional: 100_000,
          },
        },
      ],
      brokerExecutionEnabled: false,
      liveTradingEnabled: false,
    } as any);

    const command = await service.prepareBrokerOrderCommandFromPaperPlan(
      42,
      {
        idempotencyKey: 'broker-command-1',
        notes: ['Operator wants a broker write dry run.'],
      },
      makeBlockedBrokerAdapterStatus() as any,
    );
    const replayed = await service.prepareBrokerOrderCommandFromPaperPlan(
      42,
      { idempotencyKey: 'broker-command-1' },
      makeBlockedBrokerAdapterStatus() as any,
    );

    expect(replayed.id).toBe(command.id);
    expect(command).toEqual(
      expect.objectContaining({
        commandType: 'submit_order_plan',
        sourceType: 'paper_order_plan',
        paperOrderPlanId: 42,
        orderPlanApprovalId: 11,
        status: 'blocked',
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(command.orderIntents).toEqual([
      expect.objectContaining({
        brokerOrderIntentId: 'broker-intent:42:0',
        sourcePaperOrderId: 'paper-order:42:0',
        symbol: '005930',
        side: 'BUY',
        status: 'blocked',
      }),
    ]);
    expect(command.blockedReasons).toEqual(
      expect.arrayContaining([
        'No ready broker-write pre-trade risk check record',
        'Live broker order endpoint is not implemented',
        'Broker write access is disabled',
        'Broker order command is dry-run only',
      ]),
    );

    const emergency = await service.runBrokerEmergencyCommandDryRun(
      {
        commandType: 'cancel_open_orders',
        reason: 'Operator drills cancel before any broker-write scope exists.',
        idempotencyKey: 'broker-emergency-cancel-1',
      },
      makeBlockedBrokerAdapterStatus() as any,
    );

    expect(emergency).toEqual(
      expect.objectContaining({
        commandType: 'cancel_open_orders',
        sourceType: 'emergency',
        status: 'blocked',
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(emergency.emergencyActions[0]).toEqual(
      expect.objectContaining({
        actionType: 'cancel_open_orders',
        status: 'blocked',
      }),
    );
    expect(emergency.blockedReasons).toEqual(
      expect.arrayContaining([
        'Broker cancel/replace endpoint is not implemented',
        'Broker emergency open-order custody is not implemented',
      ]),
    );
    expect(await service.listBrokerOrderCommands()).toHaveLength(2);

    await expect(
      service.prepareBrokerOrderCommandFromPaperPlan(
        42,
        { orderPayload: { symbol: '005930' } } as any,
        makeBlockedBrokerAdapterStatus() as any,
      ),
    ).rejects.toThrow('Broker order command cannot include orderPayload');
  });

  it('imports read-only broker order lifecycle evidence without broker writes', async () => {
    paperOrderPlans.push({
      id: 43,
      proposalId: 8,
      orderPlanApprovalId: 12,
      planHash: 'sha256:paper-plan-43',
      status: 'filled',
      mode: 'paper',
      orders: [
        {
          paperOrderId: 'paper-order:43:0',
          proposalOrderIndex: 0,
          symbol: '005930',
          side: 'BUY',
          orderType: 'MARKET',
          requestedNotional: 100_000,
          requestedQuantity: 2,
          requestedPrice: 50_000,
          marketDataTimestamp: '2026-05-22T23:55:00.000Z',
          feeModelRef: 'fixed-10bps-paper-fee-v1',
          slippageModelRef: 'fixed-5bps-paper-slippage-v1',
          sourceOrder: {
            symbol: '005930',
            assetClass: 'domestic_stock',
            side: 'BUY',
            orderType: 'MARKET',
            notional: 100_000,
          },
        },
      ],
      brokerExecutionEnabled: false,
      liveTradingEnabled: false,
    } as any);
    const command = await service.prepareBrokerOrderCommandFromPaperPlan(
      43,
      { idempotencyKey: 'broker-command-43' },
      makeBlockedBrokerAdapterStatus() as any,
    );

    const status = await service.importBrokerOrderStatus({
      provider: 'manual',
      brokerOrderRefHash: 'sha256:broker-order-open',
      brokerOrderCommandId: command.id,
      brokerOrderIntentId: 'broker-intent:43:0',
      externalStatus: 'open',
      symbol: '005930',
      side: 'BUY',
      orderType: 'MARKET',
      requestedQuantity: 2,
      remainingQuantity: 2,
      requestedNotional: 100_000,
      asOf: '2026-05-22T23:59:00.000Z',
    });
    const replayed = await service.importBrokerOrderStatus({
      provider: 'manual',
      brokerOrderRefHash: 'sha256:broker-order-open',
      externalStatus: 'open',
      symbol: '005930',
      side: 'BUY',
      orderType: 'MARKET',
      asOf: '2026-05-22T23:59:00.000Z',
    });

    expect(replayed.id).toBe(status.id);
    expect(status).toEqual(
      expect.objectContaining({
        externalStatus: 'open',
        status: 'mismatch',
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(status.reconciliation).toEqual(
      expect.objectContaining({
        status: 'mismatch',
        brokerOrderCommandId: command.id,
        brokerOrderIntentId: 'broker-intent:43:0',
        paperOrderPlanId: 43,
        symbolMatched: true,
        sideMatched: true,
        orderTypeMatched: true,
        commandDryRunOnly: true,
      }),
    );
    expect(await service.listBrokerOrderStatuses()).toHaveLength(1);
    expect(await service.listOpenBrokerOrderStatuses()).toHaveLength(1);

    const emergency = await service.runBrokerEmergencyCommandDryRun(
      {
        commandType: 'cancel_open_orders',
        reason: 'Operator drills cancel with open order evidence.',
      },
      makeBlockedBrokerAdapterStatus() as any,
    );

    expect(emergency.emergencyActions[0]).toEqual(
      expect.objectContaining({
        targetOpenOrderCount: 1,
        targetBrokerOrderRefHashes: ['sha256:broker-order-open'],
      }),
    );

    await expect(
      service.importBrokerOrderStatus({
        brokerOrderRefHash: 'raw-order-id',
        externalStatus: 'open',
        symbol: '005930',
        side: 'BUY',
        orderType: 'MARKET',
        accountRef: 'raw-account',
      } as any),
    ).rejects.toThrow('Broker order status cannot include accountRef');
  });

  it('rejects broker snapshot imports that include credentials or order intent', async () => {
    await expect(
      service.importBrokerSnapshot({
        provider: 'manual',
        asOf: '2026-05-22T23:59:00.000Z',
        cash: 1_000_000,
        equity: 1_000_000,
        positions: [],
        brokerCredentials: { token: 'secret' },
      } as any),
    ).rejects.toThrow('Broker read-only snapshots cannot include');

    await expect(
      service.importBrokerSnapshot({
        provider: 'manual',
        asOf: '2026-05-22T23:59:00.000Z',
        cash: 1_000_000,
        equity: 1_000_000,
        positions: [],
        orders: [{ symbol: '005930' }],
      } as any),
    ).rejects.toThrow('Broker read-only snapshots cannot include');

    expect(brokerSnapshots).toHaveLength(0);
  });

  it('rejects manual broker snapshot imports that claim Toss provenance', async () => {
    await expect(
      service.importBrokerSnapshot({
        provider: 'toss',
        sourceRef: 'toss-read-only-poll:forged',
        asOf: '2026-05-22T23:59:00.000Z',
        cash: 1_000_000,
        equity: 1_000_000,
        positions: [],
      }),
    ).rejects.toThrow(
      'Manual broker snapshot import cannot claim Toss provider',
    );
  });

  it('imports read-only broker fill evidence without enabling broker execution', async () => {
    const fill = await service.importBrokerFill({
      provider: 'manual',
      sourceRef: 'operator-fill-import',
      accountRef: 'raw-account-id-must-be-hashed',
      brokerOrderRef: 'broker-order-123',
      brokerFillRef: 'broker-fill-123',
      symbol: '005930',
      side: 'BUY',
      quantity: 10,
      fillPrice: 50_000,
      fee: 500,
      filledAt: '2026-05-22T23:59:00.000Z',
    });

    expect(fill).toEqual(
      expect.objectContaining({
        provider: 'manual',
        sourceRef: 'operator-fill-import',
        status: 'mismatch',
        symbol: '005930',
        side: 'BUY',
        quantity: 10,
        fillPrice: 50_000,
        grossNotional: 500_000,
        fee: 500,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(fill.accountRefHash).toMatch(/^sha256:/);
    expect(fill.brokerOrderRefHash).toMatch(/^sha256:/);
    expect(fill.brokerFillRefHash).toMatch(/^sha256:/);
    expect(fill).not.toHaveProperty('accountRef');
    expect(fill.status).toBe('mismatch');
    expect(fill.reconciliation.status).toBe('mismatch');
    expect(fill.reconciliation.notes).toContain(
      'No matching paper fill found for this broker fill evidence.',
    );
    expect(await service.listBrokerFills()).toHaveLength(1);
  });

  it('matches imported broker fill evidence against a paper fill', async () => {
    paperOrderPlans.push({
      id: 7,
      proposalId: 3,
      status: 'filled',
      fills: [
        {
          paperFillId: 'paper-order:3:0:fill:0',
          paperOrderId: 'paper-order:3:0',
          timestamp: '2026-05-22T23:58:00.000Z',
          symbol: '005930',
          side: 'BUY',
          quantity: 10,
          fillPrice: 50_000,
          grossNotional: 500_000,
          requestedNotional: 500_000,
          filledNotional: 500_000,
          fee: 500,
          feeCurrency: 'KRW',
          slippage: 250,
          netCashDelta: -500_750,
          positionDelta: 10,
          status: 'filled',
        },
      ],
      updatedAt: new Date('2026-05-22T23:58:00.000Z'),
    } as PaperOrderPlan);

    const fill = await service.importBrokerFill({
      provider: 'manual',
      brokerFillRef: 'broker-fill-paper-match',
      symbol: '005930',
      side: 'BUY',
      quantity: 10,
      fillPrice: 50_000,
      fee: 500,
      filledAt: '2026-05-22T23:59:00.000Z',
    });

    expect(fill.status).toBe('matched');
    expect(fill.reconciliation).toEqual(
      expect.objectContaining({
        status: 'matched',
        paperOrderPlanId: 7,
        paperFillId: 'paper-order:3:0:fill:0',
        symbolMatched: true,
        sideMatched: true,
        quantityMatched: true,
        notionalMatched: true,
        feeMatched: true,
        expectedQuantity: 10,
        expectedGrossNotional: 500_000,
        expectedFee: 500,
        quantityDiff: 0,
        notionalDiff: 0,
        feeDiff: 0,
      }),
    );

    const reconciled = await service.reconcileBrokerFill(fill.id, {
      paperOrderPlanId: 7,
      paperFillId: 'paper-order:3:0:fill:0',
      tolerance: 0.01,
      notes: ['Unit test explicit broker-fill reconciliation.'],
    });

    expect(reconciled.reconciliation.notes).toContain(
      'Unit test explicit broker-fill reconciliation.',
    );
  });

  it('rejects broker fill imports that include credentials or order intent', async () => {
    await expect(
      service.importBrokerFill({
        brokerFillRef: 'broker-fill-secret',
        symbol: '005930',
        side: 'BUY',
        quantity: 1,
        fillPrice: 50_000,
        filledAt: '2026-05-22T23:59:00.000Z',
        accessToken: 'secret',
      } as any),
    ).rejects.toThrow('Broker read-only fills cannot include');

    await expect(
      service.importBrokerFill({
        brokerFillRef: 'broker-fill-order',
        symbol: '005930',
        side: 'BUY',
        quantity: 1,
        fillPrice: 50_000,
        filledAt: '2026-05-22T23:59:00.000Z',
        orderPayload: { symbol: '005930' },
      } as any),
    ).rejects.toThrow('Broker read-only fills cannot include');

    expect(brokerFills).toHaveLength(0);
  });

  it('persists a blocked paper plan when risk approval is missing', async () => {
    const researchRun = await service.createResearchRun({
      objective: 'Blocked paper execution research run',
      strategyFamily: 'momentum',
      hypothesis: 'Missing risk approval should block paper execution.',
      datasetRefs: [
        {
          id: 'krx-daily-bars',
          source: 'sample',
          windowStart: '2025-01-01',
          windowEnd: '2026-05-22',
          availabilityTimestamp: '2026-05-22T23:50:00.000Z',
          marketDataTimestamp: '2026-05-22T23:50:00.000Z',
        },
      ],
      featureRefs: ['close_20d_return'],
      timestampLagRules: ['Signals use only data available before close.'],
      noLookaheadChecked: true,
      benchmark: 'KOSPI',
      costModel: '10bps fixed commission and tax estimate',
      slippageModel: '5bps notional slippage',
      validationWindow: {
        start: '2026-01-01',
        end: '2026-05-22',
      },
      backtestMetrics: {
        totalReturnPct: 8.2,
        benchmarkReturnPct: 3.1,
        maxDrawdownPct: 4.3,
        sharpeRatio: 1.1,
        turnoverPct: 22,
        tradeCount: 12,
      },
      artifactRefs: ['artifacts/research-runs/blocked-paper/report.md'],
      artifactHashes: {
        'artifacts/research-runs/blocked-paper/report.md': 'sha256:test',
      },
      knownFailureModes: ['Trend reversal can cause delayed exits.'],
    });
    const proposal = await service.createProposal({
      researchRunId: researchRun.id,
      strategyId: 'momentum-v1',
      ruleId: 'long-only-breakout',
      generatedAt: '2026-05-22T23:59:00.000Z',
      marketDataTimestamp: '2026-05-22T23:55:00.000Z',
      portfolioSnapshot: {
        currency: 'KRW',
        equity: 10_000_000,
        cash: 10_000_000,
        grossExposurePct: 0,
      },
      orders: [],
    });

    const plan = await service.paperExecuteProposal(proposal.id);

    expect(plan.status).toBe('blocked');
    expect(plan.fills).toEqual([]);
    expect(plan.blockedReasons).toContain('Latest risk decision is REVIEW');
    expect(plan.endingCash).toBe(10_000_000);
    expect(plan.endingEquity).toBe(10_000_000);
    expect(plan.reconciliation.status).toBe('not_required');
    expect(plan.reconciliation.cashMatched).toBe(true);
    expect(paperAccounts).toHaveLength(0);
  });

  it('blocks aggregate same-symbol paper sells that exceed the account position', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Sell reservation budget',
      totalBudget: 10_000_000,
    });
    const researchRun = await service.runBaselineResearch({
      budgetEnvelopeId: budget.id,
    });
    const proposal = await service.createProposal({
      budgetEnvelopeId: budget.id,
      researchRunId: researchRun.id,
      strategyId: 'momentum-v1',
      ruleId: 'long-only-breakout',
      generatedAt: '2026-05-22T23:59:00.000Z',
      marketDataTimestamp: '2026-05-22T23:55:00.000Z',
      portfolioSnapshot: {
        currency: 'KRW',
        equity: 10_000_000,
        cash: 9_500_000,
        grossExposurePct: 5,
        positions: [
          {
            symbol: '005930',
            assetClass: 'domestic_stock',
            marketValue: 500_000,
            weightPct: 5,
          },
        ],
      },
      orders: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          side: 'SELL',
          orderType: 'MARKET',
          notional: 300_000,
          targetPositionPct: 2,
        },
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          side: 'SELL',
          orderType: 'MARKET',
          notional: 300_000,
          targetPositionPct: 0,
        },
      ],
    });

    const plan = await service.paperExecuteProposal(proposal.id, {
      idempotencyKey: 'paper-sell-overdraft',
      humanApprovalId: 'approval-paper-sell-overdraft',
    });

    expect(plan.status).toBe('blocked');
    expect(plan.fills).toEqual([]);
    expect(plan.blockedReasons).toContain(
      'Paper execution position check failed',
    );
    expect(paperAccounts).toHaveLength(0);
  });

  it('subtracts open paper reservations before checking available cash', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Reservation budget',
      totalBudget: 1_000_000,
      policy: {
        maxGrossExposurePct: 100,
        maxSinglePositionPct: 100,
        maxOrderNotional: 1_000_000,
      },
    });
    const seededAccount = await service.seedPaperAccount({
      budgetEnvelopeId: budget.id,
      cash: 1_000_000,
      positions: [],
      actor: 'unit-test-operator',
      reason: 'Seed account for reservation check.',
      idempotencyKey: 'seed-reservation-account',
    });
    await service.promotePaperAccount(seededAccount.id, {
      actor: 'unit-test-operator',
      reason: 'Promote account for reservation check.',
      idempotencyKey: 'promote-reservation-account',
      expectedEventHash: paperAccountEvents[0].eventHash,
    });
    const researchRun = await service.runBaselineResearch({
      budgetEnvelopeId: budget.id,
    });
    const proposal = await service.createProposal({
      budgetEnvelopeId: budget.id,
      researchRunId: researchRun.id,
      strategyId: 'reservation-v1',
      ruleId: 'cash-reservation-check',
      generatedAt: '2026-05-22T23:59:00.000Z',
      marketDataTimestamp: '2026-05-22T23:55:00.000Z',
      portfolioSnapshot: {
        currency: 'KRW',
        equity: 1_000_000,
        cash: 1_000_000,
        grossExposurePct: 0,
      },
      orders: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          side: 'BUY',
          orderType: 'MARKET',
          notional: 800_000,
          targetPositionPct: 80,
        },
      ],
    });
    const approval = await service.createOrderPlanApproval(proposal.id, {
      idempotencyKey: 'reservation-paper-plan',
      approver: 'unit-test-operator',
      reason: 'Approve reservation check plan.',
      expectedPaperAccountEventHash: paperAccountEvents[1].eventHash,
    });
    paperOrderPlans.push({
      id: 99,
      proposalId: 999,
      paperAccountId: seededAccount.id,
      status: 'planned',
      orders: [
        {
          paperOrderId: 'paper-order:reserved:0',
          proposalOrderIndex: 0,
          symbol: '000660',
          side: 'BUY',
          orderType: 'MARKET',
          requestedNotional: 300_000,
          marketDataTimestamp: '2026-05-22T23:55:00.000Z',
          feeModelRef: 'fixed-10bps-paper-fee-v1',
          slippageModelRef: 'fixed-5bps-paper-slippage-v1',
          sourceOrder: {
            symbol: '000660',
            assetClass: 'domestic_stock',
            side: 'BUY',
            orderType: 'MARKET',
            notional: 300_000,
          },
        },
      ],
      updatedAt: new Date('2026-05-22T23:58:00.000Z'),
    } as PaperOrderPlan);

    const plan = await service.paperExecuteProposal(proposal.id, {
      idempotencyKey: 'reservation-paper-plan',
      orderPlanApprovalId: approval.id,
    });

    expect(plan.status).toBe('blocked');
    expect(plan.blockedReasons).toContain('Paper execution cash check failed');
    expect(plan.readinessSnapshot).toEqual(
      expect.objectContaining({
        requiredCash: 801_200,
        reservedCash: 300_450,
        availableCash: 699_550,
        cashSufficient: false,
        noDuplicatePlan: true,
      }),
    );
  });

  it('subtracts reserved paper holds even when the plan status is no longer open', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Reserved hold budget',
      totalBudget: 1_000_000,
      policy: {
        maxGrossExposurePct: 100,
        maxSinglePositionPct: 100,
        maxOrderNotional: 1_000_000,
      },
    });
    const seededAccount = await service.seedPaperAccount({
      budgetEnvelopeId: budget.id,
      cash: 1_000_000,
      positions: [],
      actor: 'unit-test-operator',
      reason: 'Seed account for reserved hold check.',
      idempotencyKey: 'seed-reserved-hold-account',
    });
    await service.promotePaperAccount(seededAccount.id, {
      actor: 'unit-test-operator',
      reason: 'Promote account for reserved hold check.',
      idempotencyKey: 'promote-reserved-hold-account',
      expectedEventHash: paperAccountEvents[0].eventHash,
    });
    const researchRun = await service.runBaselineResearch({
      budgetEnvelopeId: budget.id,
    });
    const proposal = await service.createProposal({
      budgetEnvelopeId: budget.id,
      researchRunId: researchRun.id,
      strategyId: 'reserved-hold-v1',
      ruleId: 'cash-reserved-hold-check',
      generatedAt: '2026-05-22T23:59:00.000Z',
      marketDataTimestamp: '2026-05-22T23:55:00.000Z',
      portfolioSnapshot: {
        currency: 'KRW',
        equity: 1_000_000,
        cash: 1_000_000,
        grossExposurePct: 0,
      },
      orders: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          side: 'BUY',
          orderType: 'MARKET',
          notional: 800_000,
          targetPositionPct: 80,
        },
      ],
    });
    const approval = await service.createOrderPlanApproval(proposal.id, {
      idempotencyKey: 'reserved-hold-paper-plan',
      approver: 'unit-test-operator',
      reason: 'Approve reserved hold check plan.',
      expectedPaperAccountEventHash: paperAccountEvents[1].eventHash,
    });
    const orphanedHold = {
      holdId: 'paper-reservation:orphaned-reserved-hold',
      status: 'reserved' as const,
      idempotencyKey: 'orphaned-reserved-hold',
      createdAt: '2026-05-22T23:58:00.000Z',
      cashAmount: 300_450,
      sellNotionalBySymbol: {},
      availableCashAtHold: 1_000_000,
      availableSellNotionalBySymbolAtHold: {},
      holdHash: 'sha256-reserved-hold',
      notes: ['Reserved hold left open by an interrupted paper plan.'],
    };
    paperReservationHolds.push({
      id: 99,
      holdId: orphanedHold.holdId,
      paperAccountId: seededAccount.id,
      proposalId: 999,
      status: 'reserved',
      idempotencyKey: orphanedHold.idempotencyKey,
      reservedAt: new Date('2026-05-22T23:58:00.000Z'),
      cashAmount: orphanedHold.cashAmount,
      sellNotionalBySymbol: {},
      availableCashAtHold: 1_000_000,
      availableSellNotionalBySymbolAtHold: {},
      holdHash: orphanedHold.holdHash,
      holdSnapshot: orphanedHold,
      notes: orphanedHold.notes,
      updatedAt: new Date('2026-05-22T23:58:00.000Z'),
    } as PaperReservationHoldRecord);
    paperOrderPlans.push({
      id: 100,
      proposalId: 999,
      paperAccountId: seededAccount.id,
      status: 'filled',
      reservationHold: orphanedHold,
      orders: [],
      updatedAt: new Date('2026-05-22T23:58:00.000Z'),
    } as PaperOrderPlan);

    const plan = await service.paperExecuteProposal(proposal.id, {
      idempotencyKey: 'reserved-hold-paper-plan',
      orderPlanApprovalId: approval.id,
    });

    expect(plan.status).toBe('blocked');
    expect(plan.blockedReasons).toContain('Paper execution cash check failed');
    expect(plan.readinessSnapshot).toEqual(
      expect.objectContaining({
        requiredCash: 801_200,
        reservedCash: 300_450,
        availableCash: 699_550,
        cashSufficient: false,
        noDuplicatePlan: true,
      }),
    );
  });

  it('recomputes paper reservations inside the account critical section', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Locked reservation budget',
      totalBudget: 1_000_000,
      policy: {
        maxGrossExposurePct: 100,
        maxSinglePositionPct: 100,
        maxOrderNotional: 1_000_000,
      },
    });
    const seededAccount = await service.seedPaperAccount({
      budgetEnvelopeId: budget.id,
      cash: 1_000_000,
      positions: [],
      actor: 'unit-test-operator',
      reason: 'Seed account for locked reservation recompute.',
      idempotencyKey: 'seed-locked-reservation-account',
    });
    await service.promotePaperAccount(seededAccount.id, {
      actor: 'unit-test-operator',
      reason: 'Promote account for locked reservation recompute.',
      idempotencyKey: 'promote-locked-reservation-account',
      expectedEventHash: paperAccountEvents[0].eventHash,
    });
    const researchRun = await service.runBaselineResearch({
      budgetEnvelopeId: budget.id,
    });
    const proposal = await service.createProposal({
      budgetEnvelopeId: budget.id,
      researchRunId: researchRun.id,
      strategyId: 'locked-reservation-v1',
      ruleId: 'cash-locked-reservation-check',
      generatedAt: '2026-05-22T23:59:00.000Z',
      marketDataTimestamp: '2026-05-22T23:55:00.000Z',
      portfolioSnapshot: {
        currency: 'KRW',
        equity: 1_000_000,
        cash: 1_000_000,
        grossExposurePct: 0,
      },
      orders: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          side: 'BUY',
          orderType: 'MARKET',
          notional: 800_000,
          targetPositionPct: 80,
        },
      ],
    });
    const approval = await service.createOrderPlanApproval(proposal.id, {
      idempotencyKey: 'locked-reservation-paper-plan',
      approver: 'unit-test-operator',
      reason: 'Approve locked reservation check plan.',
      expectedPaperAccountEventHash: paperAccountEvents[1].eventHash,
    });
    const injectedHold = {
      id: 99,
      holdId: 'paper-reservation:locked-recompute-hold',
      paperAccountId: seededAccount.id,
      proposalId: 999,
      status: 'reserved',
      idempotencyKey: 'locked-recompute-hold',
      reservedAt: new Date('2026-05-22T23:58:00.000Z'),
      cashAmount: 300_450,
      sellNotionalBySymbol: {},
      availableCashAtHold: 1_000_000,
      availableSellNotionalBySymbolAtHold: {},
      holdHash: 'sha256-locked-recompute-hold',
      holdSnapshot: {
        holdId: 'paper-reservation:locked-recompute-hold',
        status: 'reserved',
        idempotencyKey: 'locked-recompute-hold',
        createdAt: '2026-05-22T23:58:00.000Z',
        cashAmount: 300_450,
        sellNotionalBySymbol: {},
        availableCashAtHold: 1_000_000,
        availableSellNotionalBySymbolAtHold: {},
        holdHash: 'sha256-locked-recompute-hold',
        notes: ['Injected during locked readiness recompute.'],
      },
      notes: ['Injected during locked readiness recompute.'],
      updatedAt: new Date('2026-05-22T23:58:00.000Z'),
    } as PaperReservationHoldRecord;
    let injected = false;
    const transaction = jest.fn(
      async (
        isolationOrCallback:
          | string
          | ((manager: { getRepository: (entity: any) => any }) => unknown),
        maybeCallback?: (manager: {
          getRepository: (entity: any) => any;
        }) => unknown,
      ) => {
        const callback =
          typeof isolationOrCallback === 'function'
            ? isolationOrCallback
            : maybeCallback;
        const manager = {
          getRepository: (entity: any) => {
            if (entity === PaperAccount) {
              return makeRepository(paperAccounts);
            }

            if (entity === PaperAccountEvent) {
              return makeRepository(paperAccountEvents);
            }

            if (entity === PaperOrderPlan) {
              return makeRepository(paperOrderPlans);
            }

            if (entity === PaperReservationHoldRecord) {
              const repository = makeRepository(paperReservationHolds);

              return {
                ...repository,
                find: jest.fn(async (options?: { where?: Partial<any> }) => {
                  if (!injected) {
                    injected = true;
                    paperReservationHolds.push(injectedHold);
                  }

                  return repository.find(options);
                }),
              };
            }

            if (entity === OrderPlanApproval) {
              return makeRepository(orderPlanApprovals);
            }

            if (entity === InvestmentProposal) {
              return makeRepository(proposals);
            }

            throw new Error(`Unexpected repository ${entity?.name}`);
          },
        };

        return callback?.(manager);
      },
    );
    (
      service as unknown as {
        dataSource: { transaction: typeof transaction };
      }
    ).dataSource = { transaction };

    const plan = await service.paperExecuteProposal(proposal.id, {
      idempotencyKey: 'locked-reservation-paper-plan',
      orderPlanApprovalId: approval.id,
    });

    expect(transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    );
    expect(plan.status).toBe('blocked');
    expect(plan.blockedReasons).toContain('Paper execution cash check failed');
    expect(plan.readinessSnapshot).toEqual(
      expect.objectContaining({
        requiredCash: 801_200,
        reservedCash: 300_450,
        availableCash: 699_550,
        cashSufficient: false,
        paperAccountLockVersion: 1,
      }),
    );
    expect(plan.reservationHold).toBeUndefined();
    expect(paperReservationHolds).toHaveLength(1);
    expect(paperReservationHolds[0].holdId).toBe(injectedHold.holdId);
  });

  it('blocks paper execution when execution control is halted', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Halted budget',
      totalBudget: 10_000_000,
    });
    const researchRun = await service.runBaselineResearch({
      budgetEnvelopeId: budget.id,
    });
    const proposal = await service.createProposal({
      budgetEnvelopeId: budget.id,
      researchRunId: researchRun.id,
      strategyId: 'momentum-v1',
      ruleId: 'long-only-breakout',
      generatedAt: '2026-05-22T23:59:00.000Z',
      marketDataTimestamp: '2026-05-22T23:55:00.000Z',
      portfolioSnapshot: {
        currency: 'KRW',
        equity: 10_000_000,
        cash: 10_000_000,
        grossExposurePct: 0,
      },
      orders: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          side: 'BUY',
          orderType: 'MARKET',
          notional: 500_000,
          targetPositionPct: 5,
        },
      ],
    });

    await service.evaluateProposal(proposal.id);
    await service.updateExecutionControlState({
      state: 'halted',
      actor: 'human',
      reason: 'Manual stop for test.',
    });

    const plan = await service.paperExecuteProposal(proposal.id);

    expect(plan.status).toBe('blocked');
    expect(plan.blockedReasons).toContain('Execution control state is halted');
    expect(plan.killSwitchSnapshot.tripped).toBe(true);
    expect(plan.killSwitchEvent).toEqual(
      expect.objectContaining({
        actor: 'human',
        tripped: true,
      }),
    );
    expect(paperAccounts).toHaveLength(0);
  });

  it('blocks proposal creation when research evidence is incomplete', async () => {
    const researchRun = await service.createResearchRun({
      objective: 'Incomplete run',
      strategyFamily: 'momentum',
      hypothesis: 'Missing no-lookahead proof should block advancement.',
      datasetRefs: [
        {
          id: 'krx-daily-bars',
          windowStart: '2025-01-01',
          windowEnd: '2026-05-22',
          availabilityTimestamp: '2026-05-22T23:50:00.000Z',
          marketDataTimestamp: '2026-05-22T23:50:00.000Z',
        },
      ],
      featureRefs: ['close_20d_return'],
      timestampLagRules: ['Signals use only data available before close.'],
      noLookaheadChecked: false,
      benchmark: 'KOSPI',
      costModel: '10bps fixed commission and tax estimate',
      slippageModel: '5bps notional slippage',
      validationWindow: {
        start: '2026-01-01',
        end: '2026-05-22',
      },
      backtestMetrics: {
        totalReturnPct: 8.2,
        benchmarkReturnPct: 3.1,
        maxDrawdownPct: 4.3,
        sharpeRatio: 1.1,
        turnoverPct: 22,
        tradeCount: 12,
      },
      artifactRefs: ['artifacts/research-runs/incomplete/report.md'],
      artifactHashes: {
        'artifacts/research-runs/incomplete/report.md': 'sha256:test',
      },
      knownFailureModes: ['Trend reversal can cause delayed exits.'],
    });

    expect(researchRun.status).toBe('blocked');
    expect(researchRun.advanceEligible).toBe(false);
    expect(researchRun.blockedReasons).toContain(
      'No-lookahead check must pass before proposal creation',
    );

    await expect(
      service.createProposal({
        researchRunId: researchRun.id,
        strategyId: 'momentum-v1',
        ruleId: 'long-only-breakout',
        generatedAt: '2026-05-22T23:59:00.000Z',
        marketDataTimestamp: '2026-05-22T23:55:00.000Z',
        portfolioSnapshot: {
          currency: 'KRW',
          equity: 10_000_000,
          cash: 10_000_000,
          grossExposurePct: 0,
        },
        orders: [],
      }),
    ).rejects.toThrow('is not proposal-ready');
  });

  it('runs a deterministic baseline backtest into a proposal-ready research run', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Baseline budget',
      totalBudget: 10_000_000,
    });

    const researchRun = await service.runBaselineResearch({
      budgetEnvelopeId: budget.id,
      objective: 'Run built-in baseline before proposal',
      symbol: 'SAMPLE_MOMENTUM_BASKET',
      benchmark: 'SAMPLE_BENCHMARK',
    });

    expect(researchRun.budgetEnvelopeId).toBe(budget.id);
    expect(researchRun.status).toBe('proposal_ready');
    expect(researchRun.advanceEligible).toBe(true);
    expect(researchRun.noLookaheadChecked).toBe(true);
    expect(researchRun.backtestMetrics.tradeCount).toBeGreaterThan(0);
    expect(researchRun.artifactRefs).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/run-input.json'),
        expect.stringContaining('/metrics.json'),
        expect.stringContaining('/report.md'),
      ]),
    );
    expect(researchRun.artifactHashes[researchRun.artifactRefs[0]]).toMatch(
      /^sha256:/,
    );
    expect(researchRun.brokerExecutionEnabled).toBe(false);
    expect(researchRun.liveTradingEnabled).toBe(false);
  });

  it('imports external market bars without enabling broker execution', async () => {
    const response = await service.importMarketDataBars({
      datasetId: 'krx-daily-bars-2026-05',
      provider: 'krx',
      sourceRef: 'manual-upload:krx:2026-05',
      symbol: '005930',
      timeframe: '1d',
      currency: 'KRW',
      bars: [
        {
          timestamp: '2026-05-18T00:00:00.000Z',
          availabilityTimestamp: '2026-05-18T15:30:00.000Z',
          open: 75_000,
          high: 76_000,
          low: 74_500,
          close: 75_500,
          adjustedClose: 75_500,
          volume: 1_000_000,
        },
      ],
    });

    expect(response).toEqual(
      expect.objectContaining({
        datasetId: 'krx-daily-bars-2026-05',
        symbol: '005930',
        provider: 'krx',
        imported: 1,
        replaced: 0,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(response.bars[0]).toEqual(
      expect.objectContaining({
        datasetId: 'krx-daily-bars-2026-05',
        symbol: '005930',
        close: 75_500,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
  });

  it('replaces imported market bars by dataset, symbol, timeframe, and timestamp', async () => {
    await service.importMarketDataBars({
      datasetId: 'multi-timeframe-bars',
      provider: 'manual',
      symbol: '005930',
      timeframe: '1d',
      bars: [
        {
          timestamp: '2026-05-18T00:00:00.000Z',
          open: 75_000,
          high: 76_000,
          low: 74_500,
          close: 75_500,
        },
      ],
    });
    await service.importMarketDataBars({
      datasetId: 'multi-timeframe-bars',
      provider: 'manual',
      symbol: '005930',
      timeframe: '1h',
      bars: [
        {
          timestamp: '2026-05-18T00:00:00.000Z',
          open: 75_100,
          high: 75_300,
          low: 75_000,
          close: 75_200,
        },
      ],
    });

    const response = await service.importMarketDataBars({
      datasetId: 'multi-timeframe-bars',
      provider: 'manual',
      symbol: '005930',
      timeframe: '1d',
      bars: [
        {
          timestamp: '2026-05-18T00:00:00.000Z',
          open: 76_000,
          high: 77_000,
          low: 75_800,
          close: 76_500,
        },
      ],
    });

    expect(response.replaced).toBe(1);
    expect(marketDataBars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ timeframe: '1d', close: 76_500 }),
        expect.objectContaining({ timeframe: '1h', close: 75_200 }),
      ]),
    );
  });

  it('runs the deterministic baseline against imported market bars', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Imported market data budget',
      totalBudget: 10_000_000,
    });
    const datasetId = 'manual-daily-bars-aligned';
    const dates = [
      '2026-05-11',
      '2026-05-12',
      '2026-05-13',
      '2026-05-14',
      '2026-05-15',
      '2026-05-18',
      '2026-05-19',
      '2026-05-20',
    ];

    await service.importMarketDataBars({
      datasetId,
      provider: 'manual',
      sourceRef: 'operator-upload:asset',
      symbol: '005930',
      timeframe: '1d',
      bars: dates.map((date, index) => ({
        timestamp: `${date}T00:00:00.000Z`,
        availabilityTimestamp: `${date}T15:30:00.000Z`,
        open: 100 + index,
        high: 102 + index,
        low: 99 + index,
        close: 100 + index * 3,
        adjustedClose: 100 + index * 3,
        volume: 1_000 + index,
      })),
    });
    await service.importMarketDataBars({
      datasetId,
      provider: 'manual',
      sourceRef: 'operator-upload:benchmark',
      symbol: 'KOSPI200',
      timeframe: '1d',
      bars: dates.map((date, index) => ({
        timestamp: `${date}T00:00:00.000Z`,
        availabilityTimestamp: `${date}T15:30:00.000Z`,
        open: 100 + index,
        high: 101 + index,
        low: 99 + index,
        close: 100 + index,
        adjustedClose: 100 + index,
        volume: 2_000 + index,
      })),
    });

    const researchRun = await service.runBaselineResearch({
      budgetEnvelopeId: budget.id,
      objective: 'Run imported-data baseline before proposal',
      datasetId,
      symbol: '005930',
      benchmark: 'KOSPI200',
    });

    expect(researchRun.status).toBe('proposal_ready');
    expect(researchRun.datasetRefs[0]).toEqual(
      expect.objectContaining({
        id: datasetId,
        provider: 'manual',
        source: 'operator-upload:asset',
        frequency: '1d',
        universe: ['005930', 'KOSPI200'],
      }),
    );
    expect(researchRun.validationWindow).toEqual(
      expect.objectContaining({
        start: '2026-05-14',
        end: '2026-05-20',
      }),
    );
    expect(researchRun.knownFailureModes).toContain(
      'Imported market bars still require provider quality, corporate action, and survivorship-bias review.',
    );
    expect(researchRun.backtestMetrics.tradeCount).toBeGreaterThan(0);
    expect(researchRun.brokerExecutionEnabled).toBe(false);
    expect(researchRun.liveTradingEnabled).toBe(false);
  });

  it('rejects dataset-backed baseline when benchmark bars are missing', async () => {
    await service.importMarketDataBars({
      datasetId: 'asset-only-bars',
      provider: 'manual',
      symbol: '005930',
      bars: Array.from({ length: 6 }, (_, index) => ({
        timestamp: `2026-05-${String(11 + index).padStart(2, '0')}T00:00:00.000Z`,
        open: 100 + index,
        high: 101 + index,
        low: 99 + index,
        close: 100 + index,
      })),
    });

    await expect(
      service.runBaselineResearch({
        initialCapital: 10_000_000,
        datasetId: 'asset-only-bars',
        symbol: '005930',
        benchmark: 'KOSPI200',
      }),
    ).rejects.toThrow(
      'Dataset-backed baseline requires at least 6 bars for both symbol and benchmark',
    );
  });

  it('ticks a scheduled baseline against its configured market dataset', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Dataset scheduled budget',
      totalBudget: 10_000_000,
    });
    const datasetId = 'scheduled-daily-bars-aligned';
    const dates = [
      '2026-05-17',
      '2026-05-18',
      '2026-05-19',
      '2026-05-20',
      '2026-05-21',
      '2026-05-22',
    ];
    await service.importMarketDataBars({
      datasetId,
      provider: 'manual',
      symbol: '005930',
      bars: dates.map((date, index) => ({
        timestamp: `${date}T00:00:00.000Z`,
        availabilityTimestamp:
          date === '2026-05-22'
            ? '2026-05-22T23:45:00.000Z'
            : `${date}T15:30:00.000Z`,
        open: 100 + index,
        high: 102 + index,
        low: 99 + index,
        close: 100 + index * 3,
      })),
    });
    await service.importMarketDataBars({
      datasetId,
      provider: 'manual',
      symbol: 'KOSPI200',
      bars: dates.map((date, index) => ({
        timestamp: `${date}T00:00:00.000Z`,
        availabilityTimestamp:
          date === '2026-05-22'
            ? '2026-05-22T23:45:00.000Z'
            : `${date}T15:30:00.000Z`,
        open: 100 + index,
        high: 101 + index,
        low: 99 + index,
        close: 100 + index,
      })),
    });

    const schedule = await service.createRunSchedule({
      budgetEnvelopeId: budget.id,
      objective: 'Run scheduled dataset-backed baseline',
      cadenceMinutes: 30,
      nextRunAt: '2026-05-23T00:00:00.000Z',
      researchDatasetId: datasetId,
      researchSymbol: '005930',
      researchBenchmark: 'KOSPI200',
      researchMaxDataAgeMinutes: 60,
    });
    const run = await service.tickRunSchedule(schedule.id, {
      leaseOwner: 'unit-test-dataset-scheduler',
      attemptPaperExecution: false,
    });

    expect(run.status).toBe('risk_checked');
    expect(researchRuns[0]).toEqual(
      expect.objectContaining({
        objective: 'Run scheduled dataset-backed baseline',
        status: 'proposal_ready',
      }),
    );
    expect(researchRuns[0].datasetRefs[0]).toEqual(
      expect.objectContaining({
        id: datasetId,
        universe: ['005930', 'KOSPI200'],
      }),
    );
    expect(proposals[0].orders[0].symbol).toBe('005930');
    expect(proposals[0].marketDataTimestamp.toISOString()).toBe(
      '2026-05-22T23:45:00.000Z',
    );
    expect(runSchedules[0]).toEqual(
      expect.objectContaining({
        researchDatasetId: datasetId,
        researchSymbol: '005930',
        researchBenchmark: 'KOSPI200',
        researchMaxDataAgeMinutes: 60,
      }),
    );
  });

  it('rejects a scheduled market dataset when freshness policy is stale', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Stale dataset schedule budget',
      totalBudget: 10_000_000,
    });
    const datasetId = 'stale-scheduled-bars';
    const dates = [
      '2026-05-11',
      '2026-05-12',
      '2026-05-13',
      '2026-05-14',
      '2026-05-15',
      '2026-05-18',
    ];
    await service.importMarketDataBars({
      datasetId,
      symbol: '005930',
      bars: dates.map((date, index) => ({
        timestamp: `${date}T00:00:00.000Z`,
        availabilityTimestamp: `${date}T15:30:00.000Z`,
        open: 100 + index,
        high: 101 + index,
        low: 99 + index,
        close: 100 + index,
      })),
    });
    await service.importMarketDataBars({
      datasetId,
      symbol: 'KOSPI200',
      bars: dates.map((date, index) => ({
        timestamp: `${date}T00:00:00.000Z`,
        availabilityTimestamp: `${date}T15:30:00.000Z`,
        open: 100 + index,
        high: 101 + index,
        low: 99 + index,
        close: 100 + index,
      })),
    });

    await expect(
      service.createRunSchedule({
        budgetEnvelopeId: budget.id,
        objective: 'Reject stale scheduled dataset',
        researchDatasetId: datasetId,
        researchSymbol: '005930',
        researchBenchmark: 'KOSPI200',
        researchMaxDataAgeMinutes: 60,
      }),
    ).rejects.toThrow(`Schedule research dataset ${datasetId} is stale`);
  });

  it('rejects proposal creation without research-run provenance', async () => {
    await expect(
      service.createProposal({
        strategyId: 'momentum-v1',
        ruleId: 'long-only-breakout',
        generatedAt: '2026-05-22T23:59:00.000Z',
        marketDataTimestamp: '2026-05-22T23:55:00.000Z',
        portfolioSnapshot: {
          currency: 'KRW',
          equity: 10_000_000,
          cash: 10_000_000,
          grossExposurePct: 0,
        },
        orders: [],
      } as any),
    ).rejects.toThrow('Proposal requires a researchRunId');
  });

  it('reports readiness blockers for paper and live execution', async () => {
    const status = await service.getStatus();

    expect(status.brokerExecutionEnabled).toBe(false);
    expect(status.liveTradingReady).toBe(false);
    expect(status.actionStatus).toEqual(
      expect.objectContaining({
        verdict: 'attention',
        nextSafeAction:
          'Create or tick an autonomous run against an active budget envelope.',
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(status.liveTradingGate).toEqual(
      expect.objectContaining({
        enabled: false,
        mode: 'disabled',
        orderEndpointImplemented: false,
        brokerWriteEnabled: false,
        killSwitchReady: true,
        credentialCustodyRequired: true,
        blockers: expect.arrayContaining([
          'Live order endpoint is not implemented',
          'Broker write access is disabled',
          'Broker-order emergency cancel/flatten controls are not implemented',
        ]),
      }),
    );
    expect(status.blockers).toContain(
      'No verified Toss read-only adapter schema or credentials',
    );
    expect(status.blockers).toContain(
      'No production-verified broker polling loop',
    );
    expect(status.readiness).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'researchRunLedgerReady',
          ready: false,
        }),
        expect.objectContaining({
          key: 'riskGateReady',
          ready: true,
        }),
        expect.objectContaining({
          key: 'paperExecutionReady',
          ready: false,
        }),
        expect.objectContaining({
          key: 'paperSimulationLedgerReady',
          ready: true,
        }),
        expect.objectContaining({
          key: 'paperReservationHoldLedgerReady',
          ready: true,
        }),
        expect.objectContaining({
          key: 'paperAccountReservationLockReady',
          ready: false,
          detail:
            'Paper account reservation lock readiness requires a TypeORM DataSource transaction boundary',
        }),
        expect.objectContaining({
          key: 'schemaMigrationPolicyReady',
          ready: false,
          detail:
            'Production schema policy is blocked: TYPEORM_SYNCHRONIZE must be false in production; TYPEORM_MIGRATIONS_RUN must be true in production; Pending schema migrations must be applied',
        }),
        expect.objectContaining({
          key: 'paperAccountEventLedgerReady',
          ready: false,
        }),
        expect.objectContaining({
          key: 'brokerSnapshotLedgerReady',
          ready: false,
        }),
        expect.objectContaining({
          key: 'fundingReadinessLedgerReady',
          ready: false,
        }),
        expect.objectContaining({
          key: 'fundingCapitalUsable',
          ready: false,
          detail:
            'No funding readiness record has matched expected deposit to read-only broker truth',
        }),
        expect.objectContaining({
          key: 'executionControlReady',
          ready: true,
        }),
        expect.objectContaining({
          key: 'killSwitchRuntimeReady',
          ready: true,
        }),
        expect.objectContaining({
          key: 'liveTradingReady',
          ready: false,
        }),
      ]),
    );
  });

  it('reports production schema migration policy readiness when migrations are enforced', async () => {
    process.env.TYPEORM_SYNCHRONIZE = 'false';
    process.env.TYPEORM_MIGRATIONS_RUN = 'true';
    (
      service as unknown as {
        dataSource: { isInitialized: boolean; showMigrations: () => boolean };
      }
    ).dataSource = {
      isInitialized: true,
      showMigrations: jest.fn(() => false),
    };

    const status = await service.getStatus();

    expect(status.readiness).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'schemaMigrationPolicyReady',
          ready: true,
          detail:
            'Production schema policy uses explicit TypeORM migrations with synchronize disabled and no pending migrations',
        }),
      ]),
    );
    expect(status.blockers).not.toContain(
      'Production schema migrations are not enforced',
    );
  });

  it('trips a durable kill switch into halted execution control', async () => {
    const statusBefore = await service.getKillSwitchStatus();

    expect(statusBefore).toEqual(
      expect.objectContaining({
        armed: true,
        tripped: false,
        runtimeReady: true,
        executionControlState: 'active',
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );

    const tripped = await service.tripKillSwitch({
      actor: 'risk-operator',
      reason: 'Unexpected broker evidence mismatch',
    });

    expect(tripped).toEqual(
      expect.objectContaining({
        armed: true,
        tripped: true,
        runtimeReady: true,
        executionControlState: 'halted',
        lastActor: 'risk-operator',
        lastReason: 'Kill switch trip: Unexpected broker evidence mismatch',
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );

    const executionControl = await service.getExecutionControlState();
    expect(executionControl.state).toBe('halted');
    expect(executionControl.actor).toBe('risk-operator');
  });

  it('promotes broker fill mismatches to the action status blocker', async () => {
    brokerFills.push({
      id: 1,
      provider: 'manual',
      brokerFillRefHash: 'sha256:mismatch-fill',
      status: 'mismatch',
      symbol: '005930',
      side: 'BUY',
      quantity: 1,
      fillPrice: 100_000,
      grossNotional: 100_000,
      fee: 10,
      feeCurrency: 'KRW',
      currency: 'KRW',
      filledAt: new Date('2026-05-22T09:00:00.000Z'),
      asOf: new Date('2026-05-22T09:00:00.000Z'),
      reconciliation: {
        status: 'mismatch',
        checkedAt: '2026-05-22T09:01:00.000Z',
        symbolMatched: true,
        sideMatched: true,
        quantityMatched: false,
        notionalMatched: false,
        feeMatched: true,
        brokerQuantity: 1,
        brokerGrossNotional: 100_000,
        brokerFee: 10,
        expectedQuantity: 2,
        expectedGrossNotional: 200_000,
        expectedFee: 10,
        quantityDiff: -1,
        notionalDiff: -100_000,
        feeDiff: 0,
        tolerance: 1,
        notes: ['Broker fill mismatched paper fill evidence.'],
      },
      brokerExecutionEnabled: false,
      liveTradingEnabled: false,
      createdAt: new Date('2026-05-22T09:01:00.000Z'),
      updatedAt: new Date('2026-05-22T09:01:00.000Z'),
    } as BrokerFill);

    const status = await service.getStatus();

    expect(status.actionStatus).toEqual(
      expect.objectContaining({
        verdict: 'blocked',
        blocker: 'Latest broker fill mismatches the paper fill evidence',
        nextSafeAction:
          'Pause advancement and resolve the blocker before any further execution.',
      }),
    );
    expect(status.actionStatus.brokerFill).toEqual(
      expect.objectContaining({
        fillId: 1,
        status: 'mismatch',
        reconciliationStatus: 'mismatch',
      }),
    );
  });

  it('creates an observable autonomous run timeline', async () => {
    const run = await service.createRun('Research and allocate dry-run budget');

    expect(run.status).toBe('idle');
    expect(run.timeline[0]).toEqual(
      expect.objectContaining({
        stage: 'idle',
      }),
    );
    expect(run.nextAction).toContain('active budget envelope');
  });

  it('advances an autonomous run through research, proposal, and risk evaluation', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Autonomous budget',
      totalBudget: 10_000_000,
    });
    const run = await service.createRun({
      objective: 'Automatically research and allocate the budget',
      budgetEnvelopeId: budget.id,
    });

    const advanced = await service.advanceRun(run.id, {
      attemptPaperExecution: false,
    });

    expect(advanced.status).toBe('risk_checked');
    expect(advanced.budgetEnvelopeId).toBe(budget.id);
    expect(advanced.researchRunId).toBe(researchRuns[0].id);
    expect(advanced.proposalId).toBe(proposals[0].id);
    expect(advanced.riskEvaluationId).toBe(evaluations[0].id);
    expect(researchRuns).toHaveLength(1);
    expect(proposals).toHaveLength(1);
    expect(evaluations).toHaveLength(1);
    expect(paperOrderPlans).toHaveLength(0);
    expect(proposals[0]).toEqual(
      expect.objectContaining({
        actor: 'scheduler',
        strategyId: 'momentum_baseline:autonomous-baseline',
        brokerExecutionEnabled: false,
      }),
    );
    expect(proposals[0].orders[0]).toEqual(
      expect.objectContaining({
        side: 'BUY',
        notional: 1_000_000,
        targetPositionPct: 10,
      }),
    );
    expect(evaluations[0]).toEqual(
      expect.objectContaining({
        decision: 'ALLOW',
        brokerExecutionEnabled: false,
      }),
    );
    expect(advanced.timeline.map((event) => event.stage)).toEqual(
      expect.arrayContaining(['researching', 'proposed', 'risk_checked']),
    );
    expect(advanced.nextAction).toContain('signed paper approval');
  });

  it('blocks autonomous advancement when execution control is paused', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Paused autonomous budget',
      totalBudget: 10_000_000,
    });
    await service.updateExecutionControlState({
      state: 'paused',
      actor: 'operator',
      reason: 'Pause automation for review.',
    });
    const run = await service.createRun({
      objective: 'Attempt to advance while paused',
      budgetEnvelopeId: budget.id,
    });

    const advanced = await service.advanceRun(run.id);

    expect(advanced.status).toBe('paused');
    expect(advanced.currentStage).toBe('execution_control_blocked');
    expect(researchRuns).toHaveLength(0);
    expect(proposals).toHaveLength(0);
    expect(paperOrderPlans).toHaveLength(0);
  });

  it('rejects schedule ticks without consuming the cycle when the kill switch is halted', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Halted schedule budget',
      totalBudget: 10_000_000,
    });
    const schedule = await service.createRunSchedule({
      budgetEnvelopeId: budget.id,
      objective: 'Do not consume while halted',
      cadenceMinutes: 30,
      nextRunAt: '2026-05-23T00:00:00.000Z',
    });
    const originalNextRunAt = schedule.nextRunAt.toISOString();

    await service.tripKillSwitch({
      actor: 'operator',
      reason: 'Stop scheduled automation',
    });

    await expect(service.tickRunSchedule(schedule.id)).rejects.toThrow(
      'schedule tick was not consumed',
    );

    expect(runs).toHaveLength(0);
    expect(researchRuns).toHaveLength(0);
    expect(schedule.nextRunAt.toISOString()).toBe(originalNextRunAt);
    expect(schedule.lastTickAt).toBeUndefined();
  });

  it('advances a reducing autonomous run into a SELL-only recovery proposal', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Reducing autonomous budget',
      totalBudget: 10_000_000,
    });
    const account = await service.seedPaperAccount({
      budgetEnvelopeId: budget.id,
      cash: 8_000_000,
      positions: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          marketValue: 1_500_000,
          weightPct: 15,
          quantity: 30,
          averagePrice: 50_000,
          costBasis: 1_500_000,
          realizedPnl: 0,
        },
      ],
      actor: 'operator',
      reason: 'Seed account before reducing automation.',
      idempotencyKey: 'reducing-autonomous-seed',
    });
    await service.promotePaperAccount(account.id, {
      actor: 'operator',
      reason: 'Promote account before reducing automation.',
      idempotencyKey: 'reducing-autonomous-promote',
      expectedEventHash: paperAccountEvents[0].eventHash,
    });
    await service.updateExecutionControlState({
      state: 'reducing',
      actor: 'operator',
      reason: 'Reduce simulated exposure.',
    });
    const run = await service.createRun({
      objective: 'Automatically reduce paper exposure',
      budgetEnvelopeId: budget.id,
    });

    const advanced = await service.advanceRun(run.id, {
      attemptPaperExecution: false,
    });

    expect(advanced.status).toBe('risk_checked');
    expect(advanced.currentStage).toBe('recovery_risk_evaluated');
    expect(advanced.researchRunId).toBe(researchRuns[0].id);
    expect(advanced.proposalId).toBe(proposals[0].id);
    expect(advanced.riskEvaluationId).toBe(evaluations[0].id);
    expect(researchRuns[0]).toEqual(
      expect.objectContaining({
        strategyFamily: 'paper_recovery',
      }),
    );
    expect(proposals[0]).toEqual(
      expect.objectContaining({
        ruleId: 'paper-account-recovery-sell-only-v1',
        brokerExecutionEnabled: false,
      }),
    );
    expect(proposals[0].orders).toEqual([
      expect.objectContaining({
        symbol: '005930',
        side: 'SELL',
        notional: 1_000_000,
        targetPositionPct: 0,
      }),
    ]);
    expect(paperOrderPlans).toHaveLength(0);
    expect(advanced.timeline.map((event) => event.stage)).toEqual(
      expect.arrayContaining(['researching', 'proposed', 'risk_checked']),
    );
    expect(advanced.nextAction).toContain('recovery');
  });

  it('auto-approves and executes a reducing paper schedule into a SELL-only recovery plan', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Reducing standing paper auto budget',
      totalBudget: 10_000_000,
      mode: 'paper',
      policy: { allowPaperAutoApproval: true },
    });
    const account = await service.seedPaperAccount({
      budgetEnvelopeId: budget.id,
      cash: 8_000_000,
      positions: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          marketValue: 1_500_000,
          weightPct: 15,
          quantity: 30,
          averagePrice: 50_000,
          costBasis: 1_500_000,
          realizedPnl: 0,
        },
      ],
      actor: 'operator',
      reason: 'Seed account before reducing auto schedule.',
      idempotencyKey: 'reducing-auto-schedule-seed',
    });
    await service.promotePaperAccount(account.id, {
      actor: 'operator',
      reason: 'Promote account before reducing auto schedule.',
      idempotencyKey: 'reducing-auto-schedule-promote',
      expectedEventHash: paperAccountEvents[0].eventHash,
    });
    const datasetId = 'reducing-auto-paper-schedule-bars';
    const dates = [
      '2026-05-18',
      '2026-05-19',
      '2026-05-20',
      '2026-05-21',
      '2026-05-22',
      '2026-05-23',
    ];
    await service.importMarketDataBars({
      datasetId,
      symbol: '005930',
      bars: dates.map((date, index) => ({
        timestamp: `${date}T00:00:00.000Z`,
        availabilityTimestamp: `${date}T00:00:00.000Z`,
        open: 100 + index,
        high: 102 + index,
        low: 99 + index,
        close: 100 + index * 3,
      })),
    });
    await service.importMarketDataBars({
      datasetId,
      symbol: 'KOSPI200',
      bars: dates.map((date, index) => ({
        timestamp: `${date}T00:00:00.000Z`,
        availabilityTimestamp: `${date}T00:00:00.000Z`,
        open: 100 + index,
        high: 101 + index,
        low: 99 + index,
        close: 100 + index,
      })),
    });
    const schedule = await service.createRunSchedule({
      budgetEnvelopeId: budget.id,
      objective: 'Automatically reduce paper exposure under standing approval',
      mode: 'paper',
      cadenceMinutes: 30,
      nextRunAt: '2026-05-23T00:00:00.000Z',
      attemptPaperExecution: true,
      autoPaperApprovalEnabled: true,
      autoPaperApprover: 'system:paper-recovery-auto-approval',
      autoPaperApprovalReason: 'Standing paper recovery schedule approval.',
      researchDatasetId: datasetId,
      researchSymbol: '005930',
      researchBenchmark: 'KOSPI200',
      researchMaxDataAgeMinutes: 60,
    });
    await service.updateExecutionControlState({
      state: 'reducing',
      actor: 'operator',
      reason: 'Reduce simulated exposure automatically.',
    });

    const advanced = await service.tickRunSchedule(schedule.id, {
      leaseOwner: 'unit-test-reducing-scheduler',
    });

    expect(advanced.status).toBe('paper_ready');
    expect(advanced.currentStage).toBe('recovery_paper_execution_recorded');
    expect(researchRuns[0]).toEqual(
      expect.objectContaining({ strategyFamily: 'paper_recovery' }),
    );
    expect(proposals[0]).toEqual(
      expect.objectContaining({
        ruleId: 'paper-account-recovery-sell-only-v1',
        brokerExecutionEnabled: false,
      }),
    );
    expect(proposals[0].orders).toEqual([
      expect.objectContaining({
        symbol: '005930',
        side: 'SELL',
        targetPositionPct: 0,
      }),
    ]);
    expect(orderPlanApprovals).toHaveLength(1);
    expect(orderPlanApprovals[0]).toEqual(
      expect.objectContaining({
        proposalId: advanced.proposalId,
        approvalSource: 'recovery_auto',
        approvedByRunId: advanced.id,
        approvedByScheduleId: schedule.id,
        status: 'consumed',
        approver: 'system:paper-recovery-auto-approval',
        reason: 'Standing paper recovery schedule approval.',
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(paperOrderPlans).toHaveLength(1);
    expect(paperOrderPlans[0]).toEqual(
      expect.objectContaining({
        proposalId: advanced.proposalId,
        orderPlanApprovalId: orderPlanApprovals[0].id,
        status: 'filled',
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(paperAccountEvents).toHaveLength(3);
  });

  it('auto-approves and executes a paper schedule with standing authorization', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Standing paper auto budget',
      totalBudget: 10_000_000,
      mode: 'paper',
      policy: { allowPaperAutoApproval: true },
    });
    const account = await service.seedPaperAccount({
      budgetEnvelopeId: budget.id,
      cash: 10_000_000,
      actor: 'operator',
      reason: 'Seed before scheduled paper automation.',
      idempotencyKey: 'auto-schedule-paper-seed',
    });
    await service.promotePaperAccount(account.id, {
      actor: 'operator',
      reason: 'Promote before scheduled paper automation.',
      idempotencyKey: 'auto-schedule-paper-promote',
      expectedEventHash: paperAccountEvents[0].eventHash,
    });
    const datasetId = 'auto-paper-schedule-bars';
    const dates = [
      '2026-05-18',
      '2026-05-19',
      '2026-05-20',
      '2026-05-21',
      '2026-05-22',
      '2026-05-23',
    ];
    await service.importMarketDataBars({
      datasetId,
      symbol: '005930',
      bars: dates.map((date, index) => ({
        timestamp: `${date}T00:00:00.000Z`,
        availabilityTimestamp: `${date}T00:00:00.000Z`,
        open: 100 + index,
        high: 102 + index,
        low: 99 + index,
        close: 100 + index * 3,
      })),
    });
    await service.importMarketDataBars({
      datasetId,
      symbol: 'KOSPI200',
      bars: dates.map((date, index) => ({
        timestamp: `${date}T00:00:00.000Z`,
        availabilityTimestamp: `${date}T00:00:00.000Z`,
        open: 100 + index,
        high: 101 + index,
        low: 99 + index,
        close: 100 + index,
      })),
    });
    const schedule = await service.createRunSchedule({
      budgetEnvelopeId: budget.id,
      objective: 'Run paper automation under standing authorization',
      mode: 'paper',
      cadenceMinutes: 30,
      nextRunAt: '2026-05-23T00:00:00.000Z',
      attemptPaperExecution: true,
      autoPaperApprovalEnabled: true,
      autoPaperApprover: 'system:paper-auto-approval',
      autoPaperApprovalReason: 'Standing paper schedule approval.',
      researchDatasetId: datasetId,
      researchSymbol: '005930',
      researchBenchmark: 'KOSPI200',
      researchMaxDataAgeMinutes: 60,
    });

    const advanced = await service.tickRunSchedule(schedule.id, {
      leaseOwner: 'unit-test-scheduler',
    });
    const repeated = await service.advanceRun(advanced.id);

    expect(advanced.status).toBe('paper_ready');
    expect(advanced.paperOrderPlanId).toBe(paperOrderPlans[0].id);
    expect(advanced.riskEvaluationId).toBe(
      orderPlanApprovals[0].riskEvaluationId,
    );
    expect(repeated.paperOrderPlanId).toBe(paperOrderPlans[0].id);
    expect(orderPlanApprovals).toHaveLength(1);
    expect(orderPlanApprovals[0]).toEqual(
      expect.objectContaining({
        proposalId: advanced.proposalId,
        approvalSource: 'paper_auto',
        approvedByRunId: advanced.id,
        approvedByScheduleId: schedule.id,
        status: 'consumed',
        approver: 'system:paper-auto-approval',
        reason: 'Standing paper schedule approval.',
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(orderPlanApprovals[0].idempotencyKey).toContain(
      `auto-paper-approval:schedule:${schedule.id}:cycle:${advanced.cycleKey}:proposal:${advanced.proposalId}`,
    );
    expect(orderPlanApprovals[0].autoApprovalPolicyRef).toBe(
      schedule.autoPaperApprovalBudgetHash,
    );
    expect(paperOrderPlans).toHaveLength(1);
    expect(paperOrderPlans[0]).toEqual(
      expect.objectContaining({
        proposalId: advanced.proposalId,
        orderPlanApprovalId: orderPlanApprovals[0].id,
        riskEvaluationId: orderPlanApprovals[0].riskEvaluationId,
        status: 'filled',
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(paperAccountEvents).toHaveLength(3);
  });

  it('rejects standing paper authorization without an explicit budget policy', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Paper budget without standing authorization',
      totalBudget: 10_000_000,
      mode: 'paper',
    });
    const datasetId = 'policy-reject-paper-schedule-bars';
    const dates = [
      '2026-05-18',
      '2026-05-19',
      '2026-05-20',
      '2026-05-21',
      '2026-05-22',
      '2026-05-23',
    ];
    await service.importMarketDataBars({
      datasetId,
      symbol: '005930',
      bars: dates.map((date, index) => ({
        timestamp: `${date}T00:00:00.000Z`,
        availabilityTimestamp: `${date}T00:00:00.000Z`,
        open: 100 + index,
        high: 102 + index,
        low: 99 + index,
        close: 100 + index * 3,
      })),
    });
    await service.importMarketDataBars({
      datasetId,
      symbol: 'KOSPI200',
      bars: dates.map((date, index) => ({
        timestamp: `${date}T00:00:00.000Z`,
        availabilityTimestamp: `${date}T00:00:00.000Z`,
        open: 100 + index,
        high: 101 + index,
        low: 99 + index,
        close: 100 + index,
      })),
    });

    await expect(
      service.createRunSchedule({
        budgetEnvelopeId: budget.id,
        objective: 'Attempt paper automation without policy opt-in',
        mode: 'paper',
        attemptPaperExecution: true,
        autoPaperApprovalEnabled: true,
        researchDatasetId: datasetId,
        researchSymbol: '005930',
        researchBenchmark: 'KOSPI200',
      }),
    ).rejects.toThrow('Paper auto approval requires');
  });

  it('continues an approved autonomous run into one paper plan', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Paper autonomous budget',
      totalBudget: 10_000_000,
    });
    const run = await service.createRun({
      objective: 'Advance into approved paper execution',
      budgetEnvelopeId: budget.id,
    });
    const riskChecked = await service.advanceRun(run.id, {
      attemptPaperExecution: false,
    });
    const account = await service.seedPaperAccount({
      budgetEnvelopeId: budget.id,
      cash: 10_000_000,
      actor: 'operator',
      reason: 'Seed before autonomous paper execution.',
      idempotencyKey: 'autonomous-paper-seed',
    });
    await service.promotePaperAccount(account.id, {
      actor: 'operator',
      reason: 'Promote before autonomous paper execution.',
      idempotencyKey: 'autonomous-paper-promote',
      expectedEventHash: paperAccountEvents[0].eventHash,
    });
    const approval = await service.createOrderPlanApproval(
      riskChecked.proposalId,
      {
        approver: 'operator',
        reason: 'Approve autonomous paper order plan.',
        idempotencyKey: 'autonomous-paper-approval',
        expectedPaperAccountEventHash: paperAccountEvents[1].eventHash,
      },
    );

    const paperAdvanced = await service.advanceRun(run.id);
    const repeated = await service.advanceRun(run.id);

    expect(paperAdvanced.status).toBe('paper_ready');
    expect(paperAdvanced.paperOrderPlanId).toBe(paperOrderPlans[0].id);
    expect(repeated.paperOrderPlanId).toBe(paperOrderPlans[0].id);
    expect(paperOrderPlans).toHaveLength(1);
    expect(paperOrderPlans[0]).toEqual(
      expect.objectContaining({
        proposalId: riskChecked.proposalId,
        orderPlanApprovalId: approval.id,
        status: 'filled',
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(orderPlanApprovals[0].status).toBe('consumed');
    expect(paperAccountEvents).toHaveLength(3);
    expect(paperAccountEvents[2]).toEqual(
      expect.objectContaining({
        eventType: 'paper_order_plan',
        sourceId: paperOrderPlans[0].id,
      }),
    );
  });

  it('ticks a due autonomous schedule with a lease and no duplicate cycle', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Scheduled autonomous budget',
      totalBudget: 10_000_000,
    });
    const schedule = await service.createRunSchedule({
      budgetEnvelopeId: budget.id,
      objective: 'Run scheduled autonomous baseline',
      cadenceMinutes: 30,
      nextRunAt: '2026-05-23T00:00:00.000Z',
    });
    expect(schedule.attemptPaperExecution).toBe(false);

    const firstRun = await service.tickRunSchedule(schedule.id, {
      leaseOwner: 'unit-test-scheduler',
      attemptPaperExecution: false,
    });
    const secondRun = await service.tickRunSchedule(schedule.id, {
      force: true,
      leaseOwner: 'unit-test-scheduler',
      attemptPaperExecution: false,
    });

    expect(firstRun.status).toBe('risk_checked');
    expect(firstRun.scheduleId).toBe(schedule.id);
    expect(firstRun.cycleKey).toBe('schedule:1:2026-05-23T00:00:00.000Z');
    expect(secondRun.status).toBe('risk_checked');
    expect(secondRun.cycleKey).toBe('schedule:1:2026-05-23T00:30:00.000Z');
    expect(runs).toHaveLength(2);
    expect(researchRuns).toHaveLength(2);
    expect(proposals).toHaveLength(2);
    expect(evaluations).toHaveLength(2);
    expect(runSchedules[0]).toEqual(
      expect.objectContaining({
        lastRunId: secondRun.id,
        lastCycleKey: 'schedule:1:2026-05-23T00:30:00.000Z',
        leaseOwner: null,
        leaseExpiresAt: null,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(runSchedules[0].nextRunAt.toISOString()).toBe(
      '2026-05-23T01:00:00.000Z',
    );
  });

  it('rejects schedule ticks while an active lease exists', async () => {
    const budget = await service.createBudgetEnvelope({
      name: 'Leased autonomous budget',
      totalBudget: 10_000_000,
    });
    const schedule = await service.createRunSchedule({
      budgetEnvelopeId: budget.id,
      objective: 'Run leased autonomous baseline',
      cadenceMinutes: 30,
      nextRunAt: '2026-05-23T00:00:00.000Z',
    });
    schedule.leaseOwner = 'other-worker';
    schedule.leaseExpiresAt = new Date('2026-05-23T00:02:00.000Z');

    await expect(service.tickRunSchedule(schedule.id)).rejects.toThrow(
      'already leased',
    );
    expect(runs).toHaveLength(0);
    expect(researchRuns).toHaveLength(0);
  });

  it('rejects invalid autonomous schedule and tick inputs before side effects', async () => {
    await expect(
      service.createRunSchedule({
        budgetEnvelopeId: undefined as unknown as number,
        objective: 'Missing budget id',
      }),
    ).rejects.toThrow('positive budgetEnvelopeId');

    const budget = await service.createBudgetEnvelope({
      name: 'Validated autonomous budget',
      totalBudget: 10_000_000,
    });
    const schedule = await service.createRunSchedule({
      budgetEnvelopeId: budget.id,
      objective: 'Run validated autonomous baseline',
      cadenceMinutes: 30,
      nextRunAt: '2026-05-23T00:00:00.000Z',
    });

    await expect(
      service.tickRunSchedule(schedule.id, {
        force: 'false' as unknown as boolean,
      }),
    ).rejects.toThrow('force must be boolean');
    await expect(
      service.tickRunSchedule(schedule.id, {
        leaseTtlSeconds: 0,
      }),
    ).rejects.toThrow('leaseTtlSeconds');
    expect(runs).toHaveLength(0);
    expect(researchRuns).toHaveLength(0);
  });
});
