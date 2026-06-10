import {
  mapTossReadOnlyOrderStatuses,
  mapTossReadOnlySnapshot,
} from './toss-read-only.mapper';

describe('mapTossReadOnlySnapshot', () => {
  it('maps a defensive Toss holdings shape into a read-only broker snapshot request', () => {
    const mapped = mapTossReadOnlySnapshot({
      accountRef: '12345678',
      asOf: '2026-05-23T09:00:00.000Z',
      holdings: {
        cashBalance: '6,500,000',
        totalEvaluationAmount: '10,000,000',
        items: [
          {
            stockCode: '005930',
            stockName: 'Samsung Electronics',
            marketValue: '3,500,000',
            market: 'KOREA',
          },
          {
            stockCode: 'ZERO',
            marketValue: 0,
          },
        ],
      },
    });

    expect(mapped).toEqual({
      provider: 'toss',
      sourceRef: 'toss-read-only-poll',
      accountRef: '12345678',
      asOf: '2026-05-23T09:00:00.000Z',
      currency: 'KRW',
      cash: 6_500_000,
      equity: 10_000_000,
      positions: [
        {
          symbol: '005930',
          assetClass: 'domestic_stock',
          marketValue: 3_500_000,
          weightPct: 35,
        },
      ],
    });
  });

  it('throws when the holdings shape is missing cash evidence', () => {
    expect(() =>
      mapTossReadOnlySnapshot({
        accountRef: '12345678',
        asOf: '2026-05-23T09:00:00.000Z',
        holdings: {
          items: [],
        },
      }),
    ).toThrow('Toss read-only holdings response is missing cash');
  });

  it('maps Toss open orders into provider-neutral order status records', () => {
    const mapped = mapTossReadOnlyOrderStatuses({
      accountRef: 'account-123456',
      asOf: '2026-06-09T09:30:00.000Z',
      fills: {
        result: {
          orders: [
            {
              orderId: 'order-1',
              symbol: 'AAPL',
              side: 'SELL',
              orderType: 'LIMIT',
              status: 'PARTIAL_FILLED',
              price: '185.5',
              quantity: '5',
              currency: 'USD',
              orderedAt: '2026-06-09T09:29:00+09:00',
              execution: {
                filledQuantity: '2',
                averageFilledPrice: '185.25',
              },
            },
          ],
        },
      },
    });

    expect(mapped).toEqual([
      expect.objectContaining({
        provider: 'toss',
        sourceRef: 'toss-read-only-order-poll',
        accountRefHash: expect.stringMatching(/^sha256:/),
        brokerOrderRefHash: expect.stringMatching(/^sha256:/),
        externalStatus: 'partially_filled',
        symbol: 'AAPL',
        side: 'SELL',
        orderType: 'LIMIT',
        requestedQuantity: 5,
        filledQuantity: 2,
        remainingQuantity: 3,
        requestedNotional: 927.5,
        averageFillPrice: 185.25,
        limitPrice: 185.5,
        currency: 'USD',
        submittedAt: '2026-06-09T09:29:00+09:00',
        asOf: '2026-06-09T09:30:00.000Z',
      }),
    ]);
  });
});
