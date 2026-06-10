# Lincei Quant Research Engine

Status: active self-funded capital-first QuantConnect/LEAN + active LLM agent evaluation system.

Last aligned: 2026-06-02.

Lincei is a personal autonomous alpha system whose first monetization goal is
self-funded capital allocation: running continuously, researching strategies,
recording active LLM investment committee decisions, evaluating those decisions
prospectively through paper trading/shadow trading, and eventually trading the
operator's own pre-funded capital only after promotion evidence, pre-trade risk
checks, and reconciliation gates pass.

Darwinex/Zero is a later monetization path. It should not drive the first architecture. A Darwinex/Zero track record is useful only after the self-funded capital loop can produce a defensible signal and execution record.

Read [SPEC.md](SPEC.md) first. It is the canonical active spec index. If another document conflicts with `SPEC.md`, `SPEC.md` wins.

## Direction

- Self-funded capital allocation is the priority.
- QuantConnect Cloud and LEAN remain the strategy validation/runtime foundation
  for numeric/ML baselines, historical replay, and custom-data sanity checks.
- The Oracle Cloud ARM server is the intended always-on control plane for scheduling research, data, feature, ablation, import, paper trading/shadow trading, reconciliation, and alert jobs.
- LLMs can act as an investment committee that emits typed forecasts, theses,
  counter-theses, invalidation conditions, risk notes, and action plans.
- LLMs are not broker operators and do not own final order quantities.
- Parallelization is expected before promotion: corpus ingest, hypothesis extraction, data ingest, feature jobs, LLM jobs, ablations, backtests, and Cloud artifact imports should run concurrently where safe.
- Execution-like work is single-writer: promotion, portfolio target consolidation, deterministic risk gates, paper trading/shadow trading intent, reconciliation, and broker-write pre-trade risk checks must have one canonical state.
- Real broker writes remain blocked until a separate broker-write implementation spec is approved.

## Core Hypothesis

The project hypothesis is:

> A point-in-time parallel research pipeline that combines durable numeric baselines, ML features, and LLM-derived features can produce after-cost, benchmark-relative returns that survive QuantConnect Cloud validation, current paper trading/shadow trading artifacts, reconciliation, and later self-funded capital execution.

For active LLM strategies, this backtest-first hypothesis is no longer enough.
The active project hypothesis is:

> Numeric/ML baselines should remain backtestable, while active LLM investment
> committee variants should be evaluated mainly through prospective paper/shadow
> decision ledgers, forecast scoring, risk-gated action plans, reconciliation,
> and a later capital staircase.

The Alpha Architect corpus review changes the near-term priority:

1. Prove simple liquid baselines first: trend following, defensive allocation, momentum, daily-return features, and cost-aware rebalancing.
2. Evaluate active LLM decisions as forecasts and action plans, not as direct
   broker orders.
3. Keep LLM-derived features as one useful mode, but do not limit the project to
   feature extraction.
4. Treat factor crowding, factor valuation, macro regimes, index effects, and
   filing language as research hypotheses that need broader data and vintage
   controls.
5. Revisit Darwinex/Zero after the self-funded capital deployment-grade track
   record exists.

## System Flow

```mermaid
flowchart TB
    subgraph PAR["Parallel research pipeline"]
        CORPUS["Research corpus<br/>articles / papers / notes"]
        HYP["Hypothesis registry"]
        DATA["Market / news / filing / macro ingest"]
        FEAT["Feature jobs<br/>symbol / source / window"]
        LLM["LLM-derived feature jobs"]
        AGENT["Active LLM agent decisions"]
        ABL["Ablations<br/>numeric / LLM / combined"]
        BT["Baseline backtests<br/>episode replay"]
        CLOUD["QuantConnect Cloud imports"]
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
    SIM --> PREFLIGHT["Broker-write pre-trade risk check<br/>blocked until approved spec"]
```

Parallel jobs improve research throughput. They do not create multiple execution truths. The system can evaluate many hypotheses at once, but only one consolidated target set can advance toward execution evidence for a given strategy/account/time.

## Evidence Ladder

