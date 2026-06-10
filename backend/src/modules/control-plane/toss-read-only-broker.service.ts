import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios, { AxiosRequestConfig } from 'axios';
import {
  BrokerAdapterReadOnlyPollStatus,
  BrokerAdapterStatus,
  BrokerReadOnlyPollResponse,
} from './control-plane.types';
import { ControlPlaneService } from './control-plane.service';
import {
  mapTossReadOnlyFills,
  mapTossReadOnlyOrderStatuses,
  mapTossReadOnlySnapshot,
} from './toss-read-only.mapper';

type HttpMethod = 'GET' | 'POST';

interface TossReadOnlyConfig {
  enabled: boolean;
  baseUrl: string;
  clientId?: string;
  clientSecret?: string;
  accountRef?: string;
  schemaVerified: boolean;
  fillPollingEnabled: boolean;
  fillSchemaVerified: boolean;
  fillsPath?: string;
  timeoutMs: number;
}

interface TossReadOnlyRequest {
  method: HttpMethod;
  path: string;
  baseUrl: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  data?: URLSearchParams;
  timeoutMs: number;
}

type TossReadOnlyRequester = (request: TossReadOnlyRequest) => Promise<unknown>;

interface TossReadOnlyAccountView {
  accountSeq: string;
  accountNoMasked?: string;
  accountType?: string;
  brokerExecutionEnabled: false;
  liveTradingEnabled: false;
}

export interface TossReadOnlyAccountDiscoveryResponse {
  status: BrokerAdapterReadOnlyPollStatus;
  accounts: TossReadOnlyAccountView[];
  notes: string[];
  brokerExecutionEnabled: false;
  liveTradingEnabled: false;
}

const ALLOWED_ENDPOINTS = [
  'POST /oauth2/token',
  'GET /api/v1/accounts',
  'GET /api/v1/holdings',
  'GET /api/v1/buying-power',
  'GET /api/v1/exchange-rate',
  'GET /api/v1/orders',
];
const TOSS_READ_ONLY_POLL_CRON = '*/5 * * * *';

@Injectable()
export class TossReadOnlyBrokerService {
  private readonly logger = new Logger(TossReadOnlyBrokerService.name);
  private running = false;
  private lastAttemptAt?: string;
  private lastPollAt?: string;
  private lastSnapshotId?: number;
  private lastFillPollAt?: string;
  private lastBrokerFillIds?: number[];
  private lastFillCount?: number;
  private lastBrokerOrderStatusIds?: number[];
  private lastOrderStatusCount?: number;
  private lastReconciliationStatus?: string;
  private lastReconciledAt?: string;
  private lastReconciliationError?: string;
  private lastFillReconciliationStatus?: string;
  private lastFillReconciledAt?: string;
  private lastError?: string;

  constructor(
    private readonly controlPlaneService: ControlPlaneService,
    @Optional()
    @Inject('TOSS_READ_ONLY_REQUESTER')
    private readonly requester: TossReadOnlyRequester = defaultRequester,
  ) {}

  getAdapterStatus(base: BrokerAdapterStatus): BrokerAdapterStatus {
    const readOnlyPoll = this.getReadOnlyPollStatus();

    return {
      ...base,
      readOnlyPoll,
    };
  }

  getReadOnlyPollStatus(): BrokerAdapterReadOnlyPollStatus {
    const config = this.getConfig();
    const configured = Boolean(
      config.clientId && config.clientSecret && config.accountRef,
    );
    const canPoll = config.enabled && configured && config.schemaVerified;
    const canPollFills =
      canPoll &&
      config.fillPollingEnabled &&
      config.fillSchemaVerified &&
      Boolean(config.fillsPath);

    return {
      provider: 'toss',
      enabled: config.enabled,
      configured,
      schemaVerified: config.schemaVerified,
      fillPollingEnabled: config.fillPollingEnabled,
      fillSchemaVerified: config.fillSchemaVerified,
      fillPathConfigured: Boolean(config.fillsPath),
      canPoll,
      canPollFills,
      baseUrl: config.baseUrl,
      accountRef: config.accountRef ? this.mask(config.accountRef) : 'missing',
      allowedEndpoints: this.getAllowedEndpoints(config),
      cron: TOSS_READ_ONLY_POLL_CRON,
      running: this.running,
      lastAttemptAt: this.lastAttemptAt,
      lastPollAt: this.lastPollAt,
      lastSnapshotId: this.lastSnapshotId,
      lastFillPollAt: this.lastFillPollAt,
      lastBrokerFillIds: this.lastBrokerFillIds,
      lastFillCount: this.lastFillCount,
      lastBrokerOrderStatusIds: this.lastBrokerOrderStatusIds,
      lastOrderStatusCount: this.lastOrderStatusCount,
      lastReconciliationStatus: this.lastReconciliationStatus,
      lastReconciledAt: this.lastReconciledAt,
      lastReconciliationError: this.lastReconciliationError,
      lastFillReconciliationStatus: this.lastFillReconciliationStatus,
      lastFillReconciledAt: this.lastFillReconciledAt,
      lastError: this.lastError,
      brokerExecutionEnabled: false,
      liveTradingEnabled: false,
    };
  }

