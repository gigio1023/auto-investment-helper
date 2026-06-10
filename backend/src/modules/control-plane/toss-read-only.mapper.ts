import { BadRequestException } from '@nestjs/common';
import {
  ImportBrokerFillRequest,
  ImportBrokerOrderStatusRequest,
  ImportBrokerSnapshotRequest,
} from './control-plane.types';
import type { BrokerOrderExternalStatus } from '../../entities/broker-order-status.entity';
import type {
  AssetClass,
  OrderType,
  PositionSnapshot,
} from '../risk-gate/risk-gate.types';
import { hashString } from '../../shared/hash.util';

export interface TossReadOnlyRawSnapshot {
  accountRef: string;
  asOf: string;
  holdings: Record<string, unknown>;
  krwBuyingPower?: Record<string, unknown>;
  usdBuyingPower?: Record<string, unknown>;
  usdKrwExchangeRate?: Record<string, unknown>;
}

export interface TossReadOnlyRawFills {
  accountRef: string;
  asOf: string;
  fills: Record<string, unknown>;
}

type MappedTossFill = Omit<
  ImportBrokerFillRequest,
  'provider' | 'sourceRef' | 'accountRef'
>;

const POSITION_FIELDS = {
  symbol: ['symbol', 'stockCode', 'ticker', 'code', 'isin'],
  name: ['name', 'stockName', 'displayName'],
  marketValue: [
    'marketValue.amountAfterCost',
    'marketValue.amount',
    'marketValue',
    'evaluationAmount',
    'evaluatedAmount',
    'amount',
    'balance',
    'assetAmount',
  ],
  assetClass: ['assetClass', 'productType', 'market', 'marketCountry'],
  currency: ['currency'],
};

const FILL_FIELDS = {
  fillRef: ['fillId', 'executionId', 'tradeId', 'id', 'executionNo'],
  orderRef: ['orderId', 'orderNo', 'brokerOrderId', 'originalOrderId'],
  symbol: ['symbol', 'stockCode', 'ticker', 'code', 'isin'],
  side: ['side', 'orderSide', 'tradeSide', 'buySellType', 'transactionType'],
  quantity: [
    'filledQuantity',
    'execution.filledQuantity',
    'executedQuantity',
    'quantity',
    'qty',
  ],
  fillPrice: [
    'fillPrice',
    'executedPrice',
    'execution.averageFilledPrice',
    'price',
    'averagePrice',
  ],
  grossNotional: [
    'grossNotional',
    'execution.filledAmount',
    'executedAmount',
    'tradeAmount',
    'amount',
    'notional',
  ],
  fee: [
    'fee',
    'execution.commission',
    'commission',
    'commissionAmount',
    'totalFee',
  ],
  feeCurrency: ['feeCurrency', 'currency'],
  currency: ['currency', 'settlementCurrency'],
  filledAt: [
    'filledAt',
    'execution.filledAt',
    'executedAt',
    'tradeAt',
    'timestamp',
    'createdAt',
  ],
};

export function mapTossReadOnlySnapshot(
  snapshot: TossReadOnlyRawSnapshot,
): ImportBrokerSnapshotRequest {
  const usdKrwRate = extractUsdKrwRate(snapshot.usdKrwExchangeRate);
  const cash = calculateCashInKrw(
    snapshot.holdings,
    snapshot.krwBuyingPower,
    snapshot.usdBuyingPower,
    usdKrwRate,
  );
  const positions = extractPositions(snapshot.holdings, usdKrwRate);
  const positionsValue = positions.reduce(
    (total, position) => total + Math.abs(position.marketValue),
    0,
  );

  if (cash === undefined || !Number.isFinite(cash) || cash < 0) {
    throw new BadRequestException(
      'Toss read-only holdings response is missing cash',
    );
  }

  const equity = roundMoney(cash + positionsValue);

  if (!Number.isFinite(equity) || equity < 0) {
    throw new BadRequestException(
      'Toss read-only holdings response is missing equity',
    );
  }

  return {
    provider: 'toss',
    sourceRef: 'toss-read-only-poll',
    accountRef: snapshot.accountRef,
    asOf: snapshot.asOf,
    currency: 'KRW',
    cash,
    equity,
    positions: positions.map((position) => ({
      ...position,
      weightPct:
        position.weightPct ??
        (equity === 0 ? 0 : roundMoney((position.marketValue / equity) * 100)),
    })),
  };
}

