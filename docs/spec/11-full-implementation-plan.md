# Full Implementation Plan

Status: active normative spec.

Last aligned: 2026-06-01.

## Purpose

This document turns the long-term spec into an implementation plan. It is not a promise that every phase is approved for immediate implementation. It defines the order, dependencies, acceptance criteria, and verification evidence needed to complete the self-funded-capital-first system.

The controlling rule is:

```text
build executable self-funded capital evidence first;
defer broker writes and Darwinex/Zero adapters until their explicit gates are met.
```

## Current Completion State

Implemented:

- Alpha Architect strategy research corpus stored with source attribution and hashes.
- Hypothesis registry ingestion from the strategy register.
- Durable `research_hypotheses` and `research_job_records` tables.
- Selected-run-bias check that blocks promotion when retained variants are missing.
- Hugging Face FOMC text evidence ingestion into point-in-time raw evidence.
- Numeric, LLM, and meta alpha decision storage paths.
- Active LLM agent decision, evaluation-run, and forecast-label ledgers.
- LEAN local/simulator runner and QuantConnect Cloud listing/import wrappers.
- Cloud insight/order pagination and artifact import.
- Paper replay separated from current paper trading/shadow trading artifacts.
- Read-only backtest-cycle dashboard and status API.
- Framework-neutral runtime factory at `backend/src/runtime/create-lincei-runtime.ts`.
- First-class `lincei` CLI at `backend/src/cli/lincei.ts`.
- `lincei agent decide`, `lincei agent score`, `lincei agent shadow`, and `lincei agent paper` CLI commands.
- `lincei broker simulate-paper-plan` CLI command for simulated broker snapshot, order-status, fill-report, and reconciliation rehearsal.
- Thin Hono HTTP adapter at `backend/src/http/hono-app.ts`.
- Capital evidence vertical slice that records blocked/passed/flat variant outcomes before promotion review.

Not complete:

- P1 hypotheses are not yet converted into retained LEAN strategy variants.
- Simple trend, defensive, momentum, and daily-return baselines do not yet have complete promotion evidence.
- Broad point-in-time and vintage data stores are incomplete.
- Ablation jobs are recorded by the capital evidence slice, but backtest and Cloud-import variants still need full retained sweep evidence.
- QuantConnect Cloud artifacts still depends on operator-provided project/backtest ids and credentials.
- Active LLM agent decisions now create risk-gated shadow records and paper order-plan/reconciliation records, but long-horizon prospective label volume and promotion thresholds are still incomplete.
- Simulated broker rehearsal proves broker evidence schema and reconciliation plumbing only; current broker-read-only evidence is incomplete until a provider-backed snapshot/fill path is available.
- Broker-write and Darwinex/Zero adapters are not approved for implementation.

## Target End State

The complete system has one validated path:

```text
strategy research corpus
  -> hypothesis registry
  -> point-in-time and vintage data
  -> numeric/ML baseline backtests
  -> active LLM agent decision ledger
  -> prospective paper/shadow evaluation
  -> forecast scoring
  -> historical episode replay and Cloud import for backtestable paths
  -> capital allocation ledger
  -> risk-gated action plan
  -> portfolio targets
  -> deterministic risk gate
  -> paper trading/shadow trading artifacts
  -> reconciliation
  -> simulated broker rehearsal
  -> broker-read-only proof
  -> user-approved broker-write spec
  -> self-funded capital allocation
  -> later Darwinex/Zero track-record path
```

The system is not complete until failed, blocked, flat, and winning variants are all retained and visible in promotion review.

Canonical operator entrypoint:

```bash
bun --cwd=backend run lincei -- capital run --max-backtest-workers 1 --json
```

Compatibility `./scripts/*` wrappers may remain during migration, but new operational commands should be added to `lincei`.

## Workstream A: Parallel Research Pipeline And Variant Ledger

Goal: make every research and validation attempt durable, replayable, and bias-auditable.

Deliver:

