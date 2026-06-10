# Toss Securities Open API Readiness

Status: supporting broker-readiness note.

Last checked: 2026-06-09 KST against the official Toss OpenAPI source index.

The active spec permits read-only broker evidence and blocked pre-trade risk
checks. It does not approve Toss broker writes.

## Official Sources

Use [Toss OpenAPI Source Index](toss-openapi-source-index.md) for the current
fetch links. The important source-of-truth chain is:

1. https://developers.tossinvest.com/llms.txt
2. https://openapi.tossinvest.com/openapi-docs/overview.md
3. https://openapi.tossinvest.com/openapi-docs/latest/api-reference/README.md
4. https://openapi.tossinvest.com/openapi-docs/latest/openapi.json

The OpenAPI JSON checked on 2026-06-09 reports API version `1.0.3` and base
server `https://openapi.tossinvest.com`.

## Current API Shape Relevant To This Repo

- Auth uses OAuth2 Client Credentials: `POST /oauth2/token`.
- Account-specific reads require `Authorization: Bearer ...` and
  `X-Tossinvest-Account`.
- Account discovery: `GET /api/v1/accounts`.
- Holdings: `GET /api/v1/holdings`.
- Buying power: `GET /api/v1/buying-power?currency=KRW|USD`.
- FX conversion: `GET /api/v1/exchange-rate?baseCurrency=USD&quoteCurrency=KRW`.
- Open orders: `GET /api/v1/orders?status=OPEN`.
- Order create/modify/cancel endpoints exist, but are broker-write scope and
  remain blocked.

Toss holdings are not a full cash account statement by themselves. The local
read-only snapshot combines holdings, buying power, and USD/KRW exchange-rate
responses into a provider-neutral KRW broker snapshot. This is a practical
reconciliation input, not a claim that the account is ready for broker writes.

## Current Implementation Posture

The repository keeps Toss behind a broker adapter boundary:

- `TossReadOnlyBrokerService` fetches Toss read-only account data only when
  explicitly enabled.
- Toss responses are mapped into provider-neutral broker snapshot/fill ledgers.
- Raw Toss account references are hashed before persistence.
- Broker execution flags remain `false`.
- LLM prompts, frontend state, logs, and research artifacts must not receive
  Toss credentials or raw account identifiers.

Read-only polling is disabled unless all of the following are set:

```text
BROKER_READ_ONLY_ENABLED=true
TOSS_READ_ONLY_POLLER_ENABLED=true
TOSS_OPEN_API_CLIENT_ID=...
TOSS_OPEN_API_CLIENT_SECRET=...
TOSS_OPEN_API_ACCOUNT_SEQ=...
TOSS_OPEN_API_SCHEMA_VERIFIED=true
```

If `TOSS_OPEN_API_ACCOUNT_SEQ` is unknown, run account discovery first:

```bash
bun --cwd=backend run lincei -- broker list-accounts --json
```

This command requires only `TOSS_OPEN_API_CLIENT_ID` and
`TOSS_OPEN_API_CLIENT_SECRET`. It calls `POST /oauth2/token` and
`GET /api/v1/accounts`, masks account numbers, and returns the `accountSeq`
needed for the `X-Tossinvest-Account` header. It does not create broker
snapshots, fills, or orders.

Open-order status and partial-fill polling is also disabled unless:

```text
TOSS_READ_ONLY_FILL_POLLER_ENABLED=true
TOSS_OPEN_API_FILL_SCHEMA_VERIFIED=true
```

`TOSS_OPEN_API_FILLS_PATH` may override the read-only order source, but the
default is the official `GET /api/v1/orders?status=OPEN` path. This imports
open-order lifecycle observations into `broker_order_status_records` and imports
positive execution quantities into `broker_fills`. It does not prove complete
historical fill coverage because the current Toss docs say `status=CLOSED`
order listing is not supported.

## Required Before Any Future Broker-Write Spec

1. Run read-only account, holdings, buying-power, FX, and open-order polling
   against the operator's real Toss account.
2. Reconcile Toss broker snapshots against paper/shadow records over repeated
   market sessions.
3. Prove duplicate-poll idempotency and failure behavior for token failures,
   429 rate limits, network timeouts, stale snapshots, and partial fills.
4. Verify order preview inputs from buying-power, sellable-quantity, commission,
   market calendar, and stock warning APIs.
5. Confirm whether Toss offers any official sandbox/paper environment. Treat all
   order endpoints as real-money capability until then.
6. Draft a separate broker-write implementation spec with exact capital limits,
   order types, idempotency keys, emergency cancel/flatten behavior, credential
   custody, deployment process, and reconciliation gates.
7. Get explicit user approval for that broker-write spec.

Until that spec exists, submit, cancel, modify, replace, flatten, transfer, and
account-setting mutation paths must fail closed.
