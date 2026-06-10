import type { AgentDecisionRecord } from '../../../entities/agent-decision-record.entity';
import type { ProposedOrder } from '../../risk-gate/risk-gate.types';

export const ACTIVE_AGENT_ORDER_INTENT_MAPPER_VERSION =
  'active-agent-order-intent-v1';

export const ACTIVE_AGENT_PAPER_EQUITY_USD = 10_000;
export const ACTIVE_AGENT_MAX_SINGLE_POSITION_PCT = 10;
export const ACTIVE_AGENT_MAX_GROSS_EXPOSURE_PCT = 30;
export const ACTIVE_AGENT_MAX_ORDER_NOTIONAL_USD = 1_000;

export interface ActiveAgentOrderIntentMapperOptions {
  maxActions?: number;
  equityUsd?: number;
  maxSinglePositionPct?: number;
}

export interface ActiveAgentMappedOrders {
  mapperVersion: string;
  orders: ProposedOrder[];
  selectedDecisionIds: string[];
  blockers: string[];
  evidenceRefs: string[];
}

/**
 * Converts sanitized LLM action plans into risk-gate order intents.
 * The LLM may express direction and sizing hints only; account, quantity, price,
 * leverage, credentials, and final order submission stay outside this boundary.
 */
export function mapActiveAgentDecisionsToOrders(
  decisions: AgentDecisionRecord[],
  options: ActiveAgentOrderIntentMapperOptions = {},
): ActiveAgentMappedOrders {
  const maxActions = options.maxActions ?? 3;
  const equityUsd = options.equityUsd ?? ACTIVE_AGENT_PAPER_EQUITY_USD;
  const maxSinglePositionPct =
    options.maxSinglePositionPct ?? ACTIVE_AGENT_MAX_SINGLE_POSITION_PCT;
  const selected = decisions
    .filter((decision) => decision.status === 'proposed')
    .sort(compareAgentDecisions)
    .slice(0, maxActions);
  const orders = selected.flatMap((decision) =>
    mapDecisionToOrder(decision, equityUsd, maxSinglePositionPct),
  );

  return {
    mapperVersion: ACTIVE_AGENT_ORDER_INTENT_MAPPER_VERSION,
    orders,
    selectedDecisionIds: selected.map((decision) => decision.id),
    blockers:
      selected.length > 0 && orders.length === 0
        ? [
            'Proposed active LLM decisions did not produce actionable order intents.',
          ]
        : [],
    evidenceRefs: [
      `mapper:${ACTIVE_AGENT_ORDER_INTENT_MAPPER_VERSION}`,
      ...selected.map((decision) => `agent-decision:${decision.id}`),
    ],
  };
}

function compareAgentDecisions(
  left: AgentDecisionRecord,
  right: AgentDecisionRecord,
): number {
  return (
    right.confidence - left.confidence ||
    left.symbol.localeCompare(right.symbol) ||
    left.id.localeCompare(right.id)
  );
}

function mapDecisionToOrder(
  decision: AgentDecisionRecord,
  equityUsd: number,
  maxSinglePositionPct: number,
): ProposedOrder[] {
  const action =
    typeof decision.proposedAction.action === 'string'
      ? decision.proposedAction.action
      : 'hold';
  const side =
    action === 'increase_exposure' && decision.direction === 'up'
      ? ('BUY' as const)
      : action === 'reduce_exposure' || decision.direction === 'down'
        ? ('SELL' as const)
        : undefined;
  if (!side) {
    return [];
  }
  const hintedPct = finiteNumber(decision.proposedAction.maxPositionPctHint);
  const targetPositionPct = roundPercent(
    Math.min(
      maxSinglePositionPct,
      Math.max(
        1,
        hintedPct !== undefined
          ? hintedPct * 100
          : Math.round(decision.confidence * 10),
      ),
    ),
  );
  const signedTargetPositionPct =
    side === 'BUY' ? targetPositionPct : -targetPositionPct;

  return [
    {
      symbol: decision.symbol,
      assetClass: 'foreign_etf',
      side,
      orderType: 'MARKET',
      notional: Math.min(
        ACTIVE_AGENT_MAX_ORDER_NOTIONAL_USD,
        Math.max(100, Math.round((targetPositionPct / 100) * equityUsd)),
      ),
      targetPositionPct: signedTargetPositionPct,
    },
  ];
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function roundPercent(value: number): number {
  return Number(value.toFixed(2));
}