- `ResearchJobRecord` creation for data ingest, feature generation, LLM-derived feature jobs, ablations, backtests, Cloud imports, and promotion checks.
- Job parent/child relationships from hypothesis to feature jobs to backtest variants.
- Idempotency keys for every job type named in [Parallel Research Pipeline](10-parallel-research-factory.md).
- Variant registry linking one hypothesis to many strategy versions, parameter hashes, data manifests, and outcomes.
- Search-space records that describe what was tried before seeing results.
- Cost records for LLM, data, QuantConnect, storage, and Oracle Cloud ARM usage.

Acceptance:

- Retrying any job preserves one canonical job record.
- A failed or blocked variant is queryable and cannot be silently overwritten by a later winning run.
- `./scripts/run-selected-run-bias-check` blocks when a promoted candidate has only winner artifacts.
- Promotion reports show attempted, passed, failed, blocked, and rejected variant counts.

Verification:

```bash
./scripts/build-hypothesis-registry
./scripts/run-selected-run-bias-check
cd backend && bun run test -- src/modules/v1-pilot/research/research-factory.service.spec.ts
```

## Workstream B: Data, Vintage, And Universe Foundation

Goal: ensure strategy replay uses only information available at decision time.

Deliver:

- Broad liquid ETF and U.S. equity research universe profiles separate from the current theme universe.
- Daily adjusted market bars with `timestamp`, `availabilityTimestamp`, data provider, adjustment mode, and hash.
- Vintage macro series storage for restatable economic data.
- Filing/news/macro text stores with `eventTime`, `publishedAt`, `retrievedAt`, `availableAt`, parser version, and content hash.
- Index membership and factor membership stores for crowding/index/rebalance hypotheses.
- Data-quality blockers for missing availability time, unknown vintage, insufficient history, stale source, and unlicensed data.

Acceptance:

- Every feature snapshot cites source refs and availability time.
- Unknown or revised-without-vintage data blocks promotion.
- Theme-universe, broad-universe, and ETF-only results are labeled separately.
- A backtest report can explain the data known at each decision timestamp.

Verification:

```bash
./scripts/prepare-lean-local-data --skip-market-data-ingest
./scripts/ingest-semantic-evidence --source hf-fomc-statements-minutes --limit 80
cd backend && bun run test -- src/modules/v1-pilot/alpha/huggingface-semantic-evidence-ingest.service.spec.ts
```

## Workstream C: Simple Self-Funded Capital Baselines

Goal: build boring baselines before relying on LLM-derived alpha.

Deliver:

- Liquid ETF trend-following baseline.
- Defensive allocation or low-volatility baseline.
- Momentum baseline with skip-month and volatility-conditioned variants.
- Daily-return numeric feature baseline.
- Benchmark configuration for each baseline.
- Cost, slippage, turnover, liquidity, and tax-context assumptions.
- Variant job records for numeric-only baseline runs.

Acceptance:

- Each P1 baseline has a hypothesis id, data manifest, source hash, parameter hash, and retained result.
- Each baseline can pass or fail independently; rejection is recorded as evidence.
- Local simulator evidence cannot satisfy promotion.
- Baseline promotion requires local LEAN or QuantConnect Cloud artifacts plus multiple-testing bias review.

Verification:

```bash
./scripts/run-local-strategy-smoke
./scripts/run-full-backtest.sh --skip-alpha-cycle --skip-market-data-ingest --no-download-data
./scripts/import-lean-run latest
./scripts/run-selected-run-bias-check
```

## Workstream D: Active LLM Agent Decision Ledger

Goal: evaluate LLM judgment prospectively instead of forcing every active LLM
variant into exhaustive historical backtests.

Deliver:

- `AgentDecisionRecord` persistence for forecasts, theses, counter-theses,
  invalidation conditions, risk notes, and action plans.
- `AgentEvaluationRun` persistence for run mode, prompt version, policy version,
  input/output hashes, decisions, blockers, and evidence refs.
- `AgentForecastLabel` persistence with realized return, Brier score, and log
  score.
- `lincei agent decide`.
- `lincei agent score`.
- `lincei agent shadow`.
- `lincei agent paper`.
- deterministic active-agent order-intent mapper.
- active-agent paper bridge through the existing proposal, approval, paper fill,
  and reconciliation ledgers.
