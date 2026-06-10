# LLM Alpha Committee

Status: supporting design. The normative LLM semantic and active-alpha specs are [spec/02-llm-semantic-alpha-engine.md](spec/02-llm-semantic-alpha-engine.md) and [spec/12-active-llm-agent-evaluation.md](spec/12-active-llm-agent-evaluation.md).

## Purpose

The LLM committee should reason like an investment team, but produce typed forecasts, theses, invalidation conditions, risk notes, and action plans that the control plane can audit.

The committee is allowed to judge. It is not allowed to place orders, decide final order quantity, or produce broker payloads.

## Agent Roles

| Role                     | Job                                                                   | Output                                                |
| ------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------- |
| Technical Analyst        | Interpret numeric factor and price context                            | trend, momentum, volatility, invalidation levels      |
| News / Sentiment Analyst | Read recent news and social/news sentiment                            | sentiment, novelty, event type, urgency               |
| Fundamental Analyst      | Review earnings, valuation, growth, balance-sheet context             | fundamental score, key risks                          |
| Macro Analyst            | Review rates, inflation, FX, index, sector, and volatility regime     | macro risk and exposure modifier                      |
| Bull Researcher          | Build the strongest long thesis                                       | positive evidence                                     |
| Bear Researcher          | Build the strongest short/avoid thesis                                | negative evidence                                     |
| Risk Reviewer            | Challenge sizing, liquidity, drawdown, and concentration              | risk notes, veto recommendations, and abstain reasons |
| Final Alpha Synthesizer  | Produce final typed active agent decision or alpha decision candidate | direction, horizon, confidence, action-plan hint      |

The roles can run in parallel where possible. The Final Alpha Synthesizer should consume the structured outputs, not raw chat transcripts.

## Active Agent Decision Schema

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

`evidenceRefs` appears here only because current persistence uses that legacy
field name. New adjacent schemas should prefer `supportingEvidenceRefs` or
`sourceSnapshotRefs`.

## Guardrails

- Use structured outputs only.
- Require evidence references for every non-flat decision.
- Require counter-thesis for every long or short decision.
- Require an abstain path.
- Reject decisions based on stale inputs.
- Reject decisions whose evidence would not have been available at `availableAt`.
- Do not expose broker credentials, account ids, or tokens.
- Do not ask the LLM to generate raw broker orders.
- Store model name, prompt version, policy version, input hash, output hash, and latency.
- Score forecasts after the horizon with Brier score and log score.

## Backtest Bias Controls

LLM backtests can be biased because modern models may have seen historical news or company outcomes during training. Mitigations:

- prefer prospective paper/shadow evaluation for active LLM agents;
- anonymize company names for sentiment-only experiments where practical;
- compare headline-only, anonymized, and numeric-only baselines;
- timestamp every retrieved document by availability time;
- separate prompt version, model version, and data window;
- do not promote LLM-only strategies from in-sample historical results;
- treat historical episode replay as behavior audit, not profitability proof.

## Where LLM Judgment Is Valuable

Use LLM judgment for:

- interpreting ambiguous events;
- deciding whether a numeric trend is supported by narrative;
- identifying crowded or fragile trades;
- summarizing earnings-call or filing surprises;
- creating hypotheses for Lean backtests;
- choosing between already-validated strategy variants;
- explaining why the system abstained.

Avoid LLM judgment for:

- final order quantity;
- covariance estimation;
- latency-sensitive stops;
- broker request payloads;
- hidden strategy parameter search without recording failed trials.

## First Implementation

Start with one committee workflow:

1. gather a feature snapshot for each candidate symbol;
2. retrieve recent news/filings/macro snippets;
3. run Technical, News, Macro, Bull, and Bear roles in parallel;
4. run Risk Reviewer;
5. run Final Alpha Synthesizer to emit an active agent decision;
6. store all outputs;
7. score the forecast after the horizon;
8. pass only risk-gated action candidates to paper/shadow arena work.

The first committee can use hosted frontier models. Local fine-tuning is optional and belongs in the training plan.
