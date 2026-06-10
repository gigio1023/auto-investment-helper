# Execution Readiness

Status: operator readiness snapshot. The active scope is defined by [../SPEC.md](../SPEC.md).

## Current Verdict

Self-funded capital allocation is the long-term priority, but the repository is not ready for broker writes.

The repo can exercise meaningful parts of the alpha/control-plane stack, including accepted local LEAN runs, result import, point-in-time LLM-derived feature replay, historical paper replay ledgers, shadow trading artifacts, broker read-only artifacts, risk gates, and dashboard visibility. The current readiness gap is self-funded capital deployment-grade evidence: durable baselines, QuantConnect Cloud promotion evidence, current-market paper trading/shadow trading evidence, multiple-testing bias controls, cost/slippage/tax reporting, and broker-read-only reconciliation.

## Runnable Now

- backend build, unit tests, and e2e tests with Bun;
- frontend typecheck, lint, tests, and build with Bun;
- local LEAN/Podman/Docker smoke runs;
- local LEAN result import;
- simulator path for plumbing evidence only;
- ML baseline setup and Python tests;
- alpha cycle and paper cycle when local data/env is available;
- live-preflight legacy check as a blocked artifact report;
- broker read-only snapshot/fill ledgers where credentials and schema verification allow polling;
- paper account, paper order plan, approval, reservation, and reconciliation ledgers;
- execution-control and kill-switch state;
- operational dashboard surfaces for status and blockers.

## Not Promotion Evidence By Itself

- local simulator runs;
- local sample-data runs;
- static `meta_decisions.json` overlays;
- synthetic features;
- import status without non-zero insights/orders/fills;
- paper fills without reconciliation;
- broker dry-run commands;
- live-preflight legacy check that is blocked as designed.

These can prove plumbing. They cannot prove strategy quality or broker readiness.

## Current Blockers

| Area                                     | Status                 | Blocker                                                                                                                                                                                                                        |
| ---------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QuantConnect Cloud                       | Blocked/partial        | Cloud wrappers exist and record blocked evidence, but the current verified run is blocked by missing cloud project. Command success alone is blocked unless REST-imported cloud result artifacts pass strategy-evidence gates. |
| Local LEAN strategy validation artifacts | Passed for local smoke | Linux ARM local LEAN strategy smoke passed through `sg docker` fallback with run `bt-20260524104630-4495ff89`. This is local strategy validation artifacts, not Cloud promotion evidence.                                      |
| Numeric alpha                            | Partial                | LEAN skeleton exists, but promotion-quality cloud evidence and ablation history are still missing.                                                                                                                             |
| LLM-derived alpha                        | Partial                | Point-in-time semantic feature export and LEAN replay exist, but richer source ingestion, Object Store workflow, and ablation evidence are still needed.                                                                       |
| Paper execution                          | Partial                | Historical paper replay can create a reconciled plan, but strict `run-paper-cycle` correctly blocks stale historical targets. Current-market target evidence is still missing.                                                 |
| Live-shadow                              | Partial                | Would-have-traded mode records `historical_target_replay`; promotion still requires `current_live_shadow`.                                                                                                                     |
| Broker writes                            | Blocked                | Real submit/cancel/flatten paths require a separate user-approved broker-write implementation spec.                                                                                                                            |
| Reconciliation                           | Partial                | Paper and read-only reconciliation exist, but broker-backed live reconciliation is intentionally absent.                                                                                                                       |

## Required Gates For Active Scope

- cloud backtest attempt with actionable blocked/passed status;
- cloud command success must not count as promotion evidence until cloud result artifacts are imported and pass acceptance;
- imported cloud or local LEAN run with source/config/data hashes;
- non-zero insight/target/order evidence for strategy-validation claims;
- no-lookahead feature and alpha records keyed by `availableAt`;
- numeric-only, LLM-only, and combined ablation where relevant;
- paper or shadow trading cycle from imported target to reconciliation evidence;
- pre-trade risk check remains blocked for real broker writes unless a broker-write implementation spec is approved.

## Practical Next Step

Build toward this order:

1. create a hypothesis registry backed by the research corpus;
2. implement simple trend/momentum/daily-return baselines before LLM overlay;
3. run parallel ablations and keep failed/losing variants;
4. create or push the QuantConnect Cloud project, then import real cloud result artifacts;
5. expand LLM-derived text source ingestion while preserving `eventTime`, `availableAt`, hashes, model, and prompt version;
6. run paper and shadow trading cycles from accepted LEAN targets;
7. join outcomes back to feature/alpha versions for learning and broker-read-only reconciliation.

Do not implement real broker writes until the broker-write implementation spec is explicitly approved.

## Toss-Specific Readiness

Toss Securities Open API should be treated as live broker access until an official test environment is verified. The current repo posture is read-only or blocked evidence only:

- credentials stay in approved env/secret boundaries;
- schema verification is required before polling;
- read-only snapshots and fills can be imported where enabled;
- order payloads and credentials are rejected from frontend/LLM paths;
- submit, cancel, replace, and flatten remain out of scope.

See [Toss OpenAPI Source Index](toss-openapi-source-index.md) for official
fetch links and [Toss Securities Open API Readiness](toss-open-api-readiness.md)
for source-specific integration notes.