export function mapTossReadOnlyFills(
  raw: TossReadOnlyRawFills,
): ImportBrokerFillRequest[] {
  return extractFills(raw.fills).map((fill, index) => ({
    provider: 'toss',
    sourceRef: `toss-read-only-fill-poll:${index}`,
    accountRef: raw.accountRef,
    ...fill,
    asOf: raw.asOf,
  }));
}

export function mapTossReadOnlyOrderStatuses(
  raw: TossReadOnlyRawFills,
): ImportBrokerOrderStatusRequest[] {
  return extractOrderStatuses(raw.fills, raw.accountRef, raw.asOf);
}

function extractOrderStatuses(
  ordersResponse: Record<string, unknown>,
  accountRef: string,
  asOf: string,
): ImportBrokerOrderStatusRequest[] {
  const orders = readArray(ordersResponse, [
    'orders',
    'result.orders',
    'items',
    'result.items',
    'data.orders',
    'data.items',
  ]);

  return orders.map((item, index) => {
    const record = asRecord(item);

    if (!record) {
      throw new BadRequestException(
        `Toss read-only order item ${index} is not an object`,
      );
    }

    const orderId = readFirstString(record, ['orderId', 'id']);
    const symbol = readFirstString(record, FILL_FIELDS.symbol);
    const side = mapTossOrderSide(readFirstString(record, FILL_FIELDS.side));
    const orderType = mapTossOrderType(readFirstString(record, ['orderType']));
    const externalStatus = mapTossOrderStatus(
      readFirstString(record, ['status']),
    );
    const requestedQuantity = readFirstFiniteNumber(record, ['quantity']);
    const filledQuantity = readFirstFiniteNumber(record, FILL_FIELDS.quantity);
    const limitPrice = readFirstFiniteNumber(record, ['price']);
    const averageFillPrice = readFirstFiniteNumber(
      record,
      FILL_FIELDS.fillPrice,
    );
    const requestedNotional =
      readFirstFiniteNumber(record, ['orderAmount']) ??
      (requestedQuantity !== undefined && limitPrice !== undefined
        ? roundMoney(requestedQuantity * limitPrice)
        : undefined);
    const remainingQuantity =
      requestedQuantity !== undefined && filledQuantity !== undefined
        ? Math.max(0, roundMoney(requestedQuantity - filledQuantity))
        : undefined;
    const submittedAt = readFirstString(record, ['orderedAt', 'createdAt']);

    if (!orderId || !symbol || !side || !orderType) {
      throw new BadRequestException(
        `Toss read-only order item ${index} is missing orderId, symbol, side, or orderType`,
      );
    }

    return {
      provider: 'toss',
      sourceRef: 'toss-read-only-order-poll',
      accountRefHash: hashString(`toss-account:${accountRef}`),
      brokerOrderRefHash: hashString(
        `toss-order-status:${accountRef}:${orderId}:${externalStatus}:${filledQuantity ?? 'none'}:${asOf}`,
      ),
      externalStatus,
      symbol,
      side,
      orderType,
      requestedQuantity,
      filledQuantity,
      remainingQuantity,
      requestedNotional,
      averageFillPrice,
      limitPrice,
      currency: readFirstString(record, FILL_FIELDS.currency) ?? 'KRW',
      submittedAt,
      asOf,
      notes: [
        'Imported from Toss read-only order observation. No order endpoint was called.',
        'brokerOrderRefHash is an event hash because the current ledger stores immutable status records.',
      ],
    };
  });
}