  @Cron(TOSS_READ_ONLY_POLL_CRON, {
    name: 'toss-read-only-broker-poll',
  })
  async pollReadOnlySnapshotCron(): Promise<void> {
    if (!this.getReadOnlyPollStatus().canPoll) {
      return;
    }

    try {
      await this.pollReadOnlySnapshot('cron');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Toss read-only broker poll failed';
      this.logger.error(`Toss read-only poll failed: ${message}`);
    }
  }

  @Cron(TOSS_READ_ONLY_POLL_CRON, {
    name: 'toss-read-only-broker-fill-poll',
  })
  async pollReadOnlyFillsCron(): Promise<void> {
    if (!this.getReadOnlyPollStatus().canPollFills) {
      return;
    }

    try {
      await this.pollReadOnlyFills('cron');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Toss read-only fill poll failed';
      this.logger.error(`Toss read-only fill poll failed: ${message}`);
    }
  }

  async pollReadOnlySnapshot(
    trigger = 'manual',
  ): Promise<BrokerReadOnlyPollResponse> {
    const config = this.getConfig();
    const status = this.getReadOnlyPollStatus();

    if (!status.canPoll) {
      this.lastError =
        'Toss read-only polling requires BROKER_READ_ONLY_ENABLED=true, credentials, account ref, and verified schema.';
      throw new BadRequestException(this.lastError);
    }

    if (this.running) {
      this.lastError = 'Previous Toss read-only poll is still running.';
      throw new BadRequestException(this.lastError);
    }

    this.running = true;
    this.lastAttemptAt = new Date().toISOString();
    const triggerRef = trigger.trim() || 'manual';

    try {
      const token = await this.fetchAccessToken(config);
      await this.requestReadOnly('GET', '/api/v1/accounts', config, token);
      const holdings = await this.requestReadOnly(
        'GET',
        '/api/v1/holdings',
        config,
        token,
        {
          'X-Tossinvest-Account': config.accountRef!,
        },
      );
      const krwBuyingPower = await this.requestReadOnly(
        'GET',
        '/api/v1/buying-power',
        config,
        token,
        {
          'X-Tossinvest-Account': config.accountRef!,
        },
        undefined,
        { currency: 'KRW' },
      );
      const usdBuyingPower = await this.requestReadOnly(
        'GET',
        '/api/v1/buying-power',
        config,
        token,
        {
          'X-Tossinvest-Account': config.accountRef!,
        },
        undefined,
        { currency: 'USD' },
      );
      const usdKrwExchangeRate = await this.requestReadOnly(
        'GET',
        '/api/v1/exchange-rate',
        config,
        token,
        undefined,
        undefined,
        {
          baseCurrency: 'USD',
          quoteCurrency: 'KRW',
        },
      );
      const imported = mapTossReadOnlySnapshot({
        accountRef: config.accountRef!,
        asOf: new Date().toISOString(),
        holdings: this.assertRecord(holdings, 'Toss holdings response'),
        krwBuyingPower: this.assertRecord(
          krwBuyingPower,
          'Toss KRW buying-power response',
        ),
        usdBuyingPower: this.assertRecord(
          usdBuyingPower,
          'Toss USD buying-power response',
        ),
        usdKrwExchangeRate: this.assertRecord(
          usdKrwExchangeRate,
          'Toss USD/KRW exchange-rate response',
        ),
      });
      imported.sourceRef = `toss-read-only-poll:${triggerRef}`;
      const snapshot =
        await this.controlPlaneService.importTossReadOnlyBrokerSnapshot(
          imported,
        );
      const reconciledSnapshot =
        await this.tryReconcileImportedSnapshot(snapshot);
      this.lastPollAt = new Date().toISOString();
      this.lastSnapshotId = reconciledSnapshot.id;
      this.lastError = undefined;
      this.running = false;

      return {
        status: this.getReadOnlyPollStatus(),
        snapshot: reconciledSnapshot,
      };
    } catch (error) {
      this.lastError =
        error instanceof Error
          ? error.message
          : 'Toss read-only polling failed';
      throw error;
    } finally {
      this.running = false;
    }
  }