- simulated broker rehearsal that turns a reconciled paper order-plan into dry-run broker command, simulated order status, simulated fill report, simulated account snapshot, and broker reconciliation artifacts.
- blocked records when LLM credentials, market data, or horizons are missing.

Acceptance:

- LLM action plans never contain broker payloads or final order quantities.
- Missing LLM credentials create blocked evidence instead of simulated LLM
  success.
- Forecast scoring is reported separately from trading PnL.
- Active-agent shadow evidence cannot satisfy LEAN/Cloud promotion evidence.
- Active-agent paper order-plans are reconciled before being treated as passed.
- Active agent decisions cannot satisfy broker-write readiness by themselves.
- Simulated broker rehearsal can prove provider-neutral broker schema and reconciliation contracts, but cannot satisfy real broker-read-only evidence, broker-write readiness, or promotion evidence.

Verification:

```bash
bun --cwd=backend run lincei -- agent decide --json
bun --cwd=backend run lincei -- agent shadow --json
bun --cwd=backend run lincei -- agent paper --json
bun --cwd=backend run lincei -- broker simulate-paper-plan --json
bun --cwd=backend run lincei -- agent score --json
cd backend && bun run test -- src/modules/v1-pilot/agent/active-llm-agent.service.spec.ts src/modules/v1-pilot/paper/active-llm-paper-bridge.service.spec.ts src/modules/v1-pilot/broker/simulated-broker-rehearsal.service.spec.ts
```

## Workstream E: LLM Semantic Alpha And Ablations

Goal: make LLM output a typed feature source, not a trade allocator.

Deliver:

- Filing, news, macro, and research-derived text ingestion with point-in-time availability.
- LLM-derived feature schema validation and abstain records.
- Prompt/model version registry.
- Object Store/custom-data export for LEAN replay.
- Numeric-only, LLM-only, and combined ablation variants.
- Bull/bear review outputs as risk flags, not final order quantities.

Acceptance:

- LLM prompts never include broker credentials or raw account identifiers.
- LLM output never includes broker order payloads or final order quantities.
- LEAN rejects stale or future semantic features.
- Combined alpha must beat or justify itself against numeric-only baselines after costs.

Verification:

```bash
./scripts/ingest-semantic-evidence --source hf-fomc-statements-minutes --limit 80
./scripts/run-alpha-cycle
./scripts/qc-object-store-sync <key> artifacts/llm-features/latest.json
```

## Workstream F: LEAN And QuantConnect Cloud Baseline Evidence

Goal: keep Cloud-imported artifacts as core evidence for backtestable baselines,
custom-data replay, and historical episode tests. They are no longer the only
center of proof for active LLM agents.

Deliver:

- Strategy package verification before Cloud push.
- Cloud backtest list/import by `projectId` and `backtestId`.
- Parallel Cloud artifact imports by endpoint/page.
- Imported statistics, insights, orders, fills, logs, charts, and equity curves.
- Cloud artifacts acceptance policy by runtime, status, promotion eligibility, data manifest, and blocker reasons.

Acceptance:

- Cloud command success alone is not promotion evidence.
- Promotion evidence requires imported Cloud artifacts tied to project/backtest ids.
- Cloud import preserves Cloud ids and artifact hashes.
- Missing credentials, account tier, data entitlement, or project id becomes blocked evidence.

Verification:

```bash
./scripts/verify-lean-cloud-package aggressive_llm_momentum
./scripts/list-cloud-projects
./scripts/list-cloud-backtests --project-id <project-id> --limit 10
./scripts/import-cloud-backtest --project-id <project-id> --backtest-id <backtest-id>
```

## Workstream G: Portfolio, Risk, Paper, Shadow, Agent Arena, And Learning

Goal: prove a candidate can move from alpha to current execution evidence without broker writes.

Deliver:

