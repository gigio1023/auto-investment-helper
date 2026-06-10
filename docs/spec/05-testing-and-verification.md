# Testing And Verification Policy

Status: active normative spec.

## Principle

This repository is a non-production research engine. The primary proof is direct execution of the relevant engine path:

- LEAN local backtest;
- QuantConnect Cloud compile/backtest when available;
- result import;
- alpha replay;
- active LLM agent decision ledger;
- forecast scoring;
- paper cycle;
- shadow trading cycle;
- pre-trade risk check;
- reconciliation.

Unit tests support that proof. They do not replace it.

## Detroit-Style Unit Tests

Use narrow Detroit/classicist tests for high-value behavior:

- typed schema validation;
- numeric scoring;
- active agent decision schema validation;
- forecast scoring math such as Brier score and log score;
- feature timestamp and lookahead rejection;
- portfolio sizing math;
- risk policy;
- universe manifest validation and hard-exclusion fail-closed behavior;
- idempotency and duplicate replay;
- cap enforcement;
- kill switch behavior;
- broker/pre-trade risk check fail-closed behavior;
- import mappers around real fixture artifacts.

Prefer concrete services, real value objects, real schemas, and small fixtures. Mock only external API boundaries, time, network, filesystem, brokers, and LLM providers.

Avoid low-value test theater:

- tests that only restate framework wiring;
- excessive mocks of local collaborators;
- broad snapshots with no behavioral claim;
- unit tests that pass while the executable alpha-to-order path cannot run.

## Direct Verification

Every engine-facing change must attempt the direct command that proves the changed path. If the command cannot complete because credentials, account tier, dataset licensing, Docker, market data, or broker schema is missing, report the exact blocker.

Examples:

```bash
bun run build
bun run test
bun run test:e2e

.venv-ml/bin/python -m pytest engines/lean/aggressive_llm_momentum/tests

./scripts/run-full-backtest.sh --skip-alpha-cycle --skip-market-data-ingest --no-download-data
./scripts/prepare-lean-local-data
./scripts/run-local-strategy-smoke
./scripts/run-cloud-quality-backtest
./scripts/import-lean-run latest
./scripts/run-alpha-cycle
bun --cwd=backend run lincei -- agent decide --json
bun --cwd=backend run lincei -- agent score --json
bun --cwd=backend run lincei -- broker simulate-paper-plan --json
./scripts/run-paper-cycle
./scripts/run-paper-replay
./scripts/live-preflight
```

Use the command that matches the touched surface. Do not run broad slow suites just to create noise if a narrower direct verification proves the change.

## Validation Time And Promotion

The project must report elapsed validation time, not only backtest metrics. A strategy that passed one historical run has not proven broker-write readiness or Darwinex readiness.

Promotion reports must include:

- in-sample, out-of-sample, and shadow trading calendar spans;
- prospective active LLM agent evaluation span when an active LLM agent is part of the strategy;
- number of decisions, orders, fills, blocked decisions, and flat/abstain decisions;
- Brier score, log score, calibration summary when available, realized return by horizon, and risk-veto counts for active LLM agent variants;
- market regimes covered when known;
- elapsed clock time since the strategy version first entered shadow trading or paper evaluation;
- whether any result came from historical replay rather than current market evidence.

No self-funded capital or Darwinex/Zero promotion can be based only on a unit-test suite, a local simulator run, a same-day selected backtest, or historical LLM replay.

## Parallel Research Verification

Parallel research jobs must be verified for idempotency and multiple-testing bias controls.

Required evidence:

- job records for attempted variants, not only the winner;
- deterministic input hashes and output hashes;
- retry behavior that does not duplicate evidence;
- search space or parameter range when variants are swept;
- failed, blocked, and losing runs retained in the promotion ledger;
- a clear boundary where parallel outputs join into one promotion decision.

If a promoted strategy came from a parallel sweep, the report must say whether the result was selected after seeing the backtest metrics and what out-of-sample or shadow trading artifacts offsets that bias.

`run-paper-cycle` and `run-paper-replay` prove different things. `run-paper-cycle` is current-market strict and should block stale historical targets. `run-paper-replay` is historical plumbing evidence and must not satisfy live-preflight legacy check or promotion.

`prepare-lean-local-data` is the direct data-path proof before a full quality universe local backtest. A blocked result is acceptable evidence when it identifies missing Stooq API key, missing QuantConnect Security Master/map-factor entitlement, missing LEAN daily zip, missing map/factor file, or insufficient ingested bars per symbol.

To minimize billing, full quality-gated universe validation should prefer `run-cloud-quality-backtest` over local `--download-data`. Local QuantConnect data downloads are not a default verification path because they can spend QCC; they require explicit user approval and `ALLOW_PAID_QC_LOCAL_DATA_DOWNLOAD=true`.

## Evidence Reporting

Final reports must separate:

- unit-test evidence;
- build/type/lint evidence;
- local LEAN evidence;
- QuantConnect Cloud artifacts;
- alpha replay evidence;
- active LLM agent decision ledger evidence;
- forecast label and scoring evidence;
- paper trading/shadow trading evidence;
- pre-trade risk check/reconciliation evidence;
- blockers.

Report commands, modes, artifact paths or run ids, and exact blocker reasons.

For future self-funded capital and Darwinex/Zero work, reports must also separate:

- own broker pre-trade risk check artifacts;
- real broker order/fill/reconciliation evidence;
- Darwinex/Zero signal execution evidence;
- Darwinex/Zero track-record and performance-fee evidence.

## Required Failure Cases

If a change touches broker, execution, paper account, risk, reconciliation, shadow trading, or pre-trade risk check paths, include at least one blocked/failure case. Happy-path-only tests are not enough for execution boundaries.

Unknown state must stay blocked.

## Comments And Test Intent

Test files usually should not need comments. Add a short comment only when the test protects a subtle safety or replay invariant that the test name cannot express clearly.