  async listReadOnlyAccounts(
    trigger = 'manual',
  ): Promise<TossReadOnlyAccountDiscoveryResponse> {
    const config = this.getConfig();

    if (!config.clientId || !config.clientSecret) {
      this.lastError =
        'Toss account discovery requires TOSS_OPEN_API_CLIENT_ID and TOSS_OPEN_API_CLIENT_SECRET.';
      throw new BadRequestException(this.lastError);
    }

    if (this.running) {
      this.lastError = 'Previous Toss read-only poll is still running.';
      throw new BadRequestException(this.lastError);
    }

    this.running = true;
    this.lastAttemptAt = new Date().toISOString();

    try {
      const token = await this.fetchAccessToken(config);
      const accountsResponse = await this.requestReadOnly(
        'GET',
        '/api/v1/accounts',
        config,
        token,
      );
      const accounts = this.extractAccounts(
        this.assertRecord(accountsResponse, 'Toss accounts response'),
      );
      this.lastError = undefined;

      return {
        status: this.getReadOnlyPollStatus(),
        accounts,
        notes: [
          `Toss read-only account discovery completed through ${trigger.trim() || 'manual'}.`,
          'Set TOSS_OPEN_API_ACCOUNT_SEQ to the selected accountSeq before broker poll-read-only.',
          'Account numbers are masked; no broker order endpoint was called.',
        ],
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      };
    } catch (error) {
      this.lastError =
        error instanceof Error
          ? error.message
          : 'Toss account discovery failed';
      throw error;
    } finally {
      this.running = false;
    }
  }