- LEAN Insight to portfolio target import.
- Deterministic risk gates with max notional, gross exposure, single-name cap, stale-data block, and kill-switch state.
- Paper order plan creation from accepted targets.
- Paper fills and reconciliation.
- Current shadow trading records using live data without broker writes.
- Active LLM agent paper/shadow arena that records risk-gated action plans.
- Simulated broker adapter rehearsal that emits broker-like snapshots, order statuses, and fill reports from paper state.
- Outcome labels by horizon.
- Forecast scoring and calibration reports for active LLM agent variants.
- Promotion/rejection ledger that joins hypothesis, data, alpha, active agent
  decisions, forecast labels, backtest, paper trading/shadow trading,
  reconciliation, and multiple-testing bias evidence.

Acceptance:

- Portfolio/risk/execution-like stages are single-writer.
- Unknown, stale, or mismatched state blocks advancement.
- Historical paper replay is not treated as broker-write pre-trade risk checks.
- Promotion requires current paper trading/shadow trading artifacts, not only historical replay.
- Active LLM agent promotion requires prospective decision and label evidence,
  not only historical episode replay.
- Simulated broker adapter evidence is contract/reconciliation proof only; it cannot be reported as real broker-read-only evidence or broker-write approval.

Verification:

```bash
bun --cwd=backend run lincei -- paper run --json
bun --cwd=backend run lincei -- paper replay --json
bun --cwd=backend run lincei -- shadow run --json
bun --cwd=backend run lincei -- broker simulate-paper-plan --json
bun --cwd=backend run lincei -- learning run --json
bun --cwd=backend run lincei -- preflight run --json
```

## Workstream H: Oracle Cloud ARM Continuous Operation

Goal: make the research/evidence loop run continuously with bounded costs and explicit blockers.

Deliver:

- Oracle Cloud ARM deployment runbook.
- Scheduler for corpus refresh, data ingest, feature generation, LLM jobs, ablations, Cloud imports, paper trading/shadow trading, reconciliation, and alerts.
- Job concurrency caps by platform and provider.
- Cost caps for LLM, QuantConnect, data, storage, and compute.
- Health checks for stale data, failed jobs, missing credentials, Cloud blockers, and reconciliation mismatches.
- Run reports suitable for reviewing overnight work.

Acceptance:

- Missed schedules and stale inputs create blocked evidence.
- Parallel research jobs do not mutate execution-like ledgers.
- The always-on control plane cannot submit broker writes before the broker-write spec is approved.

Verification:

```bash
./scripts/live-preflight
cd backend && bun run build
cd backend && bun run test
```

## Workstream I: Broker-Read-Only Reconciliation

Goal: observe real account state before any account mutation exists.

Deliver:

- User-approved broker candidate for read-only work.
- Provider mapping that can replace the simulated broker adapter's paper-derived snapshot/fill/status inputs with provider-backed broker observations.
- Account, cash, buying power, position, open-order, fill, fee, and tax-lot read models.
- Append-only broker snapshot and fill ledgers.
- Reconciliation against paper trading/shadow trading expected state.
- Credential custody checks and hashed account refs.

Acceptance:

- No submit, cancel, replace, flatten, transfer, margin, or account-setting write method exists.
- Unknown broker read state is blocked.
- Broker credentials never enter LLM prompts, frontend state, logs, or research artifacts.
- Reconciliation mismatch blocks broker-write pre-trade risk check status.
- Passing simulated broker rehearsal remains insufficient; provider-backed snapshot/fill reconciliation must match before broker-write pre-trade risk checks can become ready.

Verification:

```bash
bun --cwd=backend run lincei -- broker simulate-paper-plan --json
bun --cwd=backend run lincei -- preflight run --json
cd backend && bun run test -- src/modules/control-plane
```

## Workstream J: Broker-Write Implementation Spec

Goal: define the exact account-mutation boundary before implementing self-funded capital trading.

Deliver:

- User-approved broker, account, asset classes, market hours, and order types.
- Exact allowed write methods.
- Maximum notional, gross exposure, single-name exposure, daily loss, drawdown, and turnover limits.
- Kill switch, cancel, flatten, and rollback drills.
- Broker schema verification.
- Pre-trade risk check failure cases for unknown, stale, mismatched, unsupported, and over-cap state.
- Deployment and incident runbooks.

