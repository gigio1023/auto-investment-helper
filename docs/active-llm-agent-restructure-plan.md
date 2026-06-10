# Active LLM Agent Restructure Plan

Status: supporting implementation plan.

Created: 2026-06-01.

## Objective

Reorient the project from a backtest-first LLM feature-ablation system into a
self-funded-capital system where active LLM investment committee decisions are
evaluated prospectively.

The goal is not to remove backtesting. The goal is to stop treating historical
backtests as the main proof for active LLM behavior.

## Core Loop

```text
data and portfolio snapshot
  -> active LLM agent decision
  -> deterministic risk gate
  -> paper trading/shadow trading arena
  -> realized label and forecast score
  -> reconciliation
  -> promotion or rejection
```

Backtests stay in the system as baseline comparison, LEAN plumbing validation,
historical episode replay, and rejection filters.

## Planning Pattern

This plan borrows the useful parts of the `~/git/harenss` projects:

- skeleton-first documentation before code expansion;
- explicit phase gates before promotion;
- rubric-style evaluation instead of vague judgment;
- clear `automatic`, `ask`, and `blocked` boundaries;
- domain judgment gaps named before implementation.

## Workstream A: Spec And Operator Docs

Files:

- `README.md`
- `SPEC.md`
- `terminology.md`
- `docs/spec/00-direction-and-change-control.md`
- `docs/spec/02-llm-semantic-alpha-engine.md`
- `docs/spec/05-testing-and-verification.md`
- `docs/spec/06-implementation-roadmap.md`
- `docs/spec/11-full-implementation-plan.md`
- `docs/spec/12-active-llm-agent-evaluation.md`

Deliver:

- Active LLM strategy is documented as `live-evaluated strategy`.
- Backtests are documented as baseline/replay/sanity evidence.
- Prospective paper/shadow evaluation becomes the primary LLM-agent evidence.
- LLM output can include forecasts, theses, invalidation conditions, and action
  plans.
- LLM output cannot include broker payloads, final order quantities,
  credentials, account identifiers, or account mutation.

Gate:

- A reader can explain how the project decides, evaluates, and eventually
  allocates capital without assuming that a historical LLM backtest proves
  profitability.

## Workstream B: Agent Decision Ledger

Files:

- `backend/src/entities/agent-decision-record.entity.ts`
- `backend/src/entities/agent-evaluation-run.entity.ts`
- `backend/src/entities/agent-forecast-label.entity.ts`
- `backend/src/migrations/*AddAgentEvaluationTables.ts`
- `backend/src/modules/v1-pilot/agent/active-llm-agent.service.ts`

Deliver:

- Persist one active agent decision per symbol/run.
- Persist run metadata, prompt version, policy version, input hash, output hash,
  blockers, and evidence refs.
- Persist forecast labels and scoring outputs.
- Missing LLM credentials produce blocked evidence, not fake decisions.

Gate:

- `lincei agent decide --json` records passed or blocked agent evaluation
  evidence.

## Workstream C: Forecast Scoring

Files:

- `backend/src/modules/v1-pilot/agent/active-llm-agent.service.ts`
- `backend/src/modules/v1-pilot/learning/*` later if the scoring expands.

Deliver:

- Brier score.
- Log score.
- Realized return by horizon.
- Blocked labels when the horizon or market data is unavailable.

Gate:

- `lincei agent score --json` returns labeled/blocked counts and average scores.

## Workstream D: CLI And Runtime

Files:

- `backend/src/runtime/create-lincei-runtime.ts`
- `backend/src/cli/lincei.ts`

Deliver:

- `lincei agent decide`
- `lincei agent score`
- no NestJS dependency in the operator path;
- no script-first operational command for the new surface.

Gate:

- `bun --cwd=backend run lincei -- --help` lists the active agent commands.

## Workstream E: Paper/Shadow Arena Integration

Files:

- `backend/src/modules/v1-pilot/live/live-shadow.service.ts`
- `backend/src/modules/v1-pilot/paper/lean-paper-bridge.service.ts`
- `backend/src/modules/v1-pilot/v1-pilot-status*.ts`
- frontend dashboard files.

Deliver:

- Convert active agent decisions into risk-gated action candidates.
- Record vetoes and abstentions.
- Keep single-writer portfolio/risk/execution-like ledgers.
- Show prospective agent evidence separately from historical backtest evidence.

Gate:

- Active agent decisions can be reviewed beside paper/shadow outcomes without
  implying broker-write readiness.

## Workstream F: Historical Episode Replay

Files:

- new episode manifest under `config/` or `references/`;
- agent decision service extensions;
- LEAN/custom-data replay helpers where needed.

Deliver:

- Selected FOMC/CPI/crash/rally/sector-rotation episodes.
- Point-in-time input manifests.
- Agent behavior reports.

Gate:

- Historical episode replay can identify dangerous behavior, but cannot promote
  the agent without prospective evidence.

## Workstream G: Dashboard And Result Explanation

Files:

- `frontend/src/components/BacktestCycleDashboard.tsx`
- `frontend/src/components/backtest-cycle-dashboard/*`
- `result.md`

Deliver:

- Rename the conceptual surface from backtest cycle to capital evidence cycle.
- Show four lanes: baseline backtest, active agent arena, risk/reconciliation,
  broker-write blocker.
- Explain Korean operator-facing flow without assuming quant background.

Gate:

- The operator can see what is done, what is blocked, and what evidence is
  historical versus prospective.

## Workstream H: Capital Staircase

Files:

- future broker-write spec only after user approval.

Deliver later:

- tiny capital;
- small capital;
- normal capital;
- capital scaling and retirement rules.

Gate:

- Not approved by this plan. Requires a separate broker-write implementation
  spec and explicit approval.

## Immediate Slice Started In This Branch

This branch starts Workstreams A-D:

1. Add active LLM agent evaluation spec.
2. Add active agent ledgers.
3. Add `lincei agent decide`.
4. Add `lincei agent score`.
5. Add narrow tests for blocked decisions and forecast scoring.

## Verification

```bash
git diff --check

cd backend
bun run test -- \
  src/modules/v1-pilot/agent/active-llm-agent.service.spec.ts \
  src/runtime/create-lincei-runtime.spec.ts \
  src/cli/lincei.spec.ts
bun run build

bun --cwd=backend run lincei -- --help
bun --cwd=backend run lincei -- agent decide --json
bun --cwd=backend run lincei -- agent score --json
```

Expected local blockers:

- `agent decide` blocks if market data or `OPENAI_API_KEY` is unavailable.
- `agent score` blocks if no active decisions or no labelable horizon exists.

Those blockers are valid as long as they are explicit.
