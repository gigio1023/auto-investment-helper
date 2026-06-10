/**
 * Replays a paper order plan as simulated broker evidence.
 * This proves broker-adapter plumbing only: broker writes remain disabled,
 * and simulated artifacts must not be promoted as real broker readiness.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { BrokerFill } from '../../../entities/broker-fill.entity';
import type { BrokerOrderCommand } from '../../../entities/broker-order-command.entity';
import type { BrokerOrderStatusRecord } from '../../../entities/broker-order-status.entity';
import type { BrokerSnapshot } from '../../../entities/broker-snapshot.entity';
import {
  PaperFill,
  PaperOrderPlan,
  PaperOrderPlanStatus,
} from '../../../entities/paper-order-plan.entity';
import type {
  BrokerAdapterStatus,
  ImportBrokerOrderStatusRequest,
} from '../../control-plane/control-plane.types';
import { ControlPlaneService } from '../../control-plane/control-plane.service';

export interface SimulatedBrokerRehearsalOptions {
  paperOrderPlanId?: number;
  tolerance?: number;
}

export interface SimulatedBrokerRehearsalResult {
  status: 'passed' | 'blocked' | 'failed';
  mode: 'simulated-broker-rehearsal';
  paperOrderPlanId?: number;
  brokerOrderCommandId?: number;
  brokerOrderCommandStatus?: BrokerOrderCommand['status'];
  simulatedBrokerSnapshotId?: number;
  simulatedBrokerSnapshotStatus?: BrokerSnapshot['status'];
  simulatedBrokerFillIds: number[];
  matchedBrokerFillCount: number;
  simulatedBrokerOrderStatusIds: number[];
  brokerOrderStatusDryRunMismatchCount: number;
  brokerOrderStatusShapeMismatchCount: number;
  blockers: string[];
  evidenceRefs: string[];
  brokerExecutionEnabled: false;
  liveTradingEnabled: false;
}

const REHEARSABLE_PLAN_STATUSES: PaperOrderPlanStatus[] = [
  'filled',
  'reconciled',
  'partially_filled',
];

@Injectable()
export class SimulatedBrokerRehearsalService {
  constructor(
    private readonly controlPlaneService: ControlPlaneService,
    @InjectRepository(PaperOrderPlan)
    private readonly paperOrderPlanRepository: Repository<PaperOrderPlan>,
  ) {}

  async run(
    options: SimulatedBrokerRehearsalOptions = {},
  ): Promise<SimulatedBrokerRehearsalResult> {
    const paperPlan = await this.findPaperOrderPlan(options.paperOrderPlanId);
    if (!paperPlan) {
      return this.blocked([
        options.paperOrderPlanId
          ? `Paper order plan ${options.paperOrderPlanId} was not found.`
          : 'No filled or reconciled paper order plan is available for simulated broker rehearsal.',
      ]);
    }

    const filledPaperFills = paperPlan.fills.filter(
      (fill) => fill.status === 'filled',
    );
    const blockers = this.getPaperPlanBlockers(paperPlan, filledPaperFills);
    if (blockers.length > 0) {
      return this.blocked(blockers, paperPlan.id);
    }

    try {
      const command = await this.prepareDryRunBrokerOrderCommand(paperPlan);
      const orderStatuses = await this.importSimulatedOrderStatuses(
        paperPlan,
        command,
      );
      const brokerFills = await this.importAndReconcileSimulatedFills(
        paperPlan,
        filledPaperFills,
        options.tolerance,
      );
      const snapshot = await this.importAndReconcileSimulatedSnapshot(
        paperPlan,
        options.tolerance,
      );
      const matchedFillCount = brokerFills.filter(
        (fill) => fill.status === 'matched',
      ).length;
      const dryRunMismatchCount = orderStatuses.filter(
        (status) =>
          status.reconciliation.commandDryRunOnly &&
          status.status === 'mismatch' &&
          status.reconciliation.symbolMatched &&
          status.reconciliation.sideMatched &&
          status.reconciliation.orderTypeMatched &&
          status.reconciliation.notionalWithinPlan &&
          status.reconciliation.quantityWithinPlan,
      ).length;
      const shapeMismatchCount = orderStatuses.filter(
        (status) =>
          status.status === 'mismatch' &&
          !(
            status.reconciliation.symbolMatched &&
            status.reconciliation.sideMatched &&
            status.reconciliation.orderTypeMatched &&
            status.reconciliation.notionalWithinPlan &&
            status.reconciliation.quantityWithinPlan
          ),
      ).length;
      const resultBlockers = [
        matchedFillCount === filledPaperFills.length
          ? undefined
          : 'Not all simulated broker fills matched paper fills.',
        snapshot.status === 'matched'
          ? undefined
          : 'Simulated broker snapshot did not match paper account state.',
        shapeMismatchCount === 0
          ? undefined
          : 'At least one simulated broker order status did not match the dry-run command intent shape.',
      ].filter((blocker): blocker is string => Boolean(blocker));

      return {
        status: resultBlockers.length > 0 ? 'failed' : 'passed',
        mode: 'simulated-broker-rehearsal',
        paperOrderPlanId: paperPlan.id,
        brokerOrderCommandId: command.id,
        brokerOrderCommandStatus: command.status,
        simulatedBrokerSnapshotId: snapshot.id,
        simulatedBrokerSnapshotStatus: snapshot.status,
        simulatedBrokerFillIds: brokerFills.map((fill) => fill.id),
        matchedBrokerFillCount: matchedFillCount,
        simulatedBrokerOrderStatusIds: orderStatuses.map((status) => status.id),
        brokerOrderStatusDryRunMismatchCount: dryRunMismatchCount,
        brokerOrderStatusShapeMismatchCount: shapeMismatchCount,
        blockers: resultBlockers,
        evidenceRefs: [
          `paper-order-plan:${paperPlan.id}`,
          `broker-order-command:${command.id}`,
          `broker-snapshot:${snapshot.id}`,
          ...brokerFills.map((fill) => `broker-fill:${fill.id}`),
          ...orderStatuses.map((status) => `broker-order-status:${status.id}`),
        ],
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      };
    } catch (error) {
      return this.blocked([errorMessage(error)], paperPlan.id);
    }
  }

  private async findPaperOrderPlan(
    paperOrderPlanId: number | undefined,
  ): Promise<PaperOrderPlan | null> {
    if (paperOrderPlanId) {
      return this.controlPlaneService.getPaperOrderPlan(paperOrderPlanId);
    }

    const plans = await this.paperOrderPlanRepository.find({
      order: { updatedAt: 'DESC', id: 'DESC' },
    });

    return (
      plans.find(
        (plan) =>
          REHEARSABLE_PLAN_STATUSES.includes(plan.status) &&
          plan.fills.some((fill) => fill.status === 'filled'),
      ) ?? null
    );
  }

  private getPaperPlanBlockers(
    paperPlan: PaperOrderPlan,
    filledPaperFills: PaperFill[],
  ): string[] {
    return [
      REHEARSABLE_PLAN_STATUSES.includes(paperPlan.status)
        ? undefined
        : `Paper order plan ${paperPlan.id} status is ${paperPlan.status}; expected filled, reconciled, or partially_filled.`,
      paperPlan.paperAccountId
        ? undefined
        : `Paper order plan ${paperPlan.id} is not tied to a paper account.`,
      paperPlan.orders.length > 0
        ? undefined
        : `Paper order plan ${paperPlan.id} has no paper orders.`,
      filledPaperFills.length > 0
        ? undefined
        : `Paper order plan ${paperPlan.id} has no filled paper fills.`,
      paperPlan.brokerExecutionEnabled === false
        ? undefined
        : 'Paper order plan unexpectedly has broker execution enabled.',
      paperPlan.liveTradingEnabled === false
        ? undefined
        : 'Paper order plan unexpectedly has live trading enabled.',
    ].filter((blocker): blocker is string => Boolean(blocker));
  }

  private async prepareDryRunBrokerOrderCommand(
    paperPlan: PaperOrderPlan,
  ): Promise<BrokerOrderCommand> {
    return this.controlPlaneService.prepareBrokerOrderCommandFromPaperPlan(
      paperPlan.id,
      {
        idempotencyKey: `simulated-broker-rehearsal:command:${paperPlan.id}:${paperPlan.planHash}`,
        notes: [
          'Prepared by simulated broker rehearsal. The command remains dry-run only.',
        ],
      },
      this.buildSimulatedBrokerAdapterStatus(),
    );
  }

  private async importSimulatedOrderStatuses(
    paperPlan: PaperOrderPlan,
    command: BrokerOrderCommand,
  ): Promise<BrokerOrderStatusRecord[]> {
    const accountRefHash = this.controlPlaneService.hashObject({
      accountRef: this.simulatedAccountRef(paperPlan),
    });
    const statuses: BrokerOrderStatusRecord[] = [];

    for (const order of paperPlan.orders) {
      const fills = paperPlan.fills.filter(
        (fill) =>
          fill.paperOrderId === order.paperOrderId && fill.status === 'filled',
      );
      const filledQuantity = roundQuantity(
        fills.reduce((total, fill) => total + fill.quantity, 0),
      );
      const filledNotional = roundMoney(
        fills.reduce((total, fill) => total + fill.grossNotional, 0),
      );
      const averageFillPrice =
        filledQuantity > 0 ? roundMoney(filledNotional / filledQuantity) : 0;
      const request: ImportBrokerOrderStatusRequest = {
        provider: 'simulated',
        sourceRef: 'simulated-broker-rehearsal',
        accountRefHash,
        brokerOrderRefHash: this.controlPlaneService.hashObject({
          mode: 'simulated-broker-rehearsal',
          paperOrderPlanId: paperPlan.id,
          paperOrderId: order.paperOrderId,
        }),
        brokerOrderCommandId: command.id,
        brokerOrderIntentId: command.orderIntents.find(
          (intent) => intent.sourcePaperOrderId === order.paperOrderId,
        )?.brokerOrderIntentId,
        paperOrderPlanId: paperPlan.id,
        externalStatus: filledQuantity > 0 ? 'filled' : 'rejected',
        symbol: order.symbol,
        side: order.side,
        orderType: order.orderType,
        requestedQuantity: order.requestedQuantity,
        filledQuantity,
        remainingQuantity: 0,
        requestedNotional: order.requestedNotional,
        averageFillPrice: averageFillPrice || undefined,
        limitPrice: order.requestedPrice,
        currency: paperPlan.portfolioAfter.currency,
        submittedAt: paperPlan.submittedAt.toISOString(),
        asOf:
          latestFillTimestamp(fills) ?? paperPlan.completedAt?.toISOString(),
        notes: [
          'Simulated order status mirrors the local paper order only; dry-run command mismatch is expected.',
        ],
      };
      statuses.push(
        await this.controlPlaneService.importBrokerOrderStatus(request),
      );
    }

    return statuses;
  }

  private async importAndReconcileSimulatedFills(
    paperPlan: PaperOrderPlan,
    paperFills: PaperFill[],
    tolerance: number | undefined,
  ): Promise<BrokerFill[]> {
    const brokerFills: BrokerFill[] = [];

    for (const paperFill of paperFills) {
      const imported = await this.controlPlaneService.importBrokerFill({
        provider: 'simulated',
        sourceRef: 'simulated-broker-rehearsal',
        accountRef: this.simulatedAccountRef(paperPlan),
        brokerOrderRef: `simulated-broker-order:${paperPlan.id}:${paperFill.paperOrderId}`,
        brokerFillRef: `simulated-broker-fill:${paperPlan.id}:${paperFill.paperFillId}`,
        symbol: paperFill.symbol,
        side: paperFill.side,
        quantity: paperFill.quantity,
        fillPrice: paperFill.fillPrice,
        grossNotional: paperFill.grossNotional,
        fee: paperFill.fee,
        feeCurrency: paperFill.feeCurrency,
        currency: paperPlan.portfolioAfter.currency,
        filledAt: paperFill.timestamp,
        asOf: paperFill.timestamp,
      });
      brokerFills.push(
        await this.controlPlaneService.reconcileBrokerFill(imported.id, {
          paperOrderPlanId: paperPlan.id,
          paperFillId: paperFill.paperFillId,
          tolerance,
          notes: ['Reconciled by simulated broker rehearsal.'],
        }),
      );
    }

    return brokerFills;
  }

  private async importAndReconcileSimulatedSnapshot(
    paperPlan: PaperOrderPlan,
    tolerance: number | undefined,
  ): Promise<BrokerSnapshot> {
    const imported = await this.controlPlaneService.importBrokerSnapshot({
      provider: 'simulated',
      sourceRef: 'simulated-broker-rehearsal',
      accountRef: this.simulatedAccountRef(paperPlan),
      asOf: new Date().toISOString(),
      currency: paperPlan.portfolioAfter.currency,
      cash: paperPlan.endingCash,
      equity: paperPlan.endingEquity,
      grossExposurePct: paperPlan.portfolioAfter.grossExposurePct,
      positions: paperPlan.portfolioAfter.positions,
    });

    return this.controlPlaneService.reconcileBrokerSnapshot(imported.id, {
      paperAccountId: paperPlan.paperAccountId,
      tolerance,
      notes: ['Reconciled by simulated broker rehearsal.'],
    });
  }

  private buildSimulatedBrokerAdapterStatus(): BrokerAdapterStatus {
    const now = new Date().toISOString();
    return {
      provider: 'simulated',
      configured: true,
      readOnlyEnabled: true,
      paperTradingEnabled: true,
      liveTradingEnabled: false,
      authMethod: 'none',
      credentialRef: 'simulated',
      credentialCustody: {
        mode: 'missing',
        configured: false,
        productionReady: false,
        secretRef: 'simulated',
        detail:
          'Simulated broker rehearsal uses no production credential custody.',
      },
      schemaVerified: true,
      sandboxVerified: true,
      lastVerifiedAt: now,
      readOnlyPoll: {
        provider: 'toss',
        enabled: false,
        configured: true,
        schemaVerified: true,
        fillPollingEnabled: true,
        fillSchemaVerified: true,
        fillPathConfigured: true,
        canPoll: true,
        canPollFills: true,
        baseUrl: 'simulated://broker-rehearsal',
        accountRef: 'simulated',
        allowedEndpoints: [],
        cron: 'manual',
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
        checkedAt: now,
        blockers: [
          'Simulated broker rehearsal does not implement cancel, replace, flatten, or real open-order polling.',
        ],
        detail:
          'Simulator can import read-only artifacts, but broker writes remain unavailable.',
      },
      capabilities: [
        {
          key: 'credentials',
          status: 'configured',
          detail: 'Simulator requires no credential env.',
        },
        {
          key: 'credentialCustody',
          status: 'blocked',
          detail: 'No production broker credential custody exists here.',
        },
        {
          key: 'openApiSchema',
          status: 'ready',
          detail: 'Simulator uses the repository broker evidence schema.',
        },
        {
          key: 'readOnlyAccountSnapshot',
          status: 'ready',
          detail: 'Simulator can emit account snapshots from paper state.',
        },
        {
          key: 'holdingsSnapshot',
          status: 'ready',
          detail: 'Simulator can emit holdings from paper state.',
        },
        {
          key: 'orderPreview',
          status: 'not_implemented',
          detail: 'Order preview remains a real broker adapter requirement.',
        },
        {
          key: 'paperOrSandbox',
          status: 'configured',
          detail: 'Simulator is paper-only.',
        },
        {
          key: 'orderPlacement',
          status: 'blocked',
          detail: 'Order placement remains disabled.',
        },
        {
          key: 'orderCancelReplace',
          status: 'not_implemented',
          detail: 'Cancel/replace remains a real broker adapter requirement.',
        },
        {
          key: 'fillPolling',
          status: 'ready',
          detail: 'Simulator can import fill reports from paper fills.',
        },
        {
          key: 'reconciliation',
          status: 'ready',
          detail:
            'Simulator validates existing broker fill and snapshot reconciliation contracts.',
        },
        {
          key: 'killSwitch',
          status: 'blocked',
          detail:
            'Runtime kill switch exists, but real broker emergency controls are not implemented.',
        },
      ],
      blockers: [
        'Simulated broker evidence is not production broker readiness.',
        'Broker write access is disabled.',
      ],
      brokerExecutionEnabled: false,
    };
  }

  private simulatedAccountRef(paperPlan: PaperOrderPlan): string {
    return `simulated-paper-account:${paperPlan.paperAccountId ?? 'missing'}`;
  }

  private blocked(
    blockers: string[],
    paperOrderPlanId?: number,
  ): SimulatedBrokerRehearsalResult {
    return {
      status: 'blocked',
      mode: 'simulated-broker-rehearsal',
      paperOrderPlanId,
      simulatedBrokerFillIds: [],
      matchedBrokerFillCount: 0,
      simulatedBrokerOrderStatusIds: [],
      brokerOrderStatusDryRunMismatchCount: 0,
      brokerOrderStatusShapeMismatchCount: 0,
      blockers,
      evidenceRefs: paperOrderPlanId
        ? [`paper-order-plan:${paperOrderPlanId}`]
        : [],
      brokerExecutionEnabled: false,
      liveTradingEnabled: false,
    };
  }
}

function latestFillTimestamp(fills: PaperFill[]): string | undefined {
  return fills
    .map((fill) => fill.timestamp)
    .filter((timestamp) => Number.isFinite(new Date(timestamp).getTime()))
    .sort(
      (left, right) => new Date(right).getTime() - new Date(left).getTime(),
    )[0];
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function roundQuantity(value: number): number {
  return Number(value.toFixed(8));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown blocked condition.';
}
