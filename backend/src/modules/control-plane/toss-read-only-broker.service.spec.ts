import {
  assertTossReadOnlyEndpointAllowed,
  TossReadOnlyBrokerService,
} from './toss-read-only-broker.service';
import { ControlPlaneService } from './control-plane.service';

describe('TossReadOnlyBrokerService', () => {
  const originalEnv = process.env;
  let importBrokerSnapshot: jest.Mock;
  let importBrokerFill: jest.Mock;
  let importBrokerOrderStatus: jest.Mock;
  let reconcileBrokerSnapshot: jest.Mock;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.BROKER_READ_ONLY_ENABLED;
    delete process.env.TOSS_READ_ONLY_POLLER_ENABLED;
    delete process.env.TOSS_OPEN_API_BASE_URL;
    delete process.env.TOSS_OPEN_API_CLIENT_ID;
    delete process.env.TOSS_OPEN_API_CLIENT_SECRET;
    delete process.env.TOSS_OPEN_API_ACCOUNT_REF;
    delete process.env.TOSS_OPEN_API_ACCOUNT_SEQ;
    delete process.env.TOSS_OPEN_API_SCHEMA_VERIFIED;
    importBrokerSnapshot = jest.fn(async (request) => ({
      id: 77,
      ...request,
      brokerExecutionEnabled: false,
      liveTradingEnabled: false,
    }));
    importBrokerFill = jest.fn(async (request) => ({
      id: 88,
      ...request,
      status: 'matched',
      brokerExecutionEnabled: false,
      liveTradingEnabled: false,
      reconciliation: {
        status: 'matched',
        checkedAt: '2026-05-23T00:01:00.000Z',
      },
    }));
    importBrokerOrderStatus = jest.fn(async (request) => ({
      id: 89,
      ...request,
      status: 'unlinked',
      brokerExecutionEnabled: false,
      liveTradingEnabled: false,
      reconciliation: {
        status: 'unlinked',
        checkedAt: '2026-05-23T00:02:00.000Z',
      },
    }));
    reconcileBrokerSnapshot = jest.fn(async (_snapshotId, _request) => ({
      id: 77,
      status: 'matched',
      brokerExecutionEnabled: false,
      liveTradingEnabled: false,
      reconciliation: {
        status: 'matched',
        checkedAt: '2026-05-23T00:00:00.000Z',
      },
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('stays disabled by default and does not call the network', async () => {
    const requester = jest.fn();
    const service = new TossReadOnlyBrokerService(
      {
        importTossReadOnlyBrokerSnapshot: importBrokerSnapshot,
        importBrokerSnapshot,
        importBrokerFill,
        importBrokerOrderStatus,
        reconcileBrokerSnapshot,
      } as unknown as ControlPlaneService,
      requester,
    );

    expect(service.getReadOnlyPollStatus()).toEqual(
      expect.objectContaining({
        enabled: false,
        configured: false,
        canPoll: false,
        accountRef: 'missing',
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    await expect(service.pollReadOnlySnapshot()).rejects.toThrow(
      'Toss read-only polling requires',
    );
    expect(requester).not.toHaveBeenCalled();
    expect(importBrokerSnapshot).not.toHaveBeenCalled();
    expect(importBrokerFill).not.toHaveBeenCalled();
    expect(importBrokerOrderStatus).not.toHaveBeenCalled();
    expect(reconcileBrokerSnapshot).not.toHaveBeenCalled();
    await service.pollReadOnlySnapshotCron();
    expect(requester).not.toHaveBeenCalled();
  });

  it('imports a Toss read-only holdings snapshot when explicitly enabled', async () => {
    process.env.BROKER_READ_ONLY_ENABLED = 'true';
    process.env.TOSS_READ_ONLY_POLLER_ENABLED = 'true';
    process.env.TOSS_OPEN_API_BASE_URL = 'https://openapi.tossinvest.com';
    process.env.TOSS_OPEN_API_CLIENT_ID = 'client-123456';
    process.env.TOSS_OPEN_API_CLIENT_SECRET = 'secret-123456';
    process.env.TOSS_OPEN_API_ACCOUNT_SEQ = 'account-123456';
    process.env.TOSS_OPEN_API_SCHEMA_VERIFIED = 'true';
    const requester = jest
      .fn()
      .mockResolvedValueOnce({ access_token: 'token-value' })
      .mockResolvedValueOnce({ result: [{ accountSeq: 'account-123456' }] })
      .mockResolvedValueOnce({
        result: {
          items: [
            {
              symbol: '005930',
              marketCountry: 'KR',
              currency: 'KRW',
              marketValue: { amount: '3500000' },
            },
            {
              symbol: 'AAPL',
              marketCountry: 'US',
              currency: 'USD',
              marketValue: { amount: '100' },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        result: { currency: 'KRW', cashBuyingPower: '6500000' },
      })
      .mockResolvedValueOnce({
        result: { currency: 'USD', cashBuyingPower: '100' },
      })
      .mockResolvedValueOnce({
        result: { baseCurrency: 'USD', quoteCurrency: 'KRW', rate: '1380' },
      });
    const service = new TossReadOnlyBrokerService(
      {
        importTossReadOnlyBrokerSnapshot: importBrokerSnapshot,
        importBrokerSnapshot,
        importBrokerFill,
        importBrokerOrderStatus,
        reconcileBrokerSnapshot,
      } as unknown as ControlPlaneService,
      requester,
    );

    const result = await service.pollReadOnlySnapshot();

    expect(requester).toHaveBeenCalledTimes(6);
    expect(requester.mock.calls.map(([request]) => request.path)).toEqual([
      '/oauth2/token',
      '/api/v1/accounts',
      '/api/v1/holdings',
      '/api/v1/buying-power',
      '/api/v1/buying-power',
      '/api/v1/exchange-rate',
    ]);
    expect(requester.mock.calls[2][0].headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer token-value',
        'X-Tossinvest-Account': 'account-123456',
      }),
    );
    expect(requester.mock.calls[3][0].query).toEqual({ currency: 'KRW' });
    expect(requester.mock.calls[4][0].query).toEqual({ currency: 'USD' });
    expect(requester.mock.calls[5][0].query).toEqual({
      baseCurrency: 'USD',
      quoteCurrency: 'KRW',
    });
    expect(importBrokerSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'toss',
        accountRef: 'account-123456',
        sourceRef: 'toss-read-only-poll:manual',
        cash: 6_638_000,
        equity: 10_276_000,
        positions: [
          expect.objectContaining({
            symbol: '005930',
            marketValue: 3_500_000,
          }),
          expect.objectContaining({
            symbol: 'AAPL',
            assetClass: 'foreign_stock',
            marketValue: 138_000,
          }),
        ],
      }),
    );
    expect(result.status).toEqual(
      expect.objectContaining({
        canPoll: true,
        running: false,
        lastSnapshotId: 77,
        lastReconciliationStatus: 'matched',
        lastReconciledAt: '2026-05-23T00:00:00.000Z',
        lastAttemptAt: expect.any(String),
        lastPollAt: expect.any(String),
        accountRef: 'acc***456',
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(reconcileBrokerSnapshot).toHaveBeenCalledWith(
      77,
      expect.objectContaining({
        notes: ['Auto-reconciled after Toss read-only poll.'],
      }),
    );
    expect(result.snapshot).toEqual(
      expect.objectContaining({
        id: 77,
        status: 'matched',
        reconciliation: expect.objectContaining({ status: 'matched' }),
      }),
    );
  });

  it('discovers Toss accountSeq without requiring account env or broker writes', async () => {
    process.env.TOSS_OPEN_API_CLIENT_ID = 'client-123456';
    process.env.TOSS_OPEN_API_CLIENT_SECRET = 'secret-123456';
    const requester = jest
      .fn()
      .mockResolvedValueOnce({ access_token: 'token-value' })
      .mockResolvedValueOnce({
        result: [
          {
            accountNo: '12345678901',
            accountSeq: 1,
            accountType: 'BROKERAGE',
          },
        ],
      });
    const service = new TossReadOnlyBrokerService(
      {
        importTossReadOnlyBrokerSnapshot: importBrokerSnapshot,
        importBrokerSnapshot,
        importBrokerFill,
        importBrokerOrderStatus,
        reconcileBrokerSnapshot,
      } as unknown as ControlPlaneService,
      requester,
    );

    const result = await service.listReadOnlyAccounts();

    expect(requester).toHaveBeenCalledTimes(2);
    expect(requester.mock.calls.map(([request]) => request.path)).toEqual([
      '/oauth2/token',
      '/api/v1/accounts',
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
        accounts: [
          {
            accountSeq: '1',
            accountNoMasked: '123***901',
            accountType: 'BROKERAGE',
            brokerExecutionEnabled: false,
            liveTradingEnabled: false,
          },
        ],
      }),
    );
    expect(result.notes.join('\n')).toContain('TOSS_OPEN_API_ACCOUNT_SEQ');
    expect(importBrokerSnapshot).not.toHaveBeenCalled();
    expect(importBrokerFill).not.toHaveBeenCalled();
    expect(importBrokerOrderStatus).not.toHaveBeenCalled();
  });

  it('blocks account discovery without Toss client credentials', async () => {
    const requester = jest.fn();
    const service = new TossReadOnlyBrokerService(
      {
        importTossReadOnlyBrokerSnapshot: importBrokerSnapshot,
        importBrokerSnapshot,
        importBrokerFill,
        importBrokerOrderStatus,
        reconcileBrokerSnapshot,
      } as unknown as ControlPlaneService,
      requester,
    );

    await expect(service.listReadOnlyAccounts()).rejects.toThrow(
      'Toss account discovery requires TOSS_OPEN_API_CLIENT_ID',
    );
    expect(requester).not.toHaveBeenCalled();
  });

  it('keeps an imported snapshot when auto-reconciliation is unavailable', async () => {
    process.env.BROKER_READ_ONLY_ENABLED = 'true';
    process.env.TOSS_READ_ONLY_POLLER_ENABLED = 'true';
    process.env.TOSS_OPEN_API_CLIENT_ID = 'client-123456';
    process.env.TOSS_OPEN_API_CLIENT_SECRET = 'secret-123456';
    process.env.TOSS_OPEN_API_ACCOUNT_SEQ = 'account-123456';
    process.env.TOSS_OPEN_API_SCHEMA_VERIFIED = 'true';
    reconcileBrokerSnapshot.mockRejectedValueOnce(
      new Error(
        'Broker snapshot reconciliation requires an active paper account',
      ),
    );
    const requester = jest
      .fn()
      .mockResolvedValueOnce({ access_token: 'token-value' })
      .mockResolvedValueOnce({ result: [{ accountSeq: 'account-123456' }] })
      .mockResolvedValueOnce({
        result: { items: [] },
      })
      .mockResolvedValueOnce({
        result: { currency: 'KRW', cashBuyingPower: '6500000' },
      })
      .mockResolvedValueOnce({
        result: { currency: 'USD', cashBuyingPower: '0' },
      })
      .mockResolvedValueOnce({
        result: { baseCurrency: 'USD', quoteCurrency: 'KRW', rate: '1380' },
      });
    const service = new TossReadOnlyBrokerService(
      {
        importTossReadOnlyBrokerSnapshot: importBrokerSnapshot,
        importBrokerSnapshot,
        importBrokerFill,
        importBrokerOrderStatus,
        reconcileBrokerSnapshot,
      } as unknown as ControlPlaneService,
      requester,
    );

    const result = await service.pollReadOnlySnapshot();

    expect(result.snapshot).toEqual(
      expect.objectContaining({
        id: 77,
        provider: 'toss',
      }),
    );
    expect(result.status).toEqual(
      expect.objectContaining({
        lastSnapshotId: 77,
        lastReconciliationStatus: 'not_checked',
        lastReconciliationError:
          'Broker snapshot reconciliation requires an active paper account',
        lastError: undefined,
      }),
    );
  });

  it('imports Toss read-only fill evidence when fill polling is explicitly enabled', async () => {
    process.env.BROKER_READ_ONLY_ENABLED = 'true';
    process.env.TOSS_READ_ONLY_POLLER_ENABLED = 'true';
    process.env.TOSS_READ_ONLY_FILL_POLLER_ENABLED = 'true';
    process.env.TOSS_OPEN_API_CLIENT_ID = 'client-123456';
    process.env.TOSS_OPEN_API_CLIENT_SECRET = 'secret-123456';
    process.env.TOSS_OPEN_API_ACCOUNT_SEQ = 'account-123456';
    process.env.TOSS_OPEN_API_SCHEMA_VERIFIED = 'true';
    process.env.TOSS_OPEN_API_FILL_SCHEMA_VERIFIED = 'true';
    process.env.TOSS_OPEN_API_FILLS_PATH = '/api/v1/orders';
    const requester = jest
      .fn()
      .mockResolvedValueOnce({ access_token: 'token-value' })
      .mockResolvedValueOnce({
        result: {
          orders: [
            {
              orderId: 'order-open-1',
              symbol: '005930',
              side: 'BUY',
              orderType: 'LIMIT',
              status: 'PENDING',
              quantity: '10',
              currency: 'KRW',
              execution: {
                filledQuantity: '0',
                averageFilledPrice: null,
                filledAmount: null,
                commission: null,
                filledAt: null,
              },
            },
            {
              orderId: 'order-1',
              symbol: 'AAPL',
              side: 'SELL',
              orderType: 'LIMIT',
              status: 'PARTIAL_FILLED',
              quantity: '5',
              currency: 'USD',
              execution: {
                filledQuantity: '2',
                averageFilledPrice: '185.25',
                filledAmount: '370.5',
                commission: '0.66',
                filledAt: '2026-05-23T00:00:00.000Z',
              },
            },
          ],
        },
      });
    const service = new TossReadOnlyBrokerService(
      {
        importTossReadOnlyBrokerSnapshot: importBrokerSnapshot,
        importBrokerSnapshot,
        importBrokerFill,
        importBrokerOrderStatus,
        reconcileBrokerSnapshot,
      } as unknown as ControlPlaneService,
      requester,
    );

    const result = await service.pollReadOnlyFills();

    expect(requester).toHaveBeenCalledTimes(2);
    expect(requester.mock.calls.map(([request]) => request.path)).toEqual([
      '/oauth2/token',
      '/api/v1/orders',
    ]);
    expect(requester.mock.calls[1][0].query).toEqual({ status: 'OPEN' });
    expect(importBrokerFill).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'toss',
        accountRef: 'account-123456',
        brokerOrderRef: 'order-1',
        brokerFillRef: 'AAPL:SELL:2026-05-23T00:00:00.000Z:1',
        symbol: 'AAPL',
        side: 'SELL',
        quantity: 2,
        fillPrice: 185.25,
        grossNotional: 370.5,
        fee: 0.66,
        sourceRef: 'toss-read-only-fill-poll:0:manual',
      }),
    );
    expect(importBrokerOrderStatus).toHaveBeenCalledTimes(2);
    expect(importBrokerOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'toss',
        sourceRef: 'toss-read-only-order-poll:manual',
        brokerOrderRefHash: expect.stringMatching(/^sha256:/),
        accountRefHash: expect.stringMatching(/^sha256:/),
        externalStatus: 'open',
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        requestedQuantity: 10,
        filledQuantity: 0,
        remainingQuantity: 10,
      }),
    );
    expect(importBrokerOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        externalStatus: 'partially_filled',
        symbol: 'AAPL',
        side: 'SELL',
        requestedQuantity: 5,
        filledQuantity: 2,
        remainingQuantity: 3,
        averageFillPrice: 185.25,
      }),
    );
    expect(result.status).toEqual(
      expect.objectContaining({
        canPollFills: true,
        lastBrokerFillIds: [88],
        lastFillCount: 1,
        lastBrokerOrderStatusIds: [89, 89],
        lastOrderStatusCount: 2,
        lastFillReconciliationStatus: 'matched',
        lastFillReconciledAt: '2026-05-23T00:01:00.000Z',
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(result.fills?.[0]).toEqual(
      expect.objectContaining({
        id: 88,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      }),
    );
    expect(result.orderStatuses).toHaveLength(2);
  });

  it('keeps Toss fill polling disabled without explicit fill schema and path', async () => {
    process.env.BROKER_READ_ONLY_ENABLED = 'true';
    process.env.TOSS_READ_ONLY_POLLER_ENABLED = 'true';
    process.env.TOSS_READ_ONLY_FILL_POLLER_ENABLED = 'true';
    process.env.TOSS_OPEN_API_CLIENT_ID = 'client-123456';
    process.env.TOSS_OPEN_API_CLIENT_SECRET = 'secret-123456';
    process.env.TOSS_OPEN_API_ACCOUNT_SEQ = 'account-123456';
    process.env.TOSS_OPEN_API_SCHEMA_VERIFIED = 'true';
    const requester = jest.fn();
    const service = new TossReadOnlyBrokerService(
      {
        importTossReadOnlyBrokerSnapshot: importBrokerSnapshot,
        importBrokerSnapshot,
        importBrokerFill,
        importBrokerOrderStatus,
        reconcileBrokerSnapshot,
      } as unknown as ControlPlaneService,
      requester,
    );

    expect(service.getReadOnlyPollStatus()).toEqual(
      expect.objectContaining({
        canPoll: true,
        canPollFills: false,
        fillPollingEnabled: true,
        fillSchemaVerified: false,
        fillPathConfigured: true,
      }),
    );
    await expect(service.pollReadOnlyFills()).rejects.toThrow(
      'Toss read-only fill polling requires',
    );
    expect(requester).not.toHaveBeenCalled();
    expect(importBrokerFill).not.toHaveBeenCalled();
    expect(importBrokerOrderStatus).not.toHaveBeenCalled();
  });

  it('blocks every non-read-only Toss endpoint', () => {
    expect(() =>
      assertTossReadOnlyEndpointAllowed('POST', '/api/v1/orders'),
    ).toThrow('Toss read-only adapter blocks POST /api/v1/orders');
  });
});