  async pollReadOnlyFills(
    trigger = 'manual',
  ): Promise<BrokerReadOnlyPollResponse> {
    const config = this.getConfig();
    const status = this.getReadOnlyPollStatus();

    if (!status.canPollFills) {
      this.lastError =
        'Toss read-only fill polling requires snapshot polling readiness, TOSS_READ_ONLY_FILL_POLLER_ENABLED=true, TOSS_OPEN_API_FILL_SCHEMA_VERIFIED=true, and TOSS_OPEN_API_FILLS_PATH.';
      throw new BadRequestException(this.lastError);
    }

    if (this.running) {
      this.lastError = 'Previous Toss read-only poll is still running.';
      throw new BadRequestException(this.lastError);
    }

    this.running = true;
    this.lastAttemptAt = new Date().toISOString();
    const triggerRef = trigger.trim() || 'manual';

    try {
      const token = await this.fetchAccessToken(config);
      const fillsResponse = await this.requestReadOnly(
        'GET',
        config.fillsPath!,
        config,
        token,
        {
          'X-Tossinvest-Account': config.accountRef!,
        },
        undefined,
        config.fillsPath === '/api/v1/orders' ? { status: 'OPEN' } : undefined,
      );
      const fillRequests = mapTossReadOnlyFills({
        accountRef: config.accountRef!,
        asOf: new Date().toISOString(),
        fills: this.assertRecord(fillsResponse, 'Toss fills response'),
      }).map((request) => ({
        ...request,
        sourceRef: `${request.sourceRef}:${triggerRef}`,
      }));
      const orderStatusRequests = mapTossReadOnlyOrderStatuses({
        accountRef: config.accountRef!,
        asOf: new Date().toISOString(),
        fills: this.assertRecord(fillsResponse, 'Toss orders response'),
      }).map((request) => ({
        ...request,
        sourceRef: `${request.sourceRef}:${triggerRef}`,
      }));
      const importedFills = [];
      const importedOrderStatuses = [];

      for (const fillRequest of fillRequests) {
        importedFills.push(
          await this.controlPlaneService.importBrokerFill(fillRequest),
        );
      }

      for (const orderStatusRequest of orderStatusRequests) {
        importedOrderStatuses.push(
          await this.controlPlaneService.importBrokerOrderStatus(
            orderStatusRequest,
          ),
        );
      }

      this.lastFillPollAt = new Date().toISOString();
      this.lastBrokerFillIds = importedFills.map((fill) => fill.id);
      this.lastFillCount = importedFills.length;
      this.lastBrokerOrderStatusIds = importedOrderStatuses.map(
        (status) => status.id,
      );
      this.lastOrderStatusCount = importedOrderStatuses.length;
      this.lastFillReconciliationStatus =
        importedFills.length === 0
          ? 'not_checked'
          : importedFills.every(
                (fill) => fill.reconciliation.status === 'matched',
              )
            ? 'matched'
            : 'mismatch';
      const fillReconciledAtValues = importedFills
        .map((fill) => fill.reconciliation.checkedAt)
        .filter((value): value is string => Boolean(value))
        .sort();
      this.lastFillReconciledAt =
        fillReconciledAtValues[fillReconciledAtValues.length - 1];
      this.lastError = undefined;

      return {
        status: this.getReadOnlyPollStatus(),
        fills: importedFills,
        orderStatuses: importedOrderStatuses,
      };
    } catch (error) {
      this.lastError =
        error instanceof Error
          ? error.message
          : 'Toss read-only fill polling failed';
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async tryReconcileImportedSnapshot(
    snapshot: BrokerReadOnlyPollResponse['snapshot'],
  ) {
    if (!snapshot) {
      throw new BadRequestException('Broker snapshot import returned empty');
    }

    try {
      const reconciled = await this.controlPlaneService.reconcileBrokerSnapshot(
        snapshot.id,
        {
          notes: ['Auto-reconciled after Toss read-only poll.'],
        },
      );
      this.lastReconciliationStatus = reconciled.reconciliation.status;
      this.lastReconciledAt = reconciled.reconciliation.checkedAt;
      this.lastReconciliationError = undefined;

      return reconciled;
    } catch (error) {
      this.lastReconciliationStatus = 'not_checked';
      this.lastReconciliationError =
        error instanceof Error
          ? error.message
          : 'Broker snapshot auto-reconciliation failed';

      return snapshot;
    }
  }

  private async fetchAccessToken(config: TossReadOnlyConfig): Promise<string> {
    const tokenResponse = await this.requestReadOnly(
      'POST',
      '/oauth2/token',
      config,
      undefined,
      undefined,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId!,
        client_secret: config.clientSecret!,
      }),
    );
    const tokenRecord = this.assertRecord(tokenResponse, 'Toss token response');
    const accessToken = tokenRecord.access_token ?? tokenRecord.accessToken;

    if (typeof accessToken !== 'string' || !accessToken.trim()) {
      throw new BadRequestException(
        'Toss token response did not include access_token',
      );
    }

    return accessToken;
  }

