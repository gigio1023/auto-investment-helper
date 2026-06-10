import { LeanRun } from '../../entities/lean-run.entity';
import type { LivePilotPreflightContract } from './contracts/v1-pilot.contracts';
import type {
  V1CurrentMilestoneStatus,
  V1PilotSystemStatus,
  V1SystemStage,
  V1SystemStageScope,
  V1SystemStageStatus,
} from './v1-pilot-status.types';

export interface V1SystemStageInput {
  research: V1PilotSystemStatus['research'];
  alpha: V1PilotSystemStatus['alpha'];
  latestLeanRun: LeanRun | null;
  latestCloudRun: LeanRun | null;
  portfolioTarget: V1PilotSystemStatus['portfolioTarget'];
  paper: V1PilotSystemStatus['paper'];
  activeAgent: V1PilotSystemStatus['activeAgent'];
  broker: V1PilotSystemStatus['broker'];
  preflight: LivePilotPreflightContract;
  livePilot: V1PilotSystemStatus['livePilot'];
}

export function buildV1SystemStages(
  input: V1SystemStageInput,
): V1SystemStage[] {
  return [
    stage(
      'hypothesis_registry',
      'Hypothesis Registry',
      input.research.hypothesisCount > 0 && input.research.p1CandidateCount > 0
        ? 'ready'
        : input.research.hypothesisCount > 0
          ? 'blocked'
          : 'missing',
      `${input.research.p1CandidateCount} P1 candidates / ${input.research.hypothesisCount} hypotheses`,
      input.research.hypothesisCount > 0 && input.research.p1CandidateCount > 0
        ? []
        : [
            'Build the hypothesis registry from the stored strategy research corpus.',
          ],
      input.research.latestJobId ? [input.research.latestJobId] : [],
    ),
    stage(
      'variant_evidence',
      'Variant Evidence',
      variantEvidenceStatus(input.research),
      `${input.research.variantJobCount} variant jobs / ${input.research.passedVariantJobCount} passed / ${input.research.failedOrBlockedVariantJobCount} failed or blocked`,
      variantEvidenceBlockers(input.research),
      input.research.latestVariantJobId
        ? [input.research.latestVariantJobId]
        : [],
    ),
    stage(
      'feature_store',
      'Feature Store',
      input.alpha.featureSnapshotCount > 0 ? 'ready' : 'missing',
      `${input.alpha.featureSnapshotCount} feature snapshots`,
      input.alpha.featureSnapshotCount > 0
        ? []
        : ['No timestamped feature snapshots have been stored.'],
      input.alpha.latestFeatureAsOf ? [input.alpha.latestFeatureAsOf] : [],
    ),
    stage(
      'alpha_decisions',
      'Alpha Decisions',
      input.alpha.numericDecisionCount > 0 &&
        input.alpha.llmDecisionCount > 0 &&
        input.alpha.metaDecisionCount > 0
        ? 'ready'
        : input.alpha.numericDecisionCount > 0
          ? 'blocked'
          : 'missing',
      `numeric=${input.alpha.numericDecisionCount}, llm=${input.alpha.llmDecisionCount}, meta=${input.alpha.metaDecisionCount}`,
      [
        input.alpha.numericDecisionCount <= 0
          ? 'Numeric alpha decisions are missing.'
          : '',
        input.alpha.llmDecisionCount <= 0
          ? 'LLM alpha decisions are missing.'
          : '',
        input.alpha.metaDecisionCount <= 0
          ? 'Meta alpha decisions are missing.'
          : '',
      ].filter(Boolean),
      input.alpha.latestAlphaAsOf ? [input.alpha.latestAlphaAsOf] : [],
    ),
    stage(
      'lean_backtest',
      'LEAN Backtest',
      input.latestLeanRun?.status === 'passed'
        ? 'ready'
        : input.latestLeanRun
          ? 'blocked'
          : 'missing',
      input.latestLeanRun
        ? `${input.latestLeanRun.runId} / ${input.latestLeanRun.runtime} / ${input.latestLeanRun.status}`
        : 'No LEAN run has been imported.',
      input.latestLeanRun?.status === 'passed'
        ? []
        : ['Latest LEAN run has not passed strict import gates.'],
      input.latestLeanRun ? [input.latestLeanRun.runId] : [],
    ),
    stage(
      'active_llm_agent',
      'Active LLM Agent',
      activeAgentStatus(input.activeAgent),
      input.activeAgent.runId
        ? `run=${input.activeAgent.runId}, decisions=${input.activeAgent.proposedDecisionCount}/${input.activeAgent.decisionCount}, shadow=${input.activeAgent.latestShadowStatus ?? 'missing'}, paper=${input.activeAgent.paperPlanStatus ?? 'missing'}`
        : 'No active LLM agent run exists.',
      activeAgentBlockers(input.activeAgent),
      [
        input.activeAgent.runId,
        input.activeAgent.latestShadowId,
        input.activeAgent.paperPlanId
          ? String(input.activeAgent.paperPlanId)
          : undefined,
        input.activeAgent.promotionDecisionId,
      ].filter((ref): ref is string => Boolean(ref)),
    ),
    stage(
      'cloud_import',
      'QuantConnect Cloud Import',
      input.latestCloudRun?.status === 'passed'
        ? 'ready'
        : input.latestLeanRun
          ? 'blocked'
          : 'missing',
      input.latestCloudRun
        ? `${input.latestCloudRun.runId} / project=${input.latestCloudRun.cloudProjectId ?? 'missing'} / backtest=${input.latestCloudRun.cloudBacktestId ?? 'missing'}`
        : input.latestLeanRun
          ? 'Local LEAN validation exists, but imported QuantConnect Cloud backtest results are still missing.'
          : 'No QuantConnect Cloud backtest results have been imported.',
      input.latestCloudRun?.status === 'passed'
        ? []
        : [
            'Import QuantConnect Cloud backtest results by projectId/backtestId before promotion.',
          ],
      input.latestCloudRun ? [input.latestCloudRun.runId] : [],
    ),
    stage(
      'portfolio_targets',
      'Portfolio Targets',
      input.portfolioTarget.targetCount > 0 ? 'ready' : 'missing',
      `${input.portfolioTarget.targetCount} imported targets`,
      input.portfolioTarget.targetCount > 0
        ? []
        : ['No portfolio targets are available for the latest LEAN run.'],
      input.portfolioTarget.id ? [input.portfolioTarget.id] : [],
    ),
    stage(
      'paper_execution',
      'Paper Execution',
      input.paper.reconciliationStatus === 'matched'
        ? 'ready'
        : input.paper.planId
          ? 'blocked'
          : 'missing',
      input.paper.planId
        ? `plan=${input.paper.planId}, status=${input.paper.status}, reconciliation=${input.paper.reconciliationStatus ?? 'unknown'}`
        : input.paper.replayPlanId
          ? `historical replay plan=${input.paper.replayPlanId}, status=${input.paper.replayStatus ?? 'unknown'}, reconciliation=${input.paper.replayReconciliationStatus ?? 'unknown'}`
          : 'No paper plan exists for the latest LEAN target.',
      input.paper.reconciliationStatus === 'matched'
        ? []
        : input.paper.replayReconciliationStatus === 'matched'
          ? [
              'Historical paper replay is reconciled, but current paper trading artifacts are still missing for broker-write pre-trade risk checks.',
            ]
          : ['Latest matching paper plan is not reconciled.'],
      [
        input.paper.planId ? String(input.paper.planId) : undefined,
        input.paper.replayPlanId
          ? `replay:${input.paper.replayPlanId}`
          : undefined,
      ].filter((ref): ref is string => Boolean(ref)),
    ),
    stage(
      'broker_read_only',
      'Broker Read-Only',
      input.broker.provider === 'toss' &&
        input.broker.snapshotReconciliationStatus === 'matched'
        ? 'ready'
        : input.broker.snapshotId
          ? 'blocked'
          : 'missing',
      input.broker.snapshotId
        ? `${input.broker.provider} snapshot=${input.broker.snapshotId}, reconciliation=${input.broker.snapshotReconciliationStatus ?? 'unknown'}`
        : 'No broker read-only snapshot artifact exists.',
      input.broker.provider === 'toss' &&
        input.broker.snapshotReconciliationStatus === 'matched'
        ? []
        : ['Latest broker snapshot is not matched Toss read-only artifact.'],
      input.broker.snapshotId ? [String(input.broker.snapshotId)] : [],
    ),
    stage(
      'open_orders',
      'Open Orders',
      input.broker.openOrderCount === 0 ? 'ready' : 'blocked',
      `${input.broker.openOrderCount} open or mismatched broker order records`,
      input.broker.openOrderCount === 0
        ? []
        : ['Open or mismatched broker order artifacts must be resolved.'],
      input.broker.orderStatusId ? [String(input.broker.orderStatusId)] : [],
    ),
    buildLivePreflightStage(input.latestLeanRun, input.paper, input.preflight),
    stage(
      'broker_write_spec',
      'Broker-Write Spec',
      input.livePilot.realOrderSent ? 'blocked' : 'missing',
      input.livePilot.realOrderSent
        ? `real order artifact exists via ${input.livePilot.latestIntentId}; inspect scope before any further account mutation.`
        : 'Deferred until a user-approved broker-write implementation spec exists.',
      [
        'Broker writes require a future user-approved broker-write implementation spec.',
      ],
      input.livePilot.latestIntentId ? [input.livePilot.latestIntentId] : [],
      { scope: 'deferred', blocksCurrentMilestone: false },
    ),
    stage(
      'self_funded_capital',
      'Self-Funded Capital Allocation',
      'missing',
      'Deferred until promotion evidence, broker-read-only reconciliation, and the broker-write spec are complete.',
      [
        'Self-funded capital allocation is the long-term goal, not the active implementation milestone.',
      ],
      [],
      { scope: 'deferred', blocksCurrentMilestone: false },
    ),
    stage(
      'darwinex_zero',
      'Darwinex/Zero Track Record',
      'missing',
      'Deferred until a self-funded capital deployment-grade signal and track record exist.',
      [
        'Darwinex/Zero work must not run ahead of self-funded capital evidence.',
      ],
      [],
      { scope: 'deferred', blocksCurrentMilestone: false },
    ),
  ];
}