```mermaid
stateDiagram-v2
    [*] --> Hypothesis: research corpus
    Hypothesis --> Baseline: simple numeric strategy
    Baseline --> AgentDecision: active LLM decision ledger
    AgentDecision --> ForecastScore: prospective forecast scoring
    Baseline --> Ablation: numeric / LLM / combined
    Ablation --> LocalLEAN: local LEAN debug and episode replay
    LocalLEAN --> CloudImport: QuantConnect Cloud backtest/import
    ForecastScore --> PaperShadow: current paper trading/shadow trading
    CloudImport --> PaperShadow
    PaperShadow --> Reconciliation: intended vs observed state
    Reconciliation --> SimulatedBroker: broker contract rehearsal
    SimulatedBroker --> PromotionReview: cost, slippage, tax, bias checks
    PromotionReview --> OwnCapitalCandidate: broker-read-only then write spec
    PromotionReview --> Rejected: failed or overfit evidence
    OwnCapitalCandidate --> DarwinexCandidate: later track-record path
```

Promotion requires direct supporting evidence. Unit tests protect schemas and API contracts, but they do not prove strategy performance or broker-write readiness.

## Research Corpus

The repo stores an initial Alpha Architect corpus for strategy research:

- [references/alphaarchitect/README.md](references/alphaarchitect/README.md)
- [references/alphaarchitect/index.json](references/alphaarchitect/index.json)
- [references/alphaarchitect/strategy-register.md](references/alphaarchitect/strategy-register.md)
- [docs/own-capital-alphaarchitect-corpus-review.md](docs/own-capital-alphaarchitect-corpus-review.md)

The corpus contains 40 sourced articles with metadata and content hashes. It is a hypothesis library, not trading evidence. A stored article becomes useful only after it is mapped to point-in-time data, implemented as a LEAN strategy or feature, and validated through the evidence ladder.

## Current Architecture

| Layer                    | Role                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Research corpus          | Stores articles, papers, source metadata, content hashes, and hypothesis candidates.                                      |
| Hypothesis registry      | Converts research into testable strategy variants and failure modes.                                                      |
| Feature store            | Preserves point-in-time and vintage features with `availableAt`, source refs, and hashes.                                 |
| LLM-derived features     | Extracts structured features from text evidence; never emits broker instructions.                                         |
| Active LLM agent         | Emits typed forecasts, theses, invalidation conditions, risk notes, and action plans for prospective evaluation.          |
| Numeric/ML alpha         | Provides simple baselines and model features for ablation.                                                                |
| LEAN / QuantConnect      | Owns strategy runtime semantics: `Insight`, portfolio construction, risk, execution in approved modes.                    |
| Control plane            | Orchestrates jobs, imports artifacts, records ledgers, reconciliation, pre-trade risk checks, and dashboard state.        |
| Broker boundary          | Read-only and pre-trade risk checks first; broker writes require a future approved spec.                                  |
| Simulated broker adapter | Replays paper state into broker-like snapshots, order statuses, and fill reports for contract/reconciliation checks only. |

## Repository Map

| Path                                                                                                 | Purpose                                                      |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [SPEC.md](SPEC.md)                                                                                   | Canonical active spec index                                  |
| [AGENTS.md](AGENTS.md)                                                                               | Agent/contributor rules                                      |
| [terminology.md](terminology.md)                                                                     | Canonical terms                                              |
| [docs/spec/](docs/spec)                                                                              | Normative split spec                                         |
| [docs/own-capital-alphaarchitect-corpus-review.md](docs/own-capital-alphaarchitect-corpus-review.md) | Self-funded capital architecture review from research corpus |
| [docs/active-llm-agent-restructure-plan.md](docs/active-llm-agent-restructure-plan.md)               | Active LLM agent restructure implementation plan             |
| [references/alphaarchitect/](references/alphaarchitect)                                              | Stored Alpha Architect article corpus and strategy register  |
| [config/universes/](config/universes)                                                                | Universe manifests and caps                                  |
| [backend/](backend)                                                                                  | NestJS control plane and ledgers                             |
| [engines/lean/aggressive_llm_momentum/](engines/lean/aggressive_llm_momentum)                        | LEAN Algorithm Framework strategy                            |
| [ml/](ml)                                                                                            | Offline feature/model helpers                                |
| [frontend/](frontend)                                                                                | Operational dashboard                                        |
| [scripts/](scripts)                                                                                  | Operator command wrappers                                    |

## Implementation Status