  private async requestReadOnly(
    method: HttpMethod,
    path: string,
    config: TossReadOnlyConfig,
    accessToken?: string,
    headers: Record<string, string> = {},
    data?: URLSearchParams,
    query?: Record<string, string>,
  ): Promise<unknown> {
    assertTossReadOnlyEndpointAllowed(
      method,
      path,
      this.getAllowedEndpoints(config),
    );

    return this.requester({
      method,
      path,
      baseUrl: config.baseUrl,
      headers: {
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      query,
      data,
      timeoutMs: config.timeoutMs,
    });
  }

  private getConfig(): TossReadOnlyConfig {
    return {
      enabled:
        process.env.BROKER_READ_ONLY_ENABLED === 'true' &&
        process.env.TOSS_READ_ONLY_POLLER_ENABLED === 'true',
      baseUrl:
        process.env.TOSS_OPEN_API_BASE_URL ?? 'https://openapi.tossinvest.com',
      clientId: process.env.TOSS_OPEN_API_CLIENT_ID,
      clientSecret: process.env.TOSS_OPEN_API_CLIENT_SECRET,
      accountRef:
        process.env.TOSS_OPEN_API_ACCOUNT_SEQ ??
        process.env.TOSS_OPEN_API_ACCOUNT_REF,
      schemaVerified: process.env.TOSS_OPEN_API_SCHEMA_VERIFIED === 'true',
      fillPollingEnabled:
        process.env.TOSS_READ_ONLY_FILL_POLLER_ENABLED === 'true',
      fillSchemaVerified:
        process.env.TOSS_OPEN_API_FILL_SCHEMA_VERIFIED === 'true',
      fillsPath: this.normalizeReadOnlyPath(
        process.env.TOSS_OPEN_API_FILLS_PATH ?? '/api/v1/orders',
      ),
      timeoutMs: Number(process.env.TOSS_READ_ONLY_HTTP_TIMEOUT_MS ?? 10_000),
    };
  }

  private getAllowedEndpoints(config: TossReadOnlyConfig): string[] {
    return [
      ...ALLOWED_ENDPOINTS,
      ...(config.fillPollingEnabled &&
      config.fillSchemaVerified &&
      config.fillsPath
        ? [`GET ${config.fillsPath}`]
        : []),
    ];
  }

  private normalizeReadOnlyPath(value: string | undefined): string | undefined {
    const trimmed = value?.trim();

    if (!trimmed) {
      return undefined;
    }

    if (!trimmed.startsWith('/')) {
      throw new BadRequestException(
        'TOSS_OPEN_API_FILLS_PATH must be a relative API path starting with /',
      );
    }

    if (/^\/\//.test(trimmed) || /^https?:\/\//i.test(trimmed)) {
      throw new BadRequestException(
        'TOSS_OPEN_API_FILLS_PATH must not be an absolute URL',
      );
    }

    return trimmed;
  }

  private assertRecord(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object') {
      throw new BadRequestException(`${label} is not an object`);
    }

    return value as Record<string, unknown>;
  }

  private extractAccounts(
    response: Record<string, unknown>,
  ): TossReadOnlyAccountView[] {
    const rawAccounts = this.readArray(response, [
      'result',
      'accounts',
      'items',
    ]);

    return rawAccounts.map((value, index) => {
      const account = this.assertRecord(value, `Toss account item ${index}`);
      const accountSeq = account.accountSeq;
      if (typeof accountSeq !== 'string' && typeof accountSeq !== 'number') {
        throw new BadRequestException(
          `Toss account item ${index} is missing accountSeq`,
        );
      }

      return {
        accountSeq: String(accountSeq),
        accountNoMasked:
          typeof account.accountNo === 'string'
            ? this.mask(account.accountNo)
            : undefined,
        accountType:
          typeof account.accountType === 'string'
            ? account.accountType
            : undefined,
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      };
    });
  }

  private readArray(
    record: Record<string, unknown>,
    keys: string[],
  ): unknown[] {
    for (const key of keys) {
      const value = key
        .split('.')
        .reduce<unknown>(
          (current, part) =>
            current && typeof current === 'object'
              ? (current as Record<string, unknown>)[part]
              : undefined,
          record,
        );
      if (Array.isArray(value)) {
        return value;
      }
    }

    return [];
  }

  private mask(value: string): string {
    if (value.length <= 6) {
      return 'configured';
    }

    return `${value.slice(0, 3)}***${value.slice(-3)}`;
  }
}

export function assertTossReadOnlyEndpointAllowed(
  method: HttpMethod,
  path: string,
  allowedEndpoints: string[] = ALLOWED_ENDPOINTS,
): void {
  const key = `${method} ${path}`;

  if (!allowedEndpoints.includes(key)) {
    throw new BadRequestException(
      `Toss read-only adapter blocks ${key}; only configured read-only account, holdings, and fill reads are allowed`,
    );
  }
}

async function defaultRequester(
  request: TossReadOnlyRequest,
): Promise<unknown> {
  const axiosConfig: AxiosRequestConfig = {
    method: request.method,
    url: `${request.baseUrl}${request.path}${formatQuery(request.query)}`,
    headers: request.headers,
    data: request.data,
    timeout: request.timeoutMs,
  };
  const response = await axios.request(axiosConfig);

  return response.data;
}

function formatQuery(query: Record<string, string> | undefined): string {
  if (!query || Object.keys(query).length === 0) {
    return '';
  }

  return `?${new URLSearchParams(query).toString()}`;
}