export function buildV1NextActions(stages: V1SystemStage[]): string[] {
  const firstBlocker = stages.find(
    (stageItem) =>
      stageItem.blocksCurrentMilestone && stageItem.status !== 'ready',
  );
  if (!firstBlocker) {
    return [
      'The current validation milestone is ready; broker writes and Darwinex/Zero still require future user-approved specs.',
    ];
  }
  return [
    `Resolve ${firstBlocker.label}: ${firstBlocker.blockers[0] ?? firstBlocker.detail}`,
    'Run bun --cwd=backend run lincei -- capital run --max-backtest-workers 1 --json after the blocker is resolved.',
  ];
}

export function buildV1CurrentMilestoneStatus(
  stages: V1SystemStage[],
): V1CurrentMilestoneStatus {
  const currentStages = stages.filter(
    (stageItem) => stageItem.scope === 'current',
  );
  const readyStageCount = currentStages.filter(
    (stageItem) => stageItem.status === 'ready',
  ).length;
  const blockedStageCount = currentStages.filter(
    (stageItem) => stageItem.status === 'blocked',
  ).length;
  const missingStageCount = currentStages.filter(
    (stageItem) => stageItem.status === 'missing',
  ).length;
  return {
    key: 'self-funded-capital-evidence',
    label: 'Self-Funded Capital Evidence Milestone',
    verdict:
      blockedStageCount > 0
        ? 'blocked'
        : missingStageCount > 0
          ? 'missing'
          : 'ready',
    readyStageCount,
    blockedStageCount,
    missingStageCount,
    currentStageCount: currentStages.length,
    deferredStageCount: stages.length - currentStages.length,
  };
}