Implemented in the current implementation:

- durable research hypothesis registry and parallel research job ledger;
- Alpha Architect corpus-to-hypothesis ingestion script with idempotent job records;
- multiple-testing bias promotion check that blocks when only winning/no variant evidence exists;
- point-in-time text evidence ingestion, including Hugging Face FOMC evidence;
- QuantConnect Cloud project/backtest listing and manual Cloud backtest import;
- paginated Cloud insights/orders import with Cloud id preservation;
- paper replay separated from current paper trading/shadow trading readiness;
- backtest-cycle dashboard;
- first-class broker read-only status, polling, manual file import, fill-polling, and reconciliation commands through `lincei broker ...`;
- simulated broker rehearsal command that validates broker-like fill/snapshot reconciliation from a paper order-plan;
- active LLM agent decision, evaluation-run, and forecast-label ledgers;
- `lincei agent decide`, `lincei agent score`, `lincei agent shadow`, `lincei agent paper`, and `lincei agent status` commands;
- deterministic risk-gated active-agent shadow records and paper order-plan/reconciliation records with broker writes disabled;
- simulated broker snapshot, order-status, and fill-report rehearsal remains separate from real broker readiness;
- Alpha Architect corpus with 40 sourced articles and self-funded capital strategy review;
- long-term specs for self-funded capital priority, Darwinex/Zero deferral, and parallel research pipeline.

Not implemented yet:

- broad research universe profiles separate from the current theme universe;
- complete vintage-data store for restatable sources;
- simple trend/momentum/daily-return baselines with promotion evidence;
- provider API-backed broker-read-only polling and reconciliation;
- calibration dashboards and long-horizon prospective agent reports;
- configured active LLM promotion thresholds after enough prospective labels exist;
- broker-write adapter;
- Darwinex/Zero execution or track-record adapter.

## Setup

`git clone` alone is not enough. Secrets, local data, LEAN workspace state, generated artifacts, and SQLite databases are intentionally gitignored.

Prerequisites:

| Tool                                   | Used for                                       |
| -------------------------------------- | ---------------------------------------------- |
| Bun                                    | Backend, frontend, CLI wrappers                |
| Python 3.10+                           | ML helpers and Lean CLI venv                   |
| Docker or Podman-compatible Docker CLI | Local LEAN container runs                      |
| QuantConnect account/API token         | Cloud backtests, workspace setup, Object Store |
| OpenAI-compatible API key              | LLM-derived features                           |
| Oracle Cloud ARM host                  | Optional always-on control plane target        |

Bootstrap:

```bash
git clone <repository-url>
cd lincei-quant-research-engine
cp .env.example .env

# Fill QUANTCONNECT_USER_ID, QUANTCONNECT_API_TOKEN, OPENAI_API_KEY as needed.
./scripts/bootstrap-dev.sh
```

## Command Cheat Sheet

Run from repository root unless noted.

```bash
# Primary capital evidence loop
bun --cwd=backend run lincei -- capital run --max-backtest-workers 1 --json
bun --cwd=backend run lincei -- capital status --json

# Research and text evidence
bun --cwd=backend run lincei -- research corpus
bun --cwd=backend run lincei -- research selected-run-bias
bun --cwd=backend run lincei -- data semantic-evidence --limit 80
bun --cwd=backend run lincei -- alpha run

# Active LLM agent prospective evaluation
bun --cwd=backend run lincei -- agent decide --json
bun --cwd=backend run lincei -- agent decide --mode historical-episode-replay --symbols SPY,QQQ --horizon-hours 120 --json
bun --cwd=backend run lincei -- agent score --json
bun --cwd=backend run lincei -- agent shadow --json
bun --cwd=backend run lincei -- agent paper --json
bun --cwd=backend run lincei -- agent status --json

# Local LEAN and import
bun --cwd=backend run lincei -- lean backtest aggressive_llm_momentum
bun --cwd=backend run lincei -- lean import latest
./scripts/run-local-strategy-smoke
./scripts/verify-lean-cloud-package aggressive_llm_momentum

# QuantConnect Cloud
bun --cwd=backend run lincei -- qc list-projects
bun --cwd=backend run lincei -- qc list-backtests --project-id <project-id> --limit 10
bun --cwd=backend run lincei -- qc import-backtest --project-id <project-id> --backtest-id <backtest-id>
bun --cwd=backend run lincei -- qc cloud-backtest aggressive_llm_momentum
./scripts/qc-cloud-push aggressive_llm_momentum

# Paper trading, shadow trading, learning, broker-write pre-trade risk check
bun --cwd=backend run lincei -- paper run
bun --cwd=backend run lincei -- paper replay
bun --cwd=backend run lincei -- shadow run
bun --cwd=backend run lincei -- learning run
bun --cwd=backend run lincei -- preflight run

# Broker read-only observation before any broker writes
bun --cwd=backend run lincei -- broker status --json
bun --cwd=backend run lincei -- broker list-accounts --json
bun --cwd=backend run lincei -- broker simulate-paper-plan --json
bun --cwd=backend run lincei -- broker poll-read-only --json
bun --cwd=backend run lincei -- broker poll-fills --json
bun --cwd=backend run lincei -- broker import-snapshot --file /path/to/snapshot.csv --json
bun --cwd=backend run lincei -- broker import-fills --file /path/to/fills.csv --json
bun --cwd=backend run lincei -- broker reconcile-snapshot --json
```

