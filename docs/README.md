# Documentation Index

Status: active documentation map.

Read [../SPEC.md](../SPEC.md) first. It is the authority document for project direction and links to the active normative spec set.

## Active Normative Spec

- [SPEC.md](../SPEC.md): canonical spec index, direction lock, and change-control rules.
- [Terminology](../terminology.md): canonical terms and banned AI-slop expressions.
- [Direction And Change Control](spec/00-direction-and-change-control.md)
- [QuantConnect And LEAN Runtime](spec/01-quantconnect-lean-runtime.md)
- [LLM Semantic Alpha Engine](spec/02-llm-semantic-alpha-engine.md)
- [Data Sources And Feature Store](spec/03-data-sources-and-feature-store.md)
- [Risk, Execution, And Broker Boundary](spec/04-risk-execution-and-broker-boundary.md)
- [Testing And Verification Policy](spec/05-testing-and-verification.md)
- [Implementation Roadmap](spec/06-implementation-roadmap.md)
- [References](spec/07-references.md)
- [Quality-Gated Universe](spec/08-quality-gated-universe.md)
- [Dual Monetization And Operations](spec/09-dual-monetization-and-operations.md)
- [Parallel Research Pipeline](spec/10-parallel-research-factory.md)
- [Full Implementation Plan](spec/11-full-implementation-plan.md)

## Supporting Design Docs

These documents explain subsystem intent. If they conflict with `SPEC.md`, `SPEC.md` wins.

- [Project Architecture](project-architecture.md)
- [LEAN and QuantConnect Engine](lean-quantconnect-engine.md)
- [Alpha Model Design](alpha-model-design.md)
- [LLM Alpha Committee](llm-alpha-committee.md)
- [Latency and Execution Paths](latency-and-execution-paths.md)
- [Model Training Plan](model-training-plan.md)
- [ML External Baselines Research](ml-external-baselines-research.md)
- [Toss OpenAPI Source Index](toss-openapi-source-index.md)
- [Toss Securities Open API Readiness](toss-open-api-readiness.md)
- [Self-Funded Capital Architecture Review From Alpha Architect Corpus](own-capital-alphaarchitect-corpus-review.md)

## Operator Runbooks

- [Development Guide](development-guide.md)
- [Deployment Guide](deployment-guide.md)
- [LEAN Backtest And Readiness Paths](full-lean-backtest-setup.md)
- [Execution Readiness](execution-readiness.md)
- [API Reference](api-reference.md)
- [Contribution Guide](../CONTRIBUTING.md)

## Current Implementation Surface

- QuantConnect Cloud wrappers: `scripts/qc-cloud-backtest`, `scripts/qc-cloud-push`, `scripts/qc-object-store-sync`; Cloud promotion evidence requires REST result import, not only CLI command success.
- LLM-derived feature export: `artifacts/llm-features/latest.json` and LEAN input `llm_event_features.json`.
- LEAN point-in-time LLM-derived feature replay with `availableAt` rejection.
- Paper trading/shadow trading artifact commands: `scripts/run-paper-cycle`, `scripts/run-paper-replay`, `scripts/run-live-shadow`; replay artifacts are historical plumbing only.
- Learning/promotion ledger command: `scripts/run-learning-loop`.
- Parallel research pipeline commands: `scripts/build-hypothesis-registry` and the legacy `scripts/run-selected-run-bias-check` multiple-testing bias check.
- Broker-write pre-trade risk check remains blocked for real money; the legacy `scripts/live-pilot-10usd` command is a blocked compatibility surface only.
- Long-term self-funded capital and Darwinex/Zero monetization are approved directions, but their broker/write adapters are not implemented or approved for account mutation yet.
- Alpha Architect strategy corpus: `references/alphaarchitect/` with 40 sourced articles, a strategy register, idempotent hypothesis ingestion, and multiple-testing bias blocker checks.
- Parallelization rule: maximize bounded parallel research/data/feature/ablation/backtest work, then join into a single promotion ledger and single-writer execution gate.

## Decision Records

- [2026-05-24 QuantConnect Realignment](decisions/2026-05-24-quantconnect-realignment.md)

## Archived Historical Context

Archived documents preserve previous prompts, handoffs, and superseded specs. They are not active requirements.

- [Archive Index](archive/README.md)
