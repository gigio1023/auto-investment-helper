# Lincei Quant Research Engine Specification

Status: active long-term specification.

Last aligned: 2026-06-01.

## Spec Authority

This file is the canonical index for the active project specification. Documents linked from this file are normative unless they are explicitly marked supporting, archived, or historical.

Older dated handoffs, prompts, review notes, and archived plans are historical context only. They cannot override this spec.

The 2026-05-27 direction change approves the long-term objective of self-funded capital allocation and later Darwinex/Zero monetization. It does not approve immediate broker writes, exact capital limits, leverage, derivatives, shorts, margin, or any broker/Darwinex adapter implementation. Those still require the dedicated specs and gates named below.

## Current Direction Lock

The first monetization priority is self-funded capital allocation: the operator wants this system to run continuously, research strategies, validate hypotheses, and eventually trade the operator's own pre-funded capital only after promotion evidence, pre-trade risk checks, and reconciliation gates pass.

Darwinex/Zero is a second-order path. It matters only after the self-funded capital deployment-grade signal and track record exist. The repository must not prioritize Darwinex adapter work ahead of the self-funded capital evidence loop.

The current milestone is still not automatic production/live trading. It is the
validated capital-allocation loop, now centered on prospective LLM agent
evaluation instead of treating historical backtests as the final proof:

```text
research corpus
  -> hypothesis registry
  -> point-in-time and vintage data
  -> numeric/ML baselines and selected historical backtests
  -> active LLM agent decision ledger
  -> prospective paper/shadow agent evaluation
  -> forecast scoring and risk-gated action review
  -> LEAN / QuantConnect validation for baselines, replay, and sanity checks
  -> portfolio and risk consolidation
  -> reconciliation
  -> simulated broker adapter rehearsal
  -> learning and promotion ledger
  -> self-funded capital broker-write candidate
```

Real-money broker writes are long-term in scope but blocked in the current milestone. Any path that can submit, cancel, replace, flatten, transfer, or mutate margin/account settings needs a user-approved broker-write implementation spec before implementation.

## Core Product Thesis

The project hypothesis is:

> A point-in-time parallel research pipeline that combines simple numeric baselines, ML features, and LLM-derived features can produce after-cost, benchmark-relative returns that survive QuantConnect Cloud validation, current paper trading/shadow trading artifacts, reconciliation, and later self-funded capital execution.

That historical-backtest-first hypothesis is superseded for active LLM work.
The active hypothesis is now:

> Classical numeric/ML baselines should remain backtestable, but an active LLM
> investment committee should be evaluated mainly through prospective
> paper/shadow decision ledgers, forecast scoring, risk-gated action plans, and
> capital-staircase promotion. Historical backtests remain useful as baseline,
> replay, and failure-discovery tools, not as the sole proof of LLM-agent
> profitability.

The Alpha Architect corpus review still tightens the priority:

1. Start with robust, boring baselines: liquid ETF trend following, defensive allocation, momentum, daily-return features, and cost-aware rebalancing.
2. Use LLMs actively as an investment committee that emits typed forecasts,
   theses, counter-theses, invalidation conditions, and action plans.
3. Keep final sizing, deterministic risk gates, execution intent, broker writes, and
   reconciliation outside the LLM boundary.
4. Treat factor crowding, factor valuation, anomaly demand, macro regimes, and
   filing language as research hypotheses that need broader data and vintage
   controls before promotion.
5. Keep Darwinex/Zero deferred until the self-funded capital path can produce
   an independently defensible track record.

## Parallelization Principle

Maximize safe parallelism everywhere before portfolio/risk consolidation:

```text
research article ingestion
  || hypothesis extraction
  || market/news/filing/macro ingestion
  || per-symbol feature generation
  || LLM-derived feature jobs
  || active LLM agent decisions for independent symbols/episodes
  || numeric-only / LLM-only / combined ablations
  || parameter and backtest sweeps
  || QuantConnect Cloud artifact page imports
```

Then force a single canonical path:

```text
promotion ledger
  -> portfolio target consolidation
  -> deterministic risk gate
  -> paper trading/shadow trading execution intent
  -> reconciliation
  -> broker-write pre-trade risk check
```

