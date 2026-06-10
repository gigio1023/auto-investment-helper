import { Injectable } from '@nestjs/common';
import {
  BrokerAdapterCapability,
  BrokerCredentialCustodyMode,
  BrokerCredentialCustodyStatus,
  BrokerEmergencyControlStatus,
  BrokerAdapterProvider,
  BrokerAdapterStatus,
} from './control-plane.types';

@Injectable()
export class BrokerAdapterReadinessService {
  getStatus(): BrokerAdapterStatus {
    const provider = this.parseProvider(process.env.BROKER_PROVIDER);
    const baseUrl = process.env.TOSS_OPEN_API_BASE_URL;
    const clientIdConfigured = Boolean(process.env.TOSS_OPEN_API_CLIENT_ID);
    const clientSecretConfigured = Boolean(
      process.env.TOSS_OPEN_API_CLIENT_SECRET,
    );
    const accountRefConfigured = Boolean(process.env.TOSS_OPEN_API_ACCOUNT_REF);
    const accountSeqConfigured = Boolean(process.env.TOSS_OPEN_API_ACCOUNT_SEQ);
    const schemaVerified = process.env.TOSS_OPEN_API_SCHEMA_VERIFIED === 'true';
    const fillSchemaVerified =
      process.env.TOSS_OPEN_API_FILL_SCHEMA_VERIFIED === 'true';
    const fillPollingEnabled =
      process.env.TOSS_READ_ONLY_FILL_POLLER_ENABLED === 'true';
    const readOnlyFillPath =
      process.env.TOSS_OPEN_API_FILLS_PATH ?? '/api/v1/orders';
    const fillPathConfigured = Boolean(readOnlyFillPath);
    const sandboxVerified =
      process.env.TOSS_OPEN_API_SANDBOX_VERIFIED === 'true';
    const readOnlyEnabled =
      process.env.BROKER_READ_ONLY_ENABLED === 'true' &&
      clientIdConfigured &&
      clientSecretConfigured &&
      (accountRefConfigured || accountSeqConfigured) &&
      schemaVerified;
    const configured =
      clientIdConfigured &&
      clientSecretConfigured &&
      (accountRefConfigured || accountSeqConfigured);
    const credentialRef = configured
      ? this.maskCredentialRef(process.env.TOSS_OPEN_API_CLIENT_ID)
      : 'missing';
    const credentialCustody = this.getCredentialCustodyStatus(configured);
    const emergencyControls = this.getEmergencyControlStatus();

    const capabilities: BrokerAdapterCapability[] = [
      {
        key: 'credentials',
        status: configured ? 'configured' : 'blocked',
        detail: configured
          ? 'Toss credential environment variables are present and masked.'
          : 'TOSS_OPEN_API_CLIENT_ID, TOSS_OPEN_API_CLIENT_SECRET, and TOSS_OPEN_API_ACCOUNT_SEQ are required.',
      },
      {
        key: 'credentialCustody',
        status: credentialCustody.productionReady ? 'ready' : 'blocked',
        detail: credentialCustody.detail,
      },
      {
        key: 'openApiSchema',
        status: schemaVerified ? 'ready' : 'blocked',
        detail: schemaVerified
          ? 'Operator marked the Toss OpenAPI schema as verified.'
          : 'Exact Toss OpenAPI schema is not verified in this repo.',
      },
      {
        key: 'readOnlyAccountSnapshot',
        status: readOnlyEnabled ? 'ready' : 'blocked',
        detail: readOnlyEnabled
          ? 'Read-only snapshot polling can be wired to the broker adapter.'
          : 'Read-only polling remains disabled until credentials, schema, and BROKER_READ_ONLY_ENABLED=true are present.',
      },
      {
        key: 'holdingsSnapshot',
        status: readOnlyEnabled ? 'ready' : 'blocked',
        detail:
          'Holdings can only be trusted after account and holdings response schemas are verified.',
      },
      {
        key: 'orderPreview',
        status: 'not_implemented',
        detail:
          'Order preview or orderable amount support is not implemented yet.',
      },
      {
        key: 'paperOrSandbox',
        status: sandboxVerified ? 'configured' : 'blocked',
        detail: sandboxVerified
          ? 'Operator marked a sandbox or paper environment as verified.'
          : 'No Toss sandbox or paper environment is verified.',
      },
      {
        key: 'orderPlacement',
        status: 'blocked',
        detail:
          'Live order placement is intentionally blocked until read-only reconciliation, sandbox parity, approval custody, and broker-order emergency controls exist.',
      },
      {
        key: 'orderCancelReplace',
        status: 'not_implemented',
        detail:
          'Cancel and modify endpoints are not implemented and must share the same signed order-plan guard.',
      },
      {
        key: 'fillPolling',
        status:
          readOnlyEnabled &&
          fillPollingEnabled &&
          fillSchemaVerified &&
          fillPathConfigured
            ? 'configured'
            : 'blocked',
        detail:
          readOnlyEnabled &&
          fillPollingEnabled &&
          fillSchemaVerified &&
          fillPathConfigured
            ? 'Read-only open-order partial-fill polling can import broker fill evidence through the provider-neutral ledger.'
            : 'Read-only open-order partial-fill polling requires snapshot readiness, TOSS_READ_ONLY_FILL_POLLER_ENABLED=true, and TOSS_OPEN_API_FILL_SCHEMA_VERIFIED=true.',
      },
      {
        key: 'reconciliation',
        status: 'blocked',
        detail:
          'Broker-backed reconciliation requires read-only polling plus account/holdings/fill mapping.',
      },
      {
        key: 'killSwitch',
        status: 'blocked',
        detail: emergencyControls.detail,
      },
    ];

    return {
      provider,
      configured,
      readOnlyEnabled,
      paperTradingEnabled: false,
      liveTradingEnabled: false,
      baseUrl,
      authMethod: 'oauth2_client_credentials',
      credentialRef,
      credentialCustody,
      schemaVerified,
      sandboxVerified,
      lastVerifiedAt: process.env.TOSS_OPEN_API_LAST_VERIFIED_AT,
      readOnlyPoll: {
        provider: 'toss',
        enabled:
          process.env.BROKER_READ_ONLY_ENABLED === 'true' &&
          process.env.TOSS_READ_ONLY_POLLER_ENABLED === 'true',
        configured,
        schemaVerified,
        fillPollingEnabled,
        fillSchemaVerified,
        fillPathConfigured,
        canPoll:
          process.env.BROKER_READ_ONLY_ENABLED === 'true' &&
          process.env.TOSS_READ_ONLY_POLLER_ENABLED === 'true' &&
          configured &&
          schemaVerified,
        canPollFills:
          process.env.BROKER_READ_ONLY_ENABLED === 'true' &&
          process.env.TOSS_READ_ONLY_POLLER_ENABLED === 'true' &&
          fillPollingEnabled &&
          configured &&
          schemaVerified &&
          fillSchemaVerified &&
          fillPathConfigured,
        baseUrl: baseUrl ?? 'https://openapi.tossinvest.com',
        accountRef: configured
          ? this.maskCredentialRef(
              process.env.TOSS_OPEN_API_ACCOUNT_SEQ ??
                process.env.TOSS_OPEN_API_ACCOUNT_REF,
            )
          : 'missing',
        allowedEndpoints: [
          'POST /oauth2/token',
          'GET /api/v1/accounts',
          'GET /api/v1/holdings',
          'GET /api/v1/buying-power',
          'GET /api/v1/exchange-rate',
          'GET /api/v1/orders',
          ...(fillPollingEnabled &&
          fillSchemaVerified &&
          readOnlyFillPath !== '/api/v1/orders'
            ? [`GET ${readOnlyFillPath}`]
            : []),
        ],
        cron: '*/5 * * * *',
        running: false,
        lastReconciliationStatus: 'not_checked',
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      },
      emergencyControls,
      capabilities,
      blockers: capabilities
        .filter((capability) =>
          ['blocked', 'not_implemented'].includes(capability.status),
        )
        .map((capability) => `${capability.key}: ${capability.detail}`),
      brokerExecutionEnabled: false,
    };
  }

