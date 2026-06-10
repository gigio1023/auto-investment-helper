# Active LLM Agent Evaluation

Status: active normative spec.

Last aligned: 2026-06-01.

## Purpose

This document defines how the project evaluates LLMs when they are more than
feature extractors.

The project may use an LLM as an active investment committee that forms
forecasts, theses, counter-theses, invalidation conditions, risk notes, and
action plans. That does not make the LLM a broker operator. Final portfolio
targets, deterministic risk gates, execution intent, broker payloads, and
reconciliation remain deterministic and single-writer.

## Direction

Active LLM strategies are treated as `live-evaluated strategy` candidates.
Historical backtests remain useful, but they are no longer the primary proof for
active LLM profitability.

```text
current point-in-time snapshot
  -> active LLM agent decision
  -> deterministic risk gate
  -> paper trading/shadow trading arena
  -> realized outcome label
  -> forecast scoring and action review
  -> promotion, rejection, or capital-staircase hold
```

Backtests serve four narrower jobs:

1. validate numeric/ML baselines;
2. check LEAN/custom-data/replay plumbing;
3. run selected historical episode replay;
4. reject obviously unsafe or unstable variants before forward evaluation.

Backtests alone cannot promote an active LLM agent to self-funded capital.

## Evaluation Modes

| Mode                        | Purpose                                                                                     | Promotion Weight                                             |
| --------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `baseline backtest`         | Validate numeric/ML strategies and costs in LEAN/QuantConnect.                              | Required comparator, not sufficient for LLM-agent promotion. |
| `historical episode replay` | Replay selected events such as FOMC, CPI surprises, crashes, rallies, and sector rotations. | Behavior audit and failure discovery.                        |
| `prospective paper arena`   | Run agent variants on current market data with paper-account semantics.                     | Primary LLM-agent evaluation evidence.                       |
| `shadow trading arena`      | Record would-have-traded intent without broker writes.                                      | Required before broker-write spec work.                      |
| `capital staircase`         | Staged approved self-funded capital allocation after explicit broker-write approval.        | Future real-capital promotion path.                          |

## Active Agent Decision Contract

Every active LLM decision must be persisted before any downstream risk or paper
action can consume it.

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

`proposedAction` may contain only whitelisted intent fields such as `action` and
`maxPositionPctHint`. The allowed `action` values are `increase_exposure`,
`reduce_exposure`, `hold`, and `avoid`. It must not contain broker order
payloads, final order quantities, credentials, raw account identifiers, margin
changes, transfers, or account-setting mutations.

`evidenceRefs` is retained here because it is an existing persistence field.
New contracts should prefer `sourceRefs`, `sourceSnapshotRefs`, or
`supportingEvidenceRefs` unless they intentionally map to this legacy column.

## Forecast Labels And Scoring

Active LLM agent evaluation must score forecasts separately from trading PnL.
This prevents persuasive thesis text from hiding poor probabilistic forecasts.

```ts
type AgentForecastLabel = {
  decisionId: string;
  symbol: string;
  labelAsOf: string;
  horizonEnd: string;
  status: "labeled" | "blocked";
  actualDirection: "up" | "down" | "flat" | "unknown";
  realizedReturnBps?: number;
  forecastProbabilityUp: number;
  brierScore?: number;
  logScore?: number;
  evidenceRefs: string[];
  blockerReasons: string[];
};
```

Required metrics:

- Brier score for probabilistic direction forecasts;
- log score for probabilistic direction forecasts;
- calibration by confidence bucket once enough labels exist;
- realized return by horizon;
- abstain, blocked, and risk-veto counts;
- turnover and cost-adjusted PnL when paper/shadow actions exist.

## Promotion Gates

An active LLM agent can advance only when all of these are true:

1. numeric/ML baseline comparator exists;
2. agent decisions are recorded with input/output hashes and policy versions;
3. forecast labels cover a meaningful prospective calendar span;
4. risk-gated action plans produce paper/shadow artifacts;
5. blocked, abstained, losing, and flat decisions are retained;
6. paper and simulated broker reconciliation have no unresolved mismatch;
7. provider-backed broker-read-only reconciliation is matched;
8. the broker-write spec is explicitly approved before any account mutation.

Unknown state is `blocked`.

## Current Implementation Slice

The first implementation slice adds:

- `agent_decision_records`;
- `agent_evaluation_runs`;
- `agent_forecast_labels`;
- `lincei agent decide`;
- `lincei agent score`;
- `lincei agent shadow`;
- `lincei agent paper`;
- `lincei broker simulate-paper-plan`;
- `lincei agent status`.

This slice proves that active LLM decisions can be captured, scored, and passed
through a deterministic risk gate into broker-write-disabled shadow records and
paper order-plan/reconciliation ledgers. It reuses the existing control-plane
proposal, paper approval, simulated fill, and reconciliation path; it does not
approve broker writes.

The simulated broker rehearsal then replays a reconciled paper order-plan into
broker-like order status, fill-report, and account-snapshot artifacts. This is
contract and reconciliation proof only; it is not provider-backed broker truth.

The active LLM paper bridge records a compatibility research run for proposal
provenance only. That compatibility run must not be described as LEAN,
QuantConnect Cloud, or historical performance evidence.

## Commands

```bash
bun --cwd=backend run lincei -- agent decide --json
bun --cwd=backend run lincei -- agent decide --mode historical-episode-replay --symbols SPY,QQQ --horizon-hours 120 --json
bun --cwd=backend run lincei -- agent score --json
bun --cwd=backend run lincei -- agent shadow --json
bun --cwd=backend run lincei -- agent paper --json
bun --cwd=backend run lincei -- broker simulate-paper-plan --json
bun --cwd=backend run lincei -- agent status --json
```

Expected blocked states:

- missing `OPENAI_API_KEY`;
- insufficient point-in-time market data;
- no decision reached its scoring horizon;
- prospective scoring before the forecast horizon has elapsed;
- missing market bars for the scoring horizon.
- no proposed decision that maps to a risk-gate order intent;
- blocked shadow risk gate;
- missing paper-account custody event or paper reconciliation mismatch;
- missing paper order-plan for simulated broker rehearsal;
- simulated broker fill or snapshot mismatch.

Blocked states are valid evidence when they name the blocker.

## Non-Goals

- No direct LLM broker orders.
- No final order quantity from LLM output.
- No broker credentials, raw account identifiers, or broker payloads in prompts.
- No real broker submit/cancel/replace/flatten path.
- No Darwinex/Zero adapter.
- No claim that historical backtest performance proves active LLM agent
  profitability.

## Research Basis

- [LiveTradeBench](https://ideas.repec.org/p/arx/papers/2511.03628.html):
  live-style evaluation for LLM trading agents.
- [DeepFund](https://arxiv.org/abs/2503.18313): live arena framing for LLM fund
  agents.
- [Time Travel is Cheating](https://arxiv.org/abs/2505.11065): why historical
  leakage and time-travel evaluation are dangerous for LLM trading agents.
- [StockBench](https://arxiv.org/abs/2510.02209): dynamic benchmark framing for
  stock-trading agents.
- [Deflated Sharpe Ratio](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)
  and
  [Probability of Backtest Overfitting](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf):
  statistical controls for historical strategy selection bias. These reduce
  false confidence, but they do not replace prospective evaluation for active
  LLM agents.