function variantEvidenceStatus(
  research: V1PilotSystemStatus['research'],
): V1SystemStageStatus {
  if (research.variantJobCount <= 0) {
    return 'missing';
  }
  return variantEvidenceBlockers(research).length > 0 ? 'blocked' : 'ready';
}

function variantEvidenceBlockers(
  research: V1PilotSystemStatus['research'],
): string[] {
  return [
    research.variantJobCount < 3
      ? 'At least three retained ablation/backtest/Cloud-import variant jobs are required.'
      : '',
    research.passedVariantJobCount <= 0
      ? 'No passed variant job is recorded.'
      : '',
    research.failedOrBlockedVariantJobCount <= 0
      ? 'No failed or blocked variant job is recorded; multiple-testing bias protection needs rejected artifacts too.'
      : '',
  ].filter((blocker): blocker is string => blocker.length > 0);
}

function activeAgentStatus(
  activeAgent: V1PilotSystemStatus['activeAgent'],
): V1SystemStageStatus {
  if (!activeAgent.runId) {
    return 'missing';
  }
  return activeAgentBlockers(activeAgent).length > 0 ? 'blocked' : 'ready';
}

function activeAgentBlockers(
  activeAgent: V1PilotSystemStatus['activeAgent'],
): string[] {
  return [
    activeAgent.runStatus !== 'passed'
      ? `Latest active LLM agent run status is ${activeAgent.runStatus}.`
      : '',
    activeAgent.proposedDecisionCount <= 0
      ? 'No proposed active LLM decisions are available.'
      : '',
    activeAgent.latestShadowStatus !== 'recorded'
      ? 'No recorded active LLM shadow arena exists.'
      : '',
    !['filled', 'reconciled'].includes(activeAgent.paperPlanStatus ?? '')
      ? 'No filled active LLM paper order-plan exists.'
      : '',
    activeAgent.paperReconciliationStatus !== 'matched'
      ? 'Active LLM paper order-plan is not reconciled.'
      : '',
    activeAgent.labeledForecastCount <= 0
      ? 'No labeled active LLM forecasts are available yet.'
      : '',
    !activeAgent.promotionStatus
      ? 'Active LLM promotion decision has not been recorded.'
      : '',
    activeAgent.promotionStatus !== 'accepted' &&
    activeAgent.promotionBlockerCount > 0
      ? 'Active LLM promotion decision is still blocked.'
      : '',
  ].filter((blocker): blocker is string => blocker.length > 0);
}