Parallel work must be bounded, idempotent, and replayable. Every job needs a run id, input hash, output hash, status, retry policy, cost record when applicable, and blocker reason. Failed, flat, blocked, and losing runs are part of the evidence set.

## Required Reading

Read these documents in order before changing core behavior:

1. [Direction And Change Control](docs/spec/00-direction-and-change-control.md): product direction, approval rules, non-goals, and subscription posture.
2. [Terminology](terminology.md): canonical engineering and quant terms.
3. [QuantConnect And LEAN Runtime](docs/spec/01-quantconnect-lean-runtime.md): role split between LEAN, QuantConnect Cloud, local LEAN, and the repo control plane.
4. [LLM Semantic Alpha Engine](docs/spec/02-llm-semantic-alpha-engine.md): LLM permissions, LLM-derived feature schemas, and semantic alpha signal rules.
5. [Data Sources And Feature Store](docs/spec/03-data-sources-and-feature-store.md): point-in-time, vintage, raw evidence, and feature schemas.
6. [Risk, Execution, And Broker Boundary](docs/spec/04-risk-execution-and-broker-boundary.md): portfolio/risk/execution boundary and fail-closed broker rules.
7. [Testing And Verification Policy](docs/spec/05-testing-and-verification.md): direct execution evidence and failure-case requirements.
8. [Implementation Roadmap](docs/spec/06-implementation-roadmap.md): current phase sequence and acceptance criteria.
9. [References](docs/spec/07-references.md): official platform docs and research sources.
10. [Quality-Gated Universe](docs/spec/08-quality-gated-universe.md): active universe policy and caps.
11. [Dual Monetization And Operations](docs/spec/09-dual-monetization-and-operations.md): self-funded capital priority, Oracle Cloud ARM operations, Darwinex/Zero posture, strategy corpus, and vintage-data rules.
12. [Parallel Research Pipeline](docs/spec/10-parallel-research-factory.md): parallel job boundaries, idempotency, multiple-testing bias controls, and single-writer execution gates.
13. [Full Implementation Plan](docs/spec/11-full-implementation-plan.md): workstreams, dependencies, acceptance criteria, and verification evidence needed to complete the full spec.
14. [Active LLM Agent Evaluation](docs/spec/12-active-llm-agent-evaluation.md): prospective agent arena, forecast scoring, historical episode replay, and capital-staircase promotion.

Supporting docs:

- [Self-Funded Capital Architecture Review From Alpha Architect Corpus](docs/own-capital-alphaarchitect-corpus-review.md)
- [Alpha Architect Strategy Register](references/alphaarchitect/strategy-register.md)
- [Research References](docs/research-references.md)
- [LEAN and QuantConnect Engine](docs/lean-quantconnect-engine.md)
- [Alpha Model Design](docs/alpha-model-design.md)
- [LLM Alpha Committee](docs/llm-alpha-committee.md)
- [QuantConnect Realignment Decision](docs/decisions/2026-05-24-quantconnect-realignment.md)

## System Shape

```mermaid
flowchart TB
    subgraph PAR["Parallel research and evidence jobs"]
        CORPUS["Research corpus<br/>Alpha Architect and papers"]
        HYP["Hypothesis extraction"]
        DATA["Market/news/filing/macro ingest"]
        FEAT["Per-symbol feature jobs"]
        LLM["LLM-derived feature jobs"]
        AGENT["Active LLM agent decisions"]
        ABL["Ablations<br/>numeric / LLM / combined"]
        BT["Baseline backtests<br/>episode replay"]
        CLOUD["Cloud artifact imports"]
    end

    CORPUS --> HYP
    DATA --> FEAT
    HYP --> ABL
    FEAT --> ABL
    LLM --> ABL
    FEAT --> AGENT
    HYP --> AGENT
    ABL --> BT
    BT --> CLOUD

    AGENT --> PLAN["Action-plan candidate<br/>no broker payload"]
    CLOUD --> LEDGER["Capital allocation ledger<br/>all variants retained"]
    SCORE --> LEDGER
    LEDGER --> TARGET["Portfolio targets"]
    TARGET --> RISK["Deterministic risk gate"]
    PLAN --> RISK
    RISK --> ARENA["Prospective paper/shadow arena"]
    ARENA --> SCORE["Forecast scoring<br/>Brier / log / calibration"]
    RISK --> PAPER["Paper trading/shadow trading intent"]
    PAPER --> RECON["Reconciliation"]
    RECON --> SIM["Simulated broker adapter rehearsal<br/>contract only"]
    SIM --> PREFLIGHT["Broker-write pre-trade risk check<br/>blocked until spec"]
```