Acceptance:

- This workstream is not approved by this document alone.
- Implementation starts only after explicit user approval of the broker-write spec.
- Every write-like method has at least one fail-closed test.
- LLMs cannot see credentials, raw broker identifiers, or final order payloads.

Verification:

```bash
./scripts/live-preflight
cd backend && bun run test -- <broker-write-spec-tests>
```

## Workstream K: Self-Funded Capital Allocation

Goal: trade the operator's own pre-funded capital only after evidence gates pass.

Deliver:

- Self-funded capital broker adapter implemented under the approved broker-write spec.
- Pre-trade risk check and post-trade reconciliation.
- Real fills imported and matched.
- Capital allocation reports.
- Strategy retirement and de-risking rules.
- Tax-context reporting for the operator.

Acceptance:

- Orders are never submitted from LLM output directly.
- Broker writes require ready pre-trade risk check, current paper trading/shadow trading artifacts, and matched broker-read-only state.
- Fill mismatches or open-order unknowns block new exposure.
- Capital scaling requires explicit approval and updated limits.

Verification:

```bash
./scripts/live-preflight
./scripts/run-learning-loop
```

Additional broker-write commands must be named only in the future approved broker-write spec.

## Workstream L: Darwinex/Zero Track-Record Path

Goal: use self-funded capital deployment-grade signals to pursue later external-capital performance fees.

Deliver:

- Darwinex/Zero account, subscription, jurisdiction, and terms verification.
- Instrument mapping from approved self-funded capital strategy to Darwinex/Zero-supported instruments.
- MetaTrader or approved API bridge design.
- Execution/reconciliation records separate from QuantConnect evidence.
- Darwinex Risk Engine reports separate from our portfolio target sizing.
- Performance-fee evidence import based on allocated-capital profit.

Acceptance:

- Self-funded capital deployment-grade strategy validation artifacts exist first.
- Darwinex/Zero is not treated as a backtest provider.
- The system reports our signal, Darwinex/Zero execution, Darwinex risk standardization, and fee evidence separately.
- Performance-fee claims come from Darwinex/Zero records, not simulated returns.

Verification:

```bash
./scripts/run-learning-loop
```

Future Darwinex/Zero commands require a separate approved adapter spec.

## Parallelization Map

Parallelize:

- research corpus ingestion by source/page/article;
- hypothesis extraction by document;
- market/news/filing/macro ingest by source, symbol, and time window;
- feature generation by feature family, symbol, and window;
- LLM-derived features by event/symbol/window under cost caps;
- active LLM agent decisions by independent symbol or historical episode before
  risk consolidation;
- numeric/LLM/combined ablations by hypothesis and parameter hash;
- local backtests by strategy variant where platform resources allow;
- QuantConnect Cloud imports by endpoint/page range.

Keep single-writer:

- promotion decision;
- portfolio target consolidation;
- deterministic risk gates;
- paper trading/shadow trading execution intent;
- reconciliation;
- broker-read-only account truth per provider/account;
- broker-write pre-trade risk check;
- future broker writes.

## Definition Of Done For The Full Spec

The full long-term spec is implemented only when:

- P1 baselines, LLM-derived feature variants, and active LLM agent variants are represented as retained variant evidence.
- Point-in-time and vintage data blockers are enforced.
- QuantConnect Cloud imports produce accepted or blocked promotion evidence.
- Current paper trading/shadow trading artifacts, active agent forecast labels, and reconciliation exist for promoted candidates.
- Simulated broker rehearsal passes for current paper order-plans while remaining separate from provider-backed broker evidence.
- Selected-run-bias review can inspect winning, losing, failed, and blocked variants.
- Oracle Cloud ARM can run the non-broker loop continuously with cost and stale-data controls.
- Broker-read-only reconciliation is implemented and matched.
- A separate broker-write implementation spec is approved and implemented.
- Self-funded capital fills are reconciled before any Darwinex/Zero adapter is prioritized.

Until all of these are true, reports must say which rung of the evidence ladder is complete and which exact blocker remains.
