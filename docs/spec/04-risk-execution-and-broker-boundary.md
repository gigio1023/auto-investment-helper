# Risk, Execution, And Broker Boundary

Status: active normative spec.

## Boundary Principle

LLMs and broker write paths must not touch. The LLM can produce LLM-derived alpha and risk concerns. Deterministic portfolio, risk, execution, pre-trade risk checks, and reconciliation layers decide whether any target is executable.

Current implementation permits paper and shadow trading artifacts. The long-term spec includes self-funded capital broker writes and Darwinex/Zero monetization, but both remain blocked until adapter-specific implementation specs approve the exact methods, capital limits, credentials, deployment process, and reconciliation behavior.

Research and alpha jobs may run in parallel before promotion. Portfolio construction, risk cuts, paper trading/shadow trading execution intent, reconciliation, pre-trade risk checks, and future broker writes must remain single-writer for each account, strategy version, and evidence mode.

## Portfolio Construction

Portfolio construction converts `Insight` objects into target weights. The first production-shaped design should support:

- aggressive top-k concentration;
- volatility targeting;
- single-symbol and sector caps;
- gross and net exposure caps;
- liquidity and turnover limits;
- confidence-to-weight rules;
- abstain and disagreement handling.

LLM output may provide conviction and risk hints. Final sizing must be deterministic and replayable.

The active implementation uses the quality-gated universe manifest for symbol caps, sleeve caps, ETF flags, and blocked symbols. Portfolio construction must zero old holdings that drop out of top-k so stale positions do not persist silently.

## Risk Management

Risk models must fail closed. Unknown state is blocked state.

Required risk cuts:

- stale alpha or stale feature data;
- missing current price;
- kill switch enabled;
- exposure cap breach;
- drawdown breach;
- volatility spike;
- liquidity below threshold;
- unresolved open-order or reconciliation mismatch;
- unsupported asset class or broker capability.
- hard-excluded or disabled tactical universe symbol.

Risk code should explain the safety invariant in comments where the failure mode is not obvious.

## Execution Modes

Backtest:

- LEAN executes simulated orders inside the backtest runtime.
- Results are strategy validation artifacts only when data quality and acceptance gates pass.

Paper:

- orders mutate paper ledgers or QuantConnect paper trading only;
- evidence proves alpha-to-order plumbing and behavior under market data;
- paper fills are not proof of real broker readiness.
- a simulated broker adapter may replay paper state into broker-like snapshots,
  order statuses, and fill reports for contract and reconciliation checks only.

Live-shadow:

- the algorithm runs against live data or broker read-only state but cannot submit real orders;
- produces proposed targets, risk cuts, and would-have-traded records;
- used before any future broker-write implementation spec.

Live-money:

- long-term goal for the self-funded capital track;
- blocked in the current implementation milestone;
- requires a separate user-approved broker-write implementation spec before any real account mutation.

Darwinex/Zero:

- long-term external-capital fee path;
- consumes a validated signal and track record rather than the whole repository;
- requires a separate adapter spec for instrument mapping, platform connectivity, execution bridge, track-record import, and Darwinex Risk Engine reporting.

## Broker Boundary

Provider-neutral broker interfaces may exist for read-only and pre-trade risk check work, but write methods must remain blocked unless an approved broker-write implementation spec exists.

Provider adapters must not become the domain model. Toss Securities can be the
first concrete broker adapter, but Toss-specific endpoint names, account
headers, OAuth token handling, rate-limit behavior, and response envelopes must
stay inside the adapter. The persisted broker snapshot, order status, fill,
reconciliation, pre-trade risk check, and promotion ledgers remain
provider-neutral so another broker can replace Toss without rewriting the alpha,
paper trading/shadow trading, risk, or learning loop.

Forbidden without spec approval:

- submit;
- cancel;
- replace;
- flatten;
- transfer;
- change margin or account settings.

Allowed now:

- read account snapshot through approved credential env;
- read positions;
- read open orders;
- read fills;
- verify schema support;
- produce blocked pre-trade risk check status;
- reconcile paper trading/shadow trading evidence.
- replay reconciled paper state through a simulated broker adapter to validate
  provider-neutral broker schemas and reconciliation behavior.

The simulated broker adapter is not broker-read-only proof. It must not be
reported as provider account truth, broker-write readiness, or promotion
approval.

## Darwinex Boundary

Darwinex/Zero must be modeled as an external venue with its own semantics:

- A DARWIN may replicate the trader's timing and asset-selection signals, but Darwinex's Risk Engine can standardize and resize risk independently of the source portfolio target.
- Project portfolio targets are not the same thing as Darwinex investor exposure.
- Performance-fee evidence must be imported from Darwinex/Zero or its official reports, not inferred from QuantConnect backtests.
- Darwinex/Zero subscription cost, instrument availability, platform choice, spreads, swaps, market hours, and Risk Engine behavior are operational inputs and can change.

A Darwinex adapter must not bypass the LLM/broker boundary. LLMs may influence alpha features and risk judgments, but they must not see Darwinex credentials, generate MetaTrader payloads, or choose final order quantity.

## Reconciliation

Every execution-like path must reconcile intended state against observed state:

- intended target;
- risk-adjusted target;
- execution intent;
- order event;
- fill event;
- position;
- cash and buying power where applicable;
- blocker reasons.

Reconciliation mismatches must block new exposure until resolved.

## References

- QuantConnect Paper Trading: https://www.quantconnect.com/docs/v2/cloud-platform/live-trading/brokerages/quantconnect-paper-trading
- QuantConnect live trading risks: https://www.quantconnect.com/docs/v2/cloud-platform/live-trading/risks
- QuantConnect live reconciliation: https://www.quantconnect.com/docs/v2/cloud-platform/live-trading/reconciliation
- Algorithm Framework overview: https://www.quantconnect.com/docs/v2/writing-algorithms/algorithm-framework/overview
- Darwinex Zero DARWIN overview: https://www.darwinexzero.com/docs/en/what-is-a-darwin
- Darwinex Zero Risk Engine: https://www.darwinexzero.com/docs/en/risk-engine
- Darwinex Zero performance fees: https://www.darwinexzero.com/docs/performance-fees