function buildLivePreflightStage(
  latestLeanRun: LeanRun | null,
  paper: V1PilotSystemStatus['paper'],
  preflight: LivePilotPreflightContract,
): V1SystemStage {
  const staleBlockers = [
    latestLeanRun &&
    preflight.latestLeanRunId &&
    preflight.latestLeanRunId !== latestLeanRun.runId
      ? `Latest live-preflight legacy check used LEAN run ${preflight.latestLeanRunId}, not current ${latestLeanRun.runId}.`
      : '',
    paper.planId &&
    preflight.latestPaperPlanId &&
    String(preflight.latestPaperPlanId) !== String(paper.planId)
      ? `Latest live-preflight legacy check used paper plan ${preflight.latestPaperPlanId}, not current ${paper.planId}.`
      : '',
  ].filter((blocker): blocker is string => blocker.length > 0);
  const blockers = [...preflight.blockers, ...staleBlockers];

  return stage(
    'live_preflight',
    'Pre-Trade Risk Check',
    preflight.status === 'ready' && staleBlockers.length === 0
      ? 'ready'
      : 'blocked',
    preflight.status,
    blockers,
    [
      preflight.latestLeanRunId,
      preflight.latestPaperPlanId
        ? String(preflight.latestPaperPlanId)
        : undefined,
      preflight.latestBrokerSnapshotId
        ? String(preflight.latestBrokerSnapshotId)
        : undefined,
    ].filter((ref): ref is string => Boolean(ref)),
  );
}

function stage(
  key: string,
  label: string,
  status: V1SystemStageStatus,
  detail: string,
  blockers: string[],
  refs: string[],
  options: {
    scope?: V1SystemStageScope;
    blocksCurrentMilestone?: boolean;
  } = {},
): V1SystemStage {
  return {
    key,
    label,
    status,
    scope: options.scope ?? 'current',
    blocksCurrentMilestone: options.blocksCurrentMilestone ?? true,
    detail,
    blockers,
    refs,
  };
}