Toss Securities Open API docs are managed as a source index, not vendored
copies. Start with [docs/toss-openapi-source-index.md](docs/toss-openapi-source-index.md)
and fetch the official OpenAPI docs before changing the adapter. Minimal
read-only env:

```text
BROKER_READ_ONLY_ENABLED=true
TOSS_READ_ONLY_POLLER_ENABLED=true
TOSS_OPEN_API_CLIENT_ID=...
TOSS_OPEN_API_CLIENT_SECRET=...
TOSS_OPEN_API_ACCOUNT_SEQ=...
TOSS_OPEN_API_SCHEMA_VERIFIED=true
```

If `TOSS_OPEN_API_ACCOUNT_SEQ` is unknown, set only `TOSS_OPEN_API_CLIENT_ID`
and `TOSS_OPEN_API_CLIENT_SECRET`, then run:

```bash
bun --cwd=backend run lincei -- broker list-accounts --json
```

The command calls only token/account-list endpoints, masks account numbers, and
does not import a broker snapshot or submit orders.

Open-order status and partial-fill observation additionally requires:

```text
TOSS_READ_ONLY_FILL_POLLER_ENABLED=true
TOSS_OPEN_API_FILL_SCHEMA_VERIFIED=true
```

Manual broker snapshot CSV columns:

```text
asOf,currency,cash,equity,symbol,assetClass,quantity,marketValue,weightPct,averagePrice
```

Manual broker fills CSV columns:

```text
brokerFillRef,filledAt,symbol,side,quantity,fillPrice,fee,currency
```

Manual imports are read-only evidence. They never claim provider API readiness and never submit broker orders.

The old `./scripts/*` operational wrappers are compatibility surfaces during migration; new operator commands should go through `lincei`.

Exit code `2` means a policy/account/platform `blocked` result, not necessarily a crash. Examples include missing QuantConnect Cloud credentials, account-tier blockers, missing current paper trading/shadow trading artifacts, stale targets, data-license blockers, or broker-write pre-trade risk check blockers.

## Verification

Use the narrowest command that proves the touched surface:

```bash
git diff --check

cd backend && bun run build
cd backend && bun run test

cd frontend && bun run typecheck
cd frontend && bun run build
cd frontend && bun run test:run

.venv-ml/bin/python -m pytest engines/lean/aggressive_llm_momentum/tests
./scripts/verify-lean-cloud-package aggressive_llm_momentum
./scripts/run-local-strategy-smoke
./scripts/run-cloud-quality-backtest
./scripts/run-paper-cycle
./scripts/run-live-shadow
./scripts/run-learning-loop
./scripts/live-preflight
```

Final reports must separate unit-test evidence, local LEAN evidence, QuantConnect Cloud artifacts, active LLM agent decisions, forecast labels, paper trading/shadow trading evidence, reconciliation evidence, and blockers.

## Key Rule

Build the self-funded capital loop before anything else:

```text
hypothesis -> baseline -> active agent decision ledger -> forecast scoring -> paper/shadow arena -> reconciliation -> broker-read-only -> broker-write spec
```

Everything else is supporting infrastructure.
