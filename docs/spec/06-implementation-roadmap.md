# Implementation Roadmap

Status: active normative spec.

Last aligned: 2026-06-01.

## Roadmap Principle

The roadmap prioritizes the self-funded capital evidence loop:

```text
research hypothesis
  -> point-in-time data
  -> simple baseline
  -> active LLM agent decision ledger
  -> prospective paper/shadow agent evaluation
  -> forecast scoring
  -> parallel ablations and baseline backtests
  -> LEAN / QuantConnect validation for backtestable paths
  -> paper trading/shadow trading
  -> reconciliation
  -> broker-read-only proof
  -> broker-write candidate
```

Darwinex/Zero comes after this loop works. It must not displace self-funded capital readiness work.

Parallelization is a first-class design constraint. Research, ingest, feature generation, LLM-derived feature jobs, ablations, parameter sweeps, and Cloud imports should run concurrently where safe. Portfolio target consolidation, risk cuts, execution intent, reconciliation, and pre-trade risk check must remain single-writer.

## Phase 1: Direction And Evidence Hygiene

Deliver:

- active spec split under `docs/spec/`;
- self-funded capital allocation documented as the first monetization priority;
- Darwinex/Zero documented as a downstream track-record path;
- old live-pilot scope marked superseded;
- validation reports distinguish direct execution from unit tests.

Acceptance:

- `SPEC.md` is enough to find the full active spec;
- current milestone does not enable real broker writes;
- future broker-write, capital-limit, leverage, derivatives, Darwinex adapter, and testing-policy changes require explicit user approval.

## Phase 2: Parallel Job Substrate

Deliver:

- durable `ResearchJobRecord` or equivalent job ledger;
- job id, run id, parent id, partition key, input refs, input hash, output refs, output hash, status, retry, cost ref, and blocker reasons;
- idempotent upsert rules for corpus ingest, data ingest, feature jobs, LLM jobs, ablations, backtests, and Cloud imports;
- concurrency caps for local platform, Oracle Cloud ARM, LLM APIs, QuantConnect APIs, and data providers;
- multiple-testing bias detection that can see failed, blocked, and losing variants.

Acceptance:

- retrying a job cannot duplicate evidence;
- unknown idempotency state is blocked;
- failed and losing variants are preserved;
- execution-like ledgers remain single-writer.

## Phase 3: Research Corpus And Hypothesis Registry

Deliver:

- strategy research corpus for articles, papers, and practitioner notes;
- Alpha Architect corpus mapped into a strategy register;
- hypothesis registry linking research refs to instruments, features, horizons, required data, costs, and failure modes;
- statuses for accepted, rejected, blocked, deferred, and promoted hypotheses.

Acceptance:

- research notes create testable hypotheses, not direct trade instructions;
- every strategy variant cites a hypothesis id and research refs;
- self-funded capital backlog starts from liquid trend, defensive allocation, momentum, daily-return, and cost-aware baselines.

## Phase 4: Data, Vintage, And Feature Store

Deliver:

- point-in-time raw evidence archive with `eventTime`, `publishedAt`, `retrievedAt`, `availableAt`, source hash, and parser version;
- vintage-data versioning for revised macro, fundamental, filing, estimate, index membership, and edited text sources;
- source-specific blockers for unknown vintage or insufficient availability data;
- broad research universe profiles separate from the current theme universe.

Acceptance:

- replay can prove what the strategy could know at decision time;
- restated or unknown-vintage sources cannot pass promotion silently;
- theme-universe results are labeled separately from broad-universe results.

## Phase 5: Simple Self-Funded Capital Baselines

Deliver:

- liquid ETF trend-following baseline;
- defensive allocation or low-risk baseline;
- momentum baseline with skip-month and volatility-conditioned variants;
- daily-return numeric feature baseline;
- explicit cost, slippage, turnover, and tax-context reporting.

Acceptance:

- each baseline runs in local LEAN and QuantConnect Cloud when access allows it;
- each baseline has benchmark-relative and absolute return metrics;
- local simulator/sample-data runs cannot pass promotion gates;
- a baseline can be rejected with evidence rather than quietly discarded.

## Phase 6: Active LLM Agent Decision Ledger

Deliver:

- active agent decision records with prompt, policy, tool, and memory versions;
- typed forecasts, theses, counter-theses, invalidation conditions, risk notes,
  and action plans;
- missing-credential and stale-input blockers;
- CLI commands for `agent decide`, `agent score`, `agent shadow`, and
  `agent paper`;
- forecast labels with Brier score and log score.

Acceptance:

- LLM output cannot contain broker payloads or final order quantities;
- every decision has input/output hashes and evidence refs;
- blocked and abstained decisions are retained;
- forecast scoring separates probability quality from trading PnL;
- risk-gated active-agent action hints produce shadow and paper-order-plan
  artifacts without broker writes;
- active LLM agent evidence is reported separately from historical backtests.

## Phase 7: LLM-Derived Feature Feed And Ablations

Deliver:

- raw text ingestion for selected news, filing, macro, and research sources;
- LLM feature schema and validator;
- point-in-time archive with `availableAt`;
- Object Store or custom-data export;
- replay fixture for LEAN;
- numeric-only, LLM-only, and combined ablation support.

Acceptance:

- LLM features can be generated without broker access;
- LEAN can consume timestamped LLM features;
- stale/future LLM features are rejected;
- LLM-derived features are compared against simple baselines;
- LLM-derived research hypotheses are labeled separately from executable alpha evidence.

## Phase 8: Meta Alpha, Insight Adapter, And Cloud Promotion

Renumbered long-term phase: this follows active agent and feature-feed work.

Deliver:

- meta-alpha combiner;
- disagreement and abstain rules;
- final `AlphaDecision` store;
- LEAN Insight adapter;
- run-level feature, prompt, model, data-vintage, and parameter manifests;
- QuantConnect Cloud compile/backtest/import loop;
- manual Web IDE Cloud result import by project id and backtest id;
- parallel Cloud artifact page imports.

Acceptance:

- combined alpha emits LEAN Insights;
- decisions are replayable by symbol and horizon;
- every decision has evidence refs and hashes;
- baseline, LLM, and combined variants can be compared without multiple-testing bias;
- Cloud command success is blocked until real Cloud result artifacts are imported and pass evidence gates.

## Phase 9: Paper, Shadow, Agent Arena, And Learning Loop

Deliver:

- paper order bridge from LEAN targets;
- paper reconciliation;
- shadow trading mode that records proposed trades without broker writes;
- prospective paper/shadow arena for active LLM agent variants;
- active-agent paper order-plan bridge through the existing paper execution and
  reconciliation ledgers;
- result labels by horizon;
- forecast scoring and calibration reports;
- feature/decision outcome joins;
- model and prompt performance tracking;
- failure review workflow;
- promotion/rejection ledger.

Acceptance:

- one full paper cycle runs from alpha decision to fill ledger;
- shadow trading produces current would-have-traded evidence;
- active LLM agent variants produce current prospective decision, paper/shadow,
  and label evidence;
- historical paper replay is separated from current readiness;
- kill switch and reconciliation mismatches block new exposure;
- promotion decisions require Cloud plus current paper trading/shadow trading evidence.

## Phase 10: Oracle Cloud ARM Always-On Control Plane

Deliver:

- deployment runbook for Oracle Cloud ARM;
- scheduler for corpus refresh, data ingest, feature generation, LLM jobs, ablations, imports, paper trading/shadow trading, reconciliation, and alerts;
- credential boundary checks;
- cost controls for LLM, QuantConnect, data providers, and storage;
- health checks and failure reports.

Acceptance:

- the system can run continuously without broad manual babysitting;
- missed schedules, stale data, failed imports, and reconciliation mismatches create blocked evidence and alerts;
- Oracle Cloud ARM does not introduce broker writes before the broker-write implementation spec.

## Phase 11: Broker-Read-Only Reconciliation

Deliver:

- user-approved broker candidate for read-only work;
- account snapshot, positions, open orders, fills, cash, buying power, and fees read models;
- append-only account, position, reservation, order, fill, fee, and tax-lot ledgers;
- reconciliation between paper trading/shadow trading expected state and broker read-only observed state where applicable.

Acceptance:

- no write method exists in this phase;
- unknown broker state is blocked;
- broker credentials never enter LLM prompts, frontend state, logs, or research artifacts;
- reconciliation mismatches block broker-write readiness.

## Phase 12: Self-Funded Capital Broker-Write Spec And Adapter

Deliver:

- user-approved broker choice and account assumptions;
- exact allowed write methods;
- maximum notional, loss limits, position caps, and kill-switch behavior;
- cancel/flatten drills;
- broker credential boundary;
- broker schema verification;
- reconciliation failure handling;
- deployment and rollback runbook.

Acceptance:

- pre-trade risk check fails closed for unknown, stale, mismatched, or unsupported state;
- paper trading/shadow trading evidence maps to broker-specific order semantics;
- at least one blocked/failure case is tested for every write-like method;
- no LLM, frontend, log, or research artifact sees broker credentials or raw account identifiers.

This phase approves implementation only when the user explicitly approves the broker-write spec. It is not approved by earlier phases alone.

## Phase 13: Darwinex/Zero Track-Record Path

Deliver:

- Darwinex/Zero account, jurisdiction, subscription, and terms verification;
- instrument mapping between the approved self-funded capital strategy and Darwinex/Zero-supported instruments;
- MetaTrader 4/5 or API bridge design for the Oracle control plane;
- signal-to-order mapping that respects our risk gates and Darwinex execution semantics;
- Darwinex Risk Engine reporting separate from our portfolio targets;
- track-record import or reconciliation;
- performance-fee evidence import when allocated-capital profit exists.

Acceptance:

- self-funded capital deployment-grade strategy validation artifacts already exists;
- the project can show which signal was executed, through which Darwinex/Zero instrument, under which costs and market hours;
- Darwinex sizing/risk standardization is reported separately from our intended target;
- performance-fee claims come from Darwinex/Zero evidence, not from QuantConnect backtests.

## Phase 14: Operational Review And Capital Scaling

Deliver:

- recurring promotion review;
- drawdown and risk-budget reports;
- strategy retirement rules;
- tax-context reporting for the operator;
- capital allocation changes with explicit approvals.

Acceptance:

- failed, flat, blocked, and winning decisions are retained;
- scaling decisions cite evidence;
- changes to capital limits, leverage, derivatives, shorts, or asset classes require explicit user approval and spec updates.