The control plane orchestrates jobs, persists validation artifacts, and enforces
promotion policy. LEAN owns strategy runtime semantics for backtestable
baselines and replay. LLMs can produce typed LLM-derived features and active
agent decisions, but only as forecasts, theses, risk notes, and action plans.
They do not own final order quantity, broker payloads, credentials, or
account mutation. Broker-write paths remain blocked until a user-approved
broker-write implementation spec exists.

## Implementation Plan Index

The full implementation plan lives in [Full Implementation Plan](docs/spec/11-full-implementation-plan.md). `SPEC.md` intentionally stays thin: it states direction, core schemas, and gates; detailed workstreams, dependencies, acceptance criteria, and verification commands belong under `docs/spec/`.

Implementation priority:

```text
parallel research pipeline
  -> data/vintage foundation
  -> simple baselines
  -> active LLM agent decision ledger
  -> prospective paper/shadow agent evaluation
  -> forecast scoring and calibration
  -> LLM-derived feature ablations and historical episode replay
  -> QuantConnect Cloud artifacts for backtestable paths
  -> reconciliation
  -> simulated broker adapter rehearsal
  -> Oracle Cloud ARM continuous operation
  -> broker-read-only reconciliation
  -> user-approved broker-write spec
  -> self-funded capital allocation
  -> later Darwinex/Zero track-record path
```

## Core Schemas

Every alpha source must produce typed output rather than free-form trade text:

```ts
type AlphaDecision = {
  symbol: string;
  asOf: string;
  availableAt: string;
  horizonHours: number;
  direction: "up" | "down" | "flat";
  expectedReturnBps?: number;
  confidence: number;
  conviction: "low" | "medium" | "high";
  maxPositionPct?: number;
  eventType?: string;
  catalystStrength?: number;
  downsideRisk?: number;
  sourceModels: string[];
  promptVersion?: string;
  featureSnapshotHash: string;
  evidenceRefs: string[];
  thesis?: string;
  counterThesis?: string;
  abstainReason?: string;
};
```

Active LLM agent decisions are separate from LEAN `AlphaDecision` records:

```ts
type AgentDecisionRecord = {
  id: string;
  runId: string;
  strategyVariant: string;
  agentId: string;
  symbol: string;
  asOf: string;
  availableAt: string;
  horizonHours: number;
  status: "proposed" | "abstained" | "blocked";
  direction: "up" | "down" | "flat";
  forecastProbabilityUp: number;
  expectedReturnBps?: number;
  confidence: number;
  thesis?: string;
  counterThesis?: string;
  invalidationCondition?: string;
  proposedAction: Record<string, unknown>;
  riskNotes: string[];
  sourceSnapshotRefs: string[];
  evidenceRefs: string[];
  model: string;
  promptVersion: string;
  policyVersion: string;
  toolPolicyVersion: string;
  memoryPolicyVersion: string;
  inputHash: string;
  outputHash: string;
  blockerReasons: string[];
};
```

`evidenceRefs` remains a legacy persistence field for compatibility. New
schemas should prefer `sourceRefs`, `sourceSnapshotRefs`, or
`supportingEvidenceRefs` unless they are matching an existing database column.

Parallel jobs must use a comparable job schema:

```ts
type ResearchJobRecord = {
  jobId: string;
  runId: string;
  jobType:
    | "corpus-ingest"
    | "hypothesis-extraction"
    | "data-ingest"
    | "feature-generation"
    | "llm-semantic-feature"
    | "ablation"
    | "backtest"
    | "cloud-import"
    | "promotion-check";
  partitionKey: string;
  inputRefs: string[];
  inputHash: string;
  outputRefs: string[];
  outputHash?: string;
  startedAt: string;
  completedAt?: string;
  status: "passed" | "failed" | "blocked";
  retryOf?: string;
  costRef?: string;
  blockerReasons: string[];
};
```

