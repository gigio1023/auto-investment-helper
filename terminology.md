# Terminology

Status: active normative terminology and style guide.

Use this file with [SPEC.md](SPEC.md) and [AGENTS.md](AGENTS.md). New code, docs, prompts, UI copy, comments, and run reports must use these terms unless an existing API/database/file contract forces a legacy name.

## Principle

Prefer standard English engineering and quantitative-finance terms. Do not invent product-y labels when an established term exists.

When Korean translation is ambiguous, use the English term directly. Examples: `computer science`, `domain model`, `feature store`, `point-in-time`, `lookahead bias`, `backtest`, `shadow trading`, `pre-trade risk check`, `reconciliation`.

## Platform Terms

| Use                | Meaning                                     | Avoid                                |
| ------------------ | ------------------------------------------- | ------------------------------------ |
| `platform`         | OS + CPU architecture + runtime constraints | machine vibes, local weirdness       |
| `operating system` | `Darwin`, `Linux`, etc.                     | OS-ish                               |
| `CPU architecture` | `arm64`, `aarch64`, `x86_64`                | armd, arm thing                      |
| `Apple Silicon`    | ARM-based macOS hardware                    | M-chip box                           |
| `Linux ARM64`      | Linux on `aarch64`/ARM64                    | ARM Linux vaguely                    |
| `x86_64`           | 64-bit Intel/AMD architecture               | amd64 unless matching a package name |

Before running platform-sensitive commands, report or record:

```bash
uname -s
uname -m
```

Also check runtime versions when relevant:

```bash
bun --version
python3 --version
docker info
podman info
```

## QuantConnect And LEAN Terms

| Use                          | Meaning                                                            | Avoid                                        |
| ---------------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| `QuantConnect`               | Managed quant platform                                             | QuantConnector, quantconnector, QC connector |
| `LEAN`                       | Open-source algorithmic trading engine                             | Lean engine when naming the engine           |
| `Lean CLI`                   | QuantConnect CLI tool installed as `lean`                          | random local runner                          |
| `QuantConnect Cloud`         | Managed cloud backtest/research/paper/live environment             | QC server thing                              |
| `Research Environment`       | QuantConnect notebook/research workflow                            | notebook magic                               |
| `Object Store`               | QuantConnect artifact store                                        | object bucket, magic store                   |
| `custom data`                | LEAN user-defined data feed                                        | arbitrary files                              |
| `Algorithm Framework`        | LEAN framework with Universe/Alpha/Portfolio/Risk/Execution models | framework glue                               |
| `UniverseSelectionModel`     | LEAN universe selection model                                      | ticker picker                                |
| `AlphaModel`                 | LEAN model that emits `Insight` objects                            | strategy brain                               |
| `Insight`                    | LEAN forecast object                                               | trade signal when referring to LEAN          |
| `PortfolioConstructionModel` | LEAN sizing/target model                                           | allocator magic                              |
| `RiskManagementModel`        | LEAN risk adjustment model                                         | safety layer                                 |
| `ExecutionModel`             | LEAN order execution model                                         | order sender                                 |

## Quant And Trading Terms