function extractFills(
  fillsResponse: Record<string, unknown>,
): MappedTossFill[] {
  const items = readArray(fillsResponse, [
    'items',
    'fills',
    'executions',
    'trades',
    'orders',
    'result.items',
    'result.fills',
    'result.executions',
    'result.orders',
    'data.items',
    'data.fills',
  ]);

  return items
    .map((item, index): MappedTossFill | null => {
      const record = asRecord(item);

      if (!record) {
        throw new BadRequestException(
          `Toss read-only fill item ${index} is not an object`,
        );
      }

      const symbol = readFirstString(record, FILL_FIELDS.symbol);
      const side = mapTossOrderSide(readFirstString(record, FILL_FIELDS.side));
      const quantity = readFirstFiniteNumber(record, FILL_FIELDS.quantity);
      const fillPrice = readFirstFiniteNumber(record, FILL_FIELDS.fillPrice);

      if (quantity === undefined || quantity <= 0) {
        return null;
      }

      const fee = readFirstFiniteNumber(record, FILL_FIELDS.fee) ?? 0;
      const grossNotional =
        readFirstFiniteNumber(record, FILL_FIELDS.grossNotional) ??
        (quantity !== undefined && fillPrice !== undefined
          ? roundMoney(quantity * fillPrice)
          : undefined);
      const filledAt =
        readFirstString(record, FILL_FIELDS.filledAt) ??
        new Date().toISOString();
      const fillRef =
        readFirstString(record, FILL_FIELDS.fillRef) ??
        `${symbol ?? 'unknown'}:${side ?? 'unknown'}:${filledAt}:${index}`;

      if (!symbol || !side || !quantity || !fillPrice || !grossNotional) {
        throw new BadRequestException(
          `Toss read-only fill item ${index} is missing symbol, side, quantity, price, or notional`,
        );
      }

      return {
        brokerOrderRef: readFirstString(record, FILL_FIELDS.orderRef),
        brokerFillRef: fillRef,
        symbol,
        side,
        quantity,
        fillPrice,
        grossNotional,
        fee,
        feeCurrency:
          readFirstString(record, FILL_FIELDS.feeCurrency) ??
          readFirstString(record, FILL_FIELDS.currency) ??
          'KRW',
        currency: readFirstString(record, FILL_FIELDS.currency) ?? 'KRW',
        filledAt,
      };
    })
    .filter((fill): fill is MappedTossFill => Boolean(fill));
}

function extractPositions(
  holdings: Record<string, unknown>,
  usdKrwRate: number | undefined,
): PositionSnapshot[] {
  const items = readArray(holdings, [
    'items',
    'holdings',
    'positions',
    'stocks',
    'result.items',
    'result.holdings',
    'result.positions',
    'data.items',
  ]);

  return items
    .map((item): PositionSnapshot | null => {
      const record = asRecord(item);

      if (!record) {
        return null;
      }

      const symbol =
        readFirstString(record, POSITION_FIELDS.symbol) ??
        readFirstString(record, POSITION_FIELDS.name);
      const marketValue = readFirstFiniteNumber(
        record,
        POSITION_FIELDS.marketValue,
      );
      const currency = readFirstString(record, POSITION_FIELDS.currency);
      if (currency === 'USD' && usdKrwRate === undefined) {
        throw new BadRequestException(
          'Toss read-only holdings response includes USD positions but USD/KRW rate is missing',
        );
      }
      const marketValueKrw =
        currency === 'USD'
          ? roundMoney((marketValue ?? 0) * usdKrwRate)
          : marketValue;

      if (!symbol || marketValueKrw === undefined || marketValueKrw <= 0) {
        return null;
      }

      return {
        symbol,
        assetClass: mapTossAssetClass(
          readFirstString(record, POSITION_FIELDS.assetClass),
        ),
        marketValue: marketValueKrw,
        weightPct: undefined,
      };
    })
    .filter((position): position is PositionSnapshot => Boolean(position));
}

