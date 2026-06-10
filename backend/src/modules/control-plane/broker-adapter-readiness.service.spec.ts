import { BrokerAdapterReadinessService } from './broker-adapter-readiness.service';

describe('BrokerAdapterReadinessService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.BROKER_PROVIDER;
    delete process.env.BROKER_READ_ONLY_ENABLED;
    delete process.env.TOSS_OPEN_API_BASE_URL;
    delete process.env.TOSS_OPEN_API_CLIENT_ID;
    delete process.env.TOSS_OPEN_API_CLIENT_SECRET;
    delete process.env.TOSS_OPEN_API_ACCOUNT_REF;
    delete process.env.TOSS_OPEN_API_ACCOUNT_SEQ;
    delete process.env.TOSS_READ_ONLY_POLLER_ENABLED;
    delete process.env.TOSS_READ_ONLY_FILL_POLLER_ENABLED;
    delete process.env.TOSS_OPEN_API_SCHEMA_VERIFIED;
    delete process.env.TOSS_OPEN_API_FILL_SCHEMA_VERIFIED;
    delete process.env.TOSS_OPEN_API_FILLS_PATH;
    delete process.env.TOSS_OPEN_API_SANDBOX_VERIFIED;
    delete process.env.TOSS_OPEN_API_LAST_VERIFIED_AT;
    delete process.env.BROKER_CREDENTIAL_CUSTODY_MODE;
    delete process.env.BROKER_CREDENTIAL_SECRET_REF;
    delete process.env.TOSS_OPEN_API_SECRET_REF;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('reports Toss broker readiness as blocked by default', () => {
    const service = new BrokerAdapterReadinessService();

    const status = service.getStatus();

    expect(status).toEqual(
      expect.objectContaining({
        provider: 'toss',
        configured: false,
        readOnlyEnabled: false,
        paperTradingEnabled: false,
        liveTradingEnabled: false,
        authMethod: 'oauth2_client_credentials',
        credentialRef: 'missing',
        credentialCustody: expect.objectContaining({
          mode: 'missing',
          configured: false,
          productionReady: false,
          secretRef: 'missing',
        }),
        schemaVerified: false,
        sandboxVerified: false,
        brokerExecutionEnabled: false,
        readOnlyPoll: expect.objectContaining({
          enabled: false,
          canPoll: false,
          canPollFills: false,
          brokerExecutionEnabled: false,
          liveTradingEnabled: false,
        }),
        emergencyControls: expect.objectContaining({
          runtimeKillSwitchReady: true,
          brokerCancelReady: false,
          brokerFlattenReady: false,
          openOrderPollingReady: false,
          brokerWriteEnabled: false,
          dryRunOnly: true,
          blockers: expect.arrayContaining([
            'Broker write access is disabled.',
            'Broker emergency open-order custody is not implemented.',
            'Broker cancel/replace endpoint is not implemented.',
            'Broker flatten-position order path is not implemented.',
          ]),
        }),
      }),
    );
    expect(status.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('credentials'),
        expect.stringContaining('credentialCustody'),
        expect.stringContaining('openApiSchema'),
        expect.stringContaining('orderPlacement'),
        expect.stringContaining('killSwitch'),
      ]),
    );
  });

  it('marks read-only capability ready only after credentials and schema are verified', () => {
    process.env.BROKER_READ_ONLY_ENABLED = 'true';
    process.env.TOSS_OPEN_API_BASE_URL = 'https://openapi.tossinvest.com';
    process.env.TOSS_OPEN_API_CLIENT_ID = 'client-123456';
    process.env.TOSS_OPEN_API_CLIENT_SECRET = 'secret-value';
    process.env.TOSS_OPEN_API_ACCOUNT_REF = 'account-ref';
    process.env.TOSS_OPEN_API_SCHEMA_VERIFIED = 'true';
    process.env.TOSS_OPEN_API_LAST_VERIFIED_AT = '2026-05-23T00:00:00.000Z';

    const service = new BrokerAdapterReadinessService();

    const status = service.getStatus();

    expect(status).toEqual(
      expect.objectContaining({
        configured: true,
        readOnlyEnabled: true,
        liveTradingEnabled: false,
        credentialRef: 'cli***456',
        credentialCustody: expect.objectContaining({
          mode: 'env',
          configured: true,
          productionReady: false,
          secretRef: 'local-env',
        }),
        schemaVerified: true,
        sandboxVerified: false,
        lastVerifiedAt: '2026-05-23T00:00:00.000Z',
        readOnlyPoll: expect.objectContaining({
          enabled: false,
          configured: true,
          schemaVerified: true,
          canPoll: false,
          canPollFills: false,
        }),
      }),
    );
    expect(status.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'readOnlyAccountSnapshot',
          status: 'ready',
        }),
        expect.objectContaining({
          key: 'credentialCustody',
          status: 'blocked',
        }),
        expect.objectContaining({
          key: 'orderPlacement',
          status: 'blocked',
        }),
      ]),
    );
  });

  it('marks credential custody ready only with an external secret reference', () => {
    process.env.BROKER_READ_ONLY_ENABLED = 'true';
    process.env.TOSS_OPEN_API_CLIENT_ID = 'client-123456';
    process.env.TOSS_OPEN_API_CLIENT_SECRET = 'secret-value';
    process.env.TOSS_OPEN_API_ACCOUNT_SEQ = 'acct-123456789';
    process.env.TOSS_OPEN_API_SCHEMA_VERIFIED = 'true';
    process.env.BROKER_CREDENTIAL_CUSTODY_MODE = 'external_secret_ref';
    process.env.BROKER_CREDENTIAL_SECRET_REF = 'aws-secrets:toss-prod-key';

    const service = new BrokerAdapterReadinessService();

    const status = service.getStatus();

    expect(status.credentialCustody).toEqual(
      expect.objectContaining({
        mode: 'external_secret_ref',
        configured: true,
        productionReady: true,
        secretRef: 'aws***key',
      }),
    );
    expect(status.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'credentialCustody',
          status: 'ready',
        }),
      ]),
    );
  });

  it('marks read-only fill polling configured after schema verification', () => {
    process.env.BROKER_READ_ONLY_ENABLED = 'true';
    process.env.TOSS_READ_ONLY_POLLER_ENABLED = 'true';
    process.env.TOSS_READ_ONLY_FILL_POLLER_ENABLED = 'true';
    process.env.TOSS_OPEN_API_CLIENT_ID = 'client-123456';
    process.env.TOSS_OPEN_API_CLIENT_SECRET = 'secret-value';
    process.env.TOSS_OPEN_API_ACCOUNT_SEQ = 'acct-123456789';
    process.env.TOSS_OPEN_API_SCHEMA_VERIFIED = 'true';
    process.env.TOSS_OPEN_API_FILL_SCHEMA_VERIFIED = 'true';

    const service = new BrokerAdapterReadinessService();

    const status = service.getStatus();

    expect(status.readOnlyPoll).toEqual(
      expect.objectContaining({
        enabled: true,
        canPoll: true,
        fillPollingEnabled: true,
        fillSchemaVerified: true,
        fillPathConfigured: true,
        canPollFills: true,
        allowedEndpoints: expect.arrayContaining([
          'GET /api/v1/orders',
          'GET /api/v1/holdings',
          'GET /api/v1/buying-power',
          'GET /api/v1/exchange-rate',
        ]),
      }),
    );
    expect(status.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'fillPolling',
          status: 'configured',
        }),
      ]),
    );
  });
});