| Use                                 | Meaning                                                                                                                                 | Avoid                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `feature`                           | input variable available at decision time                                                                                               | data point if it is modeled                                               |
| `label`                             | future outcome used for training/evaluation                                                                                             | answer, truth value                                                       |
| `alpha`                             | return forecast or edge estimate                                                                                                        | money idea, trade idea when it is a forecast                              |
| `signal`                            | numeric or categorical model output                                                                                                     | vibe, hunch                                                               |
| `text-derived feature`              | structured feature extracted from text such as filings, news, macro statements, or research notes                                       | LLM opinion blob                                                          |
| `LLM-derived feature`               | structured model input generated by an LLM from allowed point-in-time inputs                                                            | AI decision, LLM opinion blob                                             |
| `semantic feature`                  | short form for `text-derived feature` or `LLM-derived feature` when context is clear                                                    | semantic alpha if it is an input                                          |
| `semantic alpha signal`             | alpha signal whose forecast is materially driven by semantic/text-derived features                                                      | semantic alpha feature when referring to the output signal                |
| `LLM-derived alpha signal`          | alpha signal produced by a model path that uses LLM-derived features                                                                    | AI trade decision                                                         |
| `active LLM agent`                  | LLM workflow that emits forecasts, theses, risk notes, and action plans for prospective evaluation                                      | AI trader, trading brain                                                  |
| `agent decision ledger`             | append-only records of active LLM agent inputs, outputs, hashes, policy versions, and blockers                                          | chat history as evidence                                                  |
| `prospective evaluation`            | evaluation that records decisions before outcomes are known and scores them after the horizon elapses                                   | future backtest, pretend live                                             |
| `live-evaluated strategy`           | strategy candidate whose main evidence comes from prospective paper/shadow or real-time evaluation                                      | unbacktestable magic                                                      |
| `backtestable strategy`             | strategy whose rules and inputs can be replayed over historical data under defined costs                                                | normal strategy if the distinction matters                                |
| `historical episode replay`         | replay of selected historical events for behavior audit, not exhaustive profitability proof                                             | cherry-picked backtest                                                    |
| `paper trading arena`               | prospective paper evaluation that runs one or more strategy/agent variants under the same clock                                         | fake competition                                                          |
| `shadow trading arena`              | live-data would-have-traded evaluation of strategy/agent variants without broker writes                                                 | dry live                                                                  |
| `forecast scoring`                  | scoring predicted probabilities against realized outcomes                                                                               | checking whether the story sounded good                                   |
| `Brier score`                       | squared error for probabilistic binary forecasts                                                                                        | accuracy if probability matters                                           |
| `log score`                         | negative log-likelihood score for probabilistic forecasts                                                                               | confidence score if probability matters                                   |
| `calibration`                       | agreement between forecast probabilities and realized frequencies                                                                       | confidence vibes                                                          |
| `risk-gated action plan`            | LLM-proposed action that must pass deterministic portfolio/risk gates before any execution-like artifact                                | LLM order                                                                 |
| `capital staircase`                 | staged capital deployment from paper/shadow to small approved self-funded capital allocations                                           | YOLO live, instant live                                                   |
| `horizonHours` / `horizonDays`      | explicit forecast horizon unit; choose the one matching the contract granularity                                                        | horizon if the unit is hidden                                             |
| `point-in-time`                     | uses only information available at that simulated time                                                                                  | historical-ish                                                            |
| `availability time` / `availableAt` | earliest time the strategy may consume the record                                                                                       | timestamp if ambiguous                                                    |
| `lookahead bias`                    | use of future information in historical evaluation                                                                                      | future leak                                                               |
| `backtest`                          | historical simulation under defined data and costs                                                                                      | test run if evaluating strategy                                           |
| `walk-forward validation`           | rolling train/validate/test evaluation                                                                                                  | backtest sweep if training is involved                                    |
| `out-of-sample`                     | data not used for training/tuning                                                                                                       | unseen-ish                                                                |
| `paper trading`                     | simulated trading with paper account semantics                                                                                          | fake live                                                                 |
| `shadow trading`                    | live-data decision recording without broker writes                                                                                      | almost live, dry live                                                     |
| `pre-trade risk check`              | deterministic risk/compliance check before execution-like action                                                                        | readiness when naming a new concept                                       |
| `order validation`                  | validation that a proposed order or execution intent satisfies schema, account, and policy constraints                                  | preflight if naming a new finance concept                                 |
| `pre-trade compliance check`        | rule or regulatory check before a trade can be submitted                                                                                | preflight if naming a new finance concept                                 |
| `reconciliation`                    | comparing intended state with observed state                                                                                            | sync check                                                                |
| `notional`                          | dollar value of a position/order                                                                                                        | size if value matters                                                     |
| `exposure`                          | market value at risk                                                                                                                    | bet size when formal                                                      |
| `gross exposure`                    | sum of absolute exposures                                                                                                               | total exposure if ambiguity matters                                       |
| `net exposure`                      | long exposure minus short exposure                                                                                                      | net bet                                                                   |
| `drawdown`                          | decline from peak equity                                                                                                                | loss streak                                                               |
| `slippage`                          | execution price difference versus reference                                                                                             | execution noise                                                           |
| `fill`                              | executed order event                                                                                                                    | completion when order-specific                                            |
| `broker adapter`                    | provider-specific broker boundary implementation                                                                                        | broker connector                                                          |
| `simulated broker adapter`          | broker-like rehearsal path that emits simulated snapshots, order statuses, and fill reports for contract and reconciliation checks only | broker readiness, sandbox proof                                           |
| `self-funded capital allocation`    | allocating the operator's own pre-funded capital after promotion gates pass                                                             | live pilot, tiny live order                                               |
| `parallel research pipeline`        | bounded concurrent jobs that generate hypotheses, features, ablations, and backtest results                                             | uncontrolled parallel trading, research factory when naming a new concept |
| `research job pipeline`             | durable job flow for research, data, feature, ablation, backtest, and import work                                                       | ad hoc batch                                                              |
| `single-writer execution gate`      | one canonical path for portfolio, risk, execution intent, reconciliation, and pre-trade risk checks                                     | many agents writing orders                                                |
| `backtest overfitting`              | fitting strategy, parameters, or promotion decisions too closely to historical results                                                  | tuning until it wins                                                      |
| `multiple-testing bias`             | false confidence from trying many variants and promoting the best-looking one                                                           | selected-run bias when a standard term fits                               |
| `data-snooping bias`                | using repeated inspection of historical data to discover patterns that may not generalize                                               | choosing the winner casually                                              |
| `selection bias`                    | analyzing only retained or favorable observations while ignoring the full population                                                    | survivorship-ish if not about survivorship                                |
| `Darwinex/Zero`                     | external-capital track-record and performance-fee venue considered by this project                                                      | backtest platform when referring to Darwinex                              |
| `DARWIN`                            | Darwinex investable track-record product/index derived from a trader's signals and Darwinex risk management                             | Darwin strategy if ambiguous                                              |
| `Darwinex Risk Engine`              | Darwinex risk-standardization layer that can resize risk independently of our portfolio target                                          | our risk model when referring to Darwinex                                 |
| `performance fee`                   | compensation based on profit from allocated capital under venue rules                                                                   | subscription fee, guaranteed fee                                          |
| `allocated capital`                 | third-party or program capital assigned to a track record or strategy                                                                   | AUM if the platform uses a different term                                 |
| `high-water mark`                   | performance-fee reference level used to avoid paying twice for the same profit                                                          | previous best vaguely                                                     |
| `vintage data`                      | preserved historical data version available at a specific time                                                                          | revised history if used as original data                                  |
| `strategy research corpus`          | stored articles, papers, and notes used to form testable hypotheses                                                                     | blog dump, idea pile                                                      |