LEAN converts approved alpha decisions into `Insight` objects. Portfolio construction and risk models determine final target weights. LLMs may influence confidence, direction, horizon, catalyst strength, and risk flags, but they do not own final order quantity.

## Required Runtime Paths

Fast path:

- numeric and precomputed alpha only;
- no fresh LLM calls;
- used for stop-loss, stale-data blocks, de-risking, and validated rule execution;
- expected latency: seconds;
- can read parallel-produced feature artifacts, but must not wait on fresh research jobs.

Slow path:

- numeric features plus LLM-derived alpha;
- active LLM agent decisions for paper/shadow evaluation;
- uses recent news, filings, macro context, portfolio state, and bull/bear review;
- used for new positions, concentration changes, strategy selection, and event-driven trades;
- expected latency: one to several minutes;
- parallelizable across symbols/events, then consolidated through one promotion/risk path.

Research path:

- strategy creation, corpus extraction, model training, walk-forward validation,
  cloud backtests, ablations, historical episode replay, active LLM agent
  evaluation, and failure review;
- expected latency: minutes to hours;
- should maximize bounded parallelism while recording all variants, including failures.

## Verification Summary

Testing is important, but unit tests are not the project goal. Runtime claims
require direct commands and artifacts: LEAN backtests, QuantConnect Cloud
backtests/imports where relevant, alpha replay, active LLM agent decision
ledgers, forecast labels, paper trading/shadow trading cycles, pre-trade risk
checks, and reconciliation.

Self-funded capital promotion reports must include:

- hypothesis id and research refs;
- data vintage and point-in-time status;
- numeric-only, LLM-only, active-agent, and combined ablations where applicable;
- forecast scoring, calibration, abstain, blocked, and risk-veto counts for
  active LLM agent variants;
- benchmark-relative and absolute returns;
- after-cost and tax-context assumptions;
- drawdown, volatility, turnover, liquidity, and slippage;
- multiple-testing bias check;
- current paper trading/shadow trading and reconciliation evidence;
- exact blockers.

## Non-Goals

- automatic production/live trading in the current milestone;
- real broker writes without a separate user-approved broker-write implementation spec;
- HFT, market making, tick scalping, unrestricted margin, options, futures, shorts, or derivatives;
- Darwinex/Zero implementation before self-funded capital deployment-grade evidence exists;
- LLM free text directly placing broker orders;
- LLM action plans treated as final portfolio targets or broker payloads;
- local simulator, local sample data, or static fixtures treated as promotion evidence;
- hidden backtest selection or only storing winning runs;
- broker credentials in frontend, LLM prompts, logs, or research artifacts;
- UI polish that delays the alpha, backtest, paper trading/shadow trading, and reconciliation loop.

## Real-Money Readiness

Current verdict: long-term goal, not ready for broker writes.

Before any broker-write implementation spec can be approved, the repository must have:

- a hypothesis registry with accepted/rejected strategy candidates;
- point-in-time alpha decisions with no-lookahead evidence;
- at least one durable numeric baseline with Cloud and current paper
  trading/shadow trading evidence;
- prospective active LLM agent evaluation records with forecast scores and
  risk-gated action plans;
- ablation evidence showing whether LLM-derived features or active agent
  decisions improve the baseline after costs and risk vetoes;
- multiple-testing bias checks;
- cost, slippage, turnover, and tax-context reports;
- stable alpha, portfolio target, risk cut, execution intent, order, fill, and reconciliation schemas;
- explicit capital limits and kill-switch behavior;
- broker-read-only reconciliation;
- broker write adapter design reviewed separately;
- fail-closed pre-trade risk check and reconciliation tests;
- user approval for the broker-write implementation spec.

Before any Darwinex/Zero implementation spec can be approved, the repository must additionally have:

- self-funded capital deployment-grade signal evidence;
- instrument mapping between approved strategy instruments and Darwinex/Zero-supported instruments;
- a signal execution bridge design for the selected Darwinex/Zero account and platform;
- evidence that Darwinex Risk Engine behavior and fees are understood and reported separately from our portfolio target;
- track-record import or reconciliation design for DARWIN, DarwinIA, investor allocation, and performance-fee evidence.