function mapTossAssetClass(value: string | undefined): AssetClass {
  const normalized = value?.toLowerCase() ?? '';

  if (normalized.includes('foreign') || normalized === 'us') {
    return 'foreign_stock';
  }

  if (normalized.includes('etf')) {
    return 'domestic_etf';
  }

  return 'domestic_stock';
}

function calculateCashInKrw(
  holdings: Record<string, unknown>,
  krwBuyingPower: Record<string, unknown> | undefined,
  usdBuyingPower: Record<string, unknown> | undefined,
  usdKrwRate: number | undefined,
): number | undefined {
  const fallbackCash = readFirstFiniteNumber(holdings, [
    'cash',
    'cashBalance',
    'withdrawableAmount',
    'availableCash',
    'krwCash',
  ]);
  const krwCash = readFirstFiniteNumber(krwBuyingPower ?? {}, [
    'result.cashBuyingPower',
    'cashBuyingPower',
  ]);
  const usdCash = readFirstFiniteNumber(usdBuyingPower ?? {}, [
    'result.cashBuyingPower',
    'cashBuyingPower',
  ]);

  if (krwCash === undefined && fallbackCash !== undefined) {
    return fallbackCash;
  }

  if (krwCash === undefined && usdCash === undefined) {
    return undefined;
  }

  if ((usdCash ?? 0) > 0 && usdKrwRate === undefined) {
    return undefined;
  }

  return roundMoney((krwCash ?? 0) + (usdCash ?? 0) * (usdKrwRate ?? 0));
}

function extractUsdKrwRate(
  response: Record<string, unknown> | undefined,
): number | undefined {
  return readFirstFiniteNumber(response ?? {}, ['result.rate', 'rate']);
}

function mapTossOrderSide(value: string | undefined): 'BUY' | 'SELL' | null {
  const normalized = value?.trim().toLowerCase() ?? '';

  if (['buy', 'bid', 'b', '매수'].includes(normalized)) {
    return 'BUY';
  }

  if (['sell', 'ask', 's', '매도'].includes(normalized)) {
    return 'SELL';
  }

  return null;
}

function mapTossOrderType(value: string | undefined): OrderType | null {
  const normalized = value?.trim().toUpperCase() ?? '';

  if (normalized === 'MARKET' || normalized === 'LIMIT') {
    return normalized;
  }

  return null;
}

function mapTossOrderStatus(
  value: string | undefined,
): BrokerOrderExternalStatus {
  const normalized = value?.trim().toUpperCase() ?? '';

  if (normalized === 'PENDING' || normalized === 'PENDING_REPLACE') {
    return 'open';
  }

  if (normalized === 'PARTIAL_FILLED') {
    return 'partially_filled';
  }

  if (normalized === 'PENDING_CANCEL') {
    return 'pending_cancel';
  }

  if (normalized === 'FILLED') {
    return 'filled';
  }

  if (normalized === 'CANCELED' || normalized === 'CANCELLED') {
    return 'cancelled';
  }

  if (normalized === 'REJECTED') {
    return 'rejected';
  }

  if (normalized === 'EXPIRED') {
    return 'expired';
  }

  return 'unknown';
}

function readFirstFiniteNumber(
  record: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = readPath(record, key);
    const numberValue =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value.replaceAll(',', ''))
          : Number.NaN;

    if (Number.isFinite(numberValue)) {
      return roundMoney(numberValue);
    }
  }

  return undefined;
}

function readFirstString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = readPath(record, key);

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function readArray(record: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = readPath(record, key);

    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function readPath(record: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (current, part) => asRecord(current)?.[part] ?? undefined,
      record,
    );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}