## Evidence, Artifacts, And Validation Terms

`evidence` is allowed, but it should be an umbrella term for a body of proof used by promotion, audit, compliance, or model-validation gates. Prefer the exact artifact name when referring to a concrete file, record, or provider payload.

| Use                   | Meaning                                                                                   | Avoid                                                 |
| --------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `supporting evidence` | combined proof that supports a gate decision                                              | evidence when a concrete artifact name is clearer     |
| `promotion evidence`  | body of proof required to promote a strategy or signal                                    | test passed vaguely                                   |
| `validation artifact` | persisted output used to validate a claim                                                 | evidence blob                                         |
| `backtest results`    | performance output from a local or QuantConnect Cloud backtest                            | backtest evidence when referring to the result itself |
| `performance report`  | report containing returns, drawdown, volatility, turnover, costs, or benchmark comparison | evidence report vaguely                               |
| `equity curve`        | time series of portfolio value from a run                                                 | chart evidence                                        |
| `trade list`          | ordered list of simulated or actual trades                                                | order evidence if these are trades                    |
| `order events`        | order lifecycle events such as submit, update, cancel, reject, or fill                    | evidence events                                       |
| `fill report`         | record of executed quantity, price, time, and fees                                        | completion evidence                                   |
| `execution report`    | report of intended versus executed orders and execution quality                           | broker evidence vaguely                               |
| `broker snapshot`     | read-only account/position/order snapshot from a broker boundary                          | broker evidence when it is a snapshot                 |
| `account statement`   | broker/account statement covering balances, positions, and activity                       | account evidence                                      |
| `audit trail`         | ordered record of actions, inputs, outputs, and decisions                                 | log pile                                              |
| `provenance`          | source, retrieval, transformation, and hash lineage for a record                          | source-ish                                            |

Examples:

- Use `Imported QuantConnect Cloud backtest results include statistics, orders, charts, and logs.`
- Use `Promotion evidence includes Cloud artifacts, paper trading artifacts, shadow trading records, reconciliation, and the multiple-testing bias check.`
- Avoid `The evidence evidence proves everything.`

## Engineering Terms