  private getEmergencyControlStatus(): BrokerEmergencyControlStatus {
    const blockers = [
      'Broker write access is disabled.',
      'Broker emergency open-order custody is not implemented.',
      'Broker cancel/replace endpoint is not implemented.',
      'Broker flatten-position order path is not implemented.',
      'Emergency broker action reconciliation is not implemented.',
    ];

    return {
      runtimeKillSwitchReady: true,
      brokerCancelReady: false,
      brokerFlattenReady: false,
      openOrderPollingReady: false,
      brokerWriteEnabled: false,
      dryRunOnly: true,
      checkedAt: new Date().toISOString(),
      blockers,
      detail:
        'Runtime stop can halt autonomous advancement, but broker-order cancel/flatten emergency controls are not implemented.',
    };
  }

  private parseProvider(value: string | undefined): BrokerAdapterProvider {
    if (value === 'manual' || value === 'simulated' || value === 'toss') {
      return value;
    }

    return 'toss';
  }

  private getCredentialCustodyStatus(
    credentialsConfigured: boolean,
  ): BrokerCredentialCustodyStatus {
    const secretRef =
      process.env.BROKER_CREDENTIAL_SECRET_REF ??
      process.env.TOSS_OPEN_API_SECRET_REF;
    const mode = this.parseCredentialCustodyMode({
      configuredMode: process.env.BROKER_CREDENTIAL_CUSTODY_MODE,
      secretRef,
      credentialsConfigured,
    });

    if (mode === 'external_secret_ref') {
      const configured = Boolean(secretRef);

      return {
        mode,
        configured,
        productionReady: configured,
        secretRef: configured ? this.maskCredentialRef(secretRef) : 'missing',
        detail: configured
          ? 'Broker credentials are referenced through an external secret manager handle.'
          : 'BROKER_CREDENTIAL_SECRET_REF or TOSS_OPEN_API_SECRET_REF is required for external secret custody.',
      };
    }

    if (mode === 'env') {
      return {
        mode,
        configured: credentialsConfigured,
        productionReady: false,
        secretRef: credentialsConfigured ? 'local-env' : 'missing',
        detail: credentialsConfigured
          ? 'Broker credentials are loaded from local environment variables. This is acceptable for development only, not production trading.'
          : 'Broker credentials are not configured.',
      };
    }

    return {
      mode: 'missing',
      configured: false,
      productionReady: false,
      secretRef: 'missing',
      detail:
        'Production trading requires an external secret manager reference before broker write access can be considered.',
    };
  }

  private parseCredentialCustodyMode(input: {
    configuredMode?: string;
    secretRef?: string;
    credentialsConfigured: boolean;
  }): BrokerCredentialCustodyMode {
    if (
      input.configuredMode === 'env' ||
      input.configuredMode === 'external_secret_ref'
    ) {
      return input.configuredMode;
    }

    if (input.secretRef) {
      return 'external_secret_ref';
    }

    if (input.credentialsConfigured) {
      return 'env';
    }

    return 'missing';
  }

  private maskCredentialRef(value: string | undefined): string {
    if (!value) {
      return 'missing';
    }

    if (value.length <= 6) {
      return 'configured';
    }

    return `${value.slice(0, 3)}***${value.slice(-3)}`;
  }
}