| Use                  | Meaning                                                                                        | Avoid                           |
| -------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------- |
| `domain model`       | typed object representing business concept                                                     | dictionary blob                 |
| `DTO`                | typed request/response transfer object                                                         | loose payload                   |
| `Pydantic model`     | Python validation model for JSON/contracts                                                     | dict soup                       |
| `dataclass`          | Python structured object where validation is not needed                                        | random object                   |
| `TypedDict`          | LEAN-compatible typed dictionary shape                                                         | plain dict if structure matters |
| `schema`             | explicit data shape with fields, types, and validation rules                                   | shape-ish                       |
| `data model`         | domain object or persisted structure representing a business concept                           | dictionary blob                 |
| `wire format`        | serialized request/response/event format crossing a process or service boundary                | payload shape vaguely           |
| `API contract`       | stable externally visible API behavior, endpoint, request, response, and compatibility promise | contract for internal variables |
| `interface contract` | stable caller/callee expectations at a software boundary                                       | contract for metrics/features   |
| `metric schema`      | metric name, unit, label set, and sample semantics                                             | metric contract                 |
| `label set`          | labels/dimensions attached to a metric or time-series sample                                   | metric fields vaguely           |
| `idempotency key`    | replay-protection key                                                                          | duplicate guard vaguely         |
| `artifact`           | persisted output file/object from a run                                                        | dump                            |
| `manifest`           | metadata describing artifacts, hashes, versions, and inputs                                    | list of files                   |
| `hash`               | deterministic digest of content                                                                | fingerprint if not literal      |
| `fail closed`        | unknown or invalid state blocks the action                                                     | safe by default if vague        |
| `blocked`            | action intentionally refused by policy/gate                                                    | failed when policy worked       |

## Legacy Identifiers

Some implemented API routes, entity names, scripts, directories, database fields, and migrations contain older names such as `V1`, `live-pilot`, `live-shadow`, `preflight`, `readiness`, `research-factory`, `selected-run-bias`, `own-capital`, `evidenceRefs`, and `contracts`. Do not rename those casually because they are part of existing API, persistence, CLI, or file compatibility.

Rules:

- Existing API contracts, schema files, script names, database fields, and route names may remain until a planned migration updates them.
- Existing persisted fields such as `horizonDays` may remain until a schema migration changes them; new contracts should make the unit explicit.
- New docs should call them `historical endpoint name`, `legacy identifier`, or `blocked pre-trade risk check artifact` when needed.
- New product scope must not use `live pilot`; use `broker-write spec`, `self-funded capital allocation`, or `Darwinex/Zero track-record path` as appropriate.
- New implementation names should avoid `V1` unless they refer to an immutable migration, fixture, or archived path.
- New finance-facing copy should say `shadow trading`; existing scripts such as `run-live-shadow` may stay as legacy identifiers.
- New finance-facing copy should say `pre-trade risk check`; existing scripts/classes such as `live-preflight` may stay as legacy identifiers.
- New docs should say `parallel research pipeline`; existing files/classes/scripts containing `research-factory` may stay as legacy identifiers.
- New docs should say `multiple-testing bias`, `backtest overfitting`, or `data-snooping bias`; existing scripts such as `run-selected-run-bias-check` may stay as legacy identifiers.
- New docs should distinguish `backtestable strategy` from `live-evaluated strategy` when active LLM decisions are involved.
- New docs should prefer `artifactRefs`, `sourceRefs`, `provenanceRefs`, or `supportingEvidenceRefs` as appropriate. Existing `evidenceRefs` fields may stay as legacy schema fields until a migration is planned.

## Avoid AI-Slop Expressions

Avoid these unless quoting historical text:

- `magic`, `just works`, `smart layer`, `AI brain`, `agent brain`;
- `autopilot` for broker/execution behavior;
- `production-ready` without naming exact gates;
- `tiny live pilot`, `small live order`, `live pilot` for current scope;
- `vibe`, `hunch`, `intuition` for model output;
- `gatch`, `gacha`, or game-like wording for technical behavior;
- `engine slice` when `vertical slice` or `execution path` is clearer;
- `money-moving` when `broker-write path`, `execution path`, or `paper trading/shadow trading path` is more precise;
- `QuantConnector`, `quantconnector`, `QC connector` when the platform is `QuantConnect`.

## Preferred Report Phrasing

Use:

- `Local LEAN simulator run passed; this proves artifact plumbing only.`
- `QuantConnect Cloud backtest is blocked by account tier or data access.`
- `The pre-trade risk check returned blocked as expected.`
- `The LLM produced an LLM-derived feature with source refs and availability time.`
- `The active LLM agent produced a forecast and risk-gated action plan; deterministic risk gates still own execution-like decisions.`
- `The semantic alpha signal improved the numeric baseline in the retained ablation set.`
- `The imported Cloud backtest results are validation artifacts, not broker-write approval.`

Avoid:

- `The trading brain works.`
- `Ready for live.`
- `The AI decided to buy.`
- `The LLM placed the trade.`
- `Local test proves strategy performance.`
