import 'reflect-metadata';
import { DataSource, EntityTarget, Repository } from 'typeorm';
import { AlphaDecision } from '../entities/alpha-decision.entity';
import { AlphaOutcomeLabel } from '../entities/alpha-outcome-label.entity';
import { AgentDecisionRecord } from '../entities/agent-decision-record.entity';
import { AgentEvaluationRun } from '../entities/agent-evaluation-run.entity';
import { AgentForecastLabel } from '../entities/agent-forecast-label.entity';
import { AutonomousRun } from '../entities/autonomous-run.entity';
import { AutonomousRunSchedule } from '../entities/autonomous-run-schedule.entity';
import { BrokerFill } from '../entities/broker-fill.entity';
import { BrokerOrderCommand } from '../entities/broker-order-command.entity';
import { BrokerOrderStatusRecord } from '../entities/broker-order-status.entity';
import { BrokerSnapshot } from '../entities/broker-snapshot.entity';
import { BudgetEnvelope } from '../entities/budget-envelope.entity';
import { ExecutionControlState } from '../entities/execution-control-state.entity';
import { ExecutionIntent } from '../entities/execution-intent.entity';
import { FeatureSnapshot } from '../entities/feature-snapshot.entity';
import { FundingReadinessRecord } from '../entities/funding-readiness-record.entity';
import { InvestmentProposal } from '../entities/investment-proposal.entity';
import { LeanRun } from '../entities/lean-run.entity';
import { LivePilotReadinessRecord } from '../entities/live-pilot-readiness-record.entity';
import { LivePilotStatusRecord } from '../entities/live-pilot-status.entity';
import { LiveShadowRecord } from '../entities/live-shadow-record.entity';
import { LlmEventFeature } from '../entities/llm-event-feature.entity';
import { MarketDataBar } from '../entities/market-data-bar.entity';
import { MarketDataIngestionRun } from '../entities/market-data-ingestion-run.entity';
import { NewsSource } from '../entities/news-source.entity';
import { OrderPlanApproval } from '../entities/order-plan-approval.entity';
import { PaperAccount } from '../entities/paper-account.entity';
import { PaperAccountEvent } from '../entities/paper-account-event.entity';
import { PaperOrderPlan } from '../entities/paper-order-plan.entity';
import { PaperReservationHoldRecord } from '../entities/paper-reservation-hold.entity';
import { PortfolioTargetSnapshot } from '../entities/portfolio-target-snapshot.entity';
import { PromotionDecision } from '../entities/promotion-decision.entity';
import { RawEvidenceRecord } from '../entities/raw-evidence-record.entity';
import { ResearchHypothesis } from '../entities/research-hypothesis.entity';
import { ResearchJobRecord } from '../entities/research-job-record.entity';
import { ResearchRun } from '../entities/research-run.entity';
import { RiskEvaluation } from '../entities/risk-evaluation.entity';
import { databaseEntities, databaseMigrations } from '../data-source';
import { BrokerAdapterReadinessService } from '../modules/control-plane/broker-adapter-readiness.service';
import { MarketDataIngestionService } from '../modules/control-plane/market-data-ingestion.service';
import { StooqMarketDataService } from '../modules/control-plane/stooq-market-data.service';
import { ControlPlaneService } from '../modules/control-plane/control-plane.service';
import { TossReadOnlyBrokerService } from '../modules/control-plane/toss-read-only-broker.service';
import { RiskGateService } from '../modules/risk-gate/risk-gate.service';
import { FeatureSnapshotService } from '../modules/v1-pilot/alpha/feature-snapshot.service';
import { CurrentAlphaTargetService } from '../modules/v1-pilot/alpha/current-alpha-target.service';
import { HuggingFaceSemanticEvidenceIngestService } from '../modules/v1-pilot/alpha/huggingface-semantic-evidence-ingest.service';
import { LlmAlphaService } from '../modules/v1-pilot/alpha/llm-alpha.service';
import { LlmEventFeatureService } from '../modules/v1-pilot/alpha/llm-event-feature.service';
import { MetaAlphaService } from '../modules/v1-pilot/alpha/meta-alpha.service';
import { NumericAlphaService } from '../modules/v1-pilot/alpha/numeric-alpha.service';
import { RawEvidenceArchiveService } from '../modules/v1-pilot/alpha/raw-evidence-archive.service';
import { ActiveLlmAgentShadowService } from '../modules/v1-pilot/agent/active-llm-agent-shadow.service';
import { ActiveLlmAgentService } from '../modules/v1-pilot/agent/active-llm-agent.service';
import { SimulatedBrokerRehearsalService } from '../modules/v1-pilot/broker/simulated-broker-rehearsal.service';
import { TossWriteBrokerAdapter } from '../modules/v1-pilot/broker/toss-write-broker.adapter';
import { LeanCliRunner } from '../modules/v1-pilot/lean/lean-cli.runner';
import { LeanCloudManualImporter } from '../modules/v1-pilot/lean/lean-cloud-manual-importer';
import { LeanCloudRunner } from '../modules/v1-pilot/lean/lean-cloud.runner';
import { LeanDailyDataExportService } from '../modules/v1-pilot/lean/lean-daily-data-export.service';
import { LeanDataPreparationService } from '../modules/v1-pilot/lean/lean-data-preparation.service';
import { LeanLocalSimulatorService } from '../modules/v1-pilot/lean/lean-local-simulator.service';
import { LeanRunImportService } from '../modules/v1-pilot/lean/lean-run-import.service';
import { LearningLoopService } from '../modules/v1-pilot/learning/learning-loop.service';
import { LivePilot10UsdService } from '../modules/v1-pilot/live/live-pilot-10usd.service';
import { LivePreflightService } from '../modules/v1-pilot/live/live-preflight.service';
import { LiveShadowService } from '../modules/v1-pilot/live/live-shadow.service';
import { MlBaselineInferenceService } from '../modules/v1-pilot/ml/ml-baseline-inference.service';
import { MlModelRegistryService } from '../modules/v1-pilot/ml/ml-model-registry.service';
import { MlPythonRunner } from '../modules/v1-pilot/ml/ml-python.runner';
import { ActiveLlmPaperBridgeService } from '../modules/v1-pilot/paper/active-llm-paper-bridge.service';
import { LeanPaperBridgeService } from '../modules/v1-pilot/paper/lean-paper-bridge.service';
import { CapitalEvidenceSliceService } from '../modules/v1-pilot/research/capital-evidence-slice.service';
import { ResearchFactoryService } from '../modules/v1-pilot/research/research-factory.service';
import { V1PilotOrchestratorService } from '../modules/v1-pilot/v1-pilot-orchestrator.service';
import { V1PilotStatusService } from '../modules/v1-pilot/v1-pilot-status.service';
import { loadOpenAiEnv } from '../shared/openai-env.loader';
import { loadRepoEnv } from '../shared/repo-env.loader';

export interface LinceiRuntimeOptions {
  dataSource?: DataSource;
  databasePath?: string;
  synchronize?: boolean;
  dropSchema?: boolean;
  migrationsRun?: boolean;
  loadEnv?: boolean;
}

export interface LinceiRuntime {
  dataSource: DataSource;
  controlPlaneService: ControlPlaneService;
  brokerAdapterReadinessService: BrokerAdapterReadinessService;
  tossReadOnlyBrokerService: TossReadOnlyBrokerService;
  marketDataIngestionService: MarketDataIngestionService;
  orchestrator: V1PilotOrchestratorService;
  statusService: V1PilotStatusService;
  capitalEvidenceSliceService: CapitalEvidenceSliceService;
  activeLlmAgentService: ActiveLlmAgentService;
  activeLlmAgentShadowService: ActiveLlmAgentShadowService;
  activeLlmPaperBridgeService: ActiveLlmPaperBridgeService;
  simulatedBrokerRehearsalService: SimulatedBrokerRehearsalService;
  close(): Promise<void>;
}

export async function createLinceiRuntime(
  options: LinceiRuntimeOptions = {},
): Promise<LinceiRuntime> {
  if (options.loadEnv !== false) {
    loadRepoEnv();
    loadOpenAiEnv();
  }

  const dataSource = options.dataSource ?? createDataSource(options);
  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }

  const repo = <T extends object>(target: EntityTarget<T>): Repository<T> =>
    dataSource.getRepository(target);

  const riskGateService = new RiskGateService();
  const brokerAdapterReadinessService = new BrokerAdapterReadinessService();
  const stooqMarketDataService = new StooqMarketDataService();
  const controlPlaneService = new ControlPlaneService(
    repo(BudgetEnvelope),
    repo(BrokerFill),
    repo(BrokerOrderCommand),
    repo(BrokerOrderStatusRecord),
    repo(BrokerSnapshot),
    repo(FundingReadinessRecord),
    repo(LivePilotReadinessRecord),
    repo(InvestmentProposal),
    repo(MarketDataBar),
    repo(OrderPlanApproval),
    repo(ResearchRun),
    repo(PaperAccount),
    repo(PaperAccountEvent),
    repo(PaperOrderPlan),
    repo(PaperReservationHoldRecord),
    repo(ExecutionControlState),
    repo(RiskEvaluation),
    repo(AutonomousRun),
    repo(AutonomousRunSchedule),
    riskGateService,
    dataSource,
  );
  const marketDataIngestionService = new MarketDataIngestionService(
    repo(MarketDataIngestionRun),
    controlPlaneService,
    stooqMarketDataService,
  );
  const tossReadOnlyBrokerService = new TossReadOnlyBrokerService(
    controlPlaneService,
  );

  const mlModelRegistryService = new MlModelRegistryService();
  const mlPythonRunner = new MlPythonRunner();
  const mlBaselineInferenceService = new MlBaselineInferenceService(
    mlModelRegistryService,
    mlPythonRunner,
  );
  const featureSnapshotService = new FeatureSnapshotService(
    repo(FeatureSnapshot),
    repo(MarketDataBar),
  );
  const rawEvidenceArchiveService = new RawEvidenceArchiveService(
    repo(NewsSource),
    repo(RawEvidenceRecord),
  );
  const huggingFaceSemanticEvidenceIngestService =
    new HuggingFaceSemanticEvidenceIngestService(repo(RawEvidenceRecord));
  const llmEventFeatureService = new LlmEventFeatureService(
    repo(LlmEventFeature),
    rawEvidenceArchiveService,
  );
  const numericAlphaService = new NumericAlphaService(
    repo(AlphaDecision),
    mlBaselineInferenceService,
    mlModelRegistryService,
  );
  const llmAlphaService = new LlmAlphaService(repo(AlphaDecision));
  const metaAlphaService = new MetaAlphaService(repo(AlphaDecision));
  const currentAlphaTargetService = new CurrentAlphaTargetService(
    repo(AlphaDecision),
    repo(PortfolioTargetSnapshot),
  );
  const activeLlmAgentService = new ActiveLlmAgentService(
    repo(AgentDecisionRecord),
    repo(AgentEvaluationRun),
    repo(AgentForecastLabel),
    repo(LiveShadowRecord),
    repo(MarketDataBar),
    featureSnapshotService,
  );
  const activeLlmAgentShadowService = new ActiveLlmAgentShadowService(
    repo(AgentDecisionRecord),
    repo(AgentEvaluationRun),
    repo(LiveShadowRecord),
    riskGateService,
  );
  const activeLlmPaperBridgeService = new ActiveLlmPaperBridgeService(
    controlPlaneService,
    activeLlmAgentShadowService,
    repo(AgentDecisionRecord),
    repo(AgentEvaluationRun),
    repo(PaperOrderPlan),
  );
  const simulatedBrokerRehearsalService = new SimulatedBrokerRehearsalService(
    controlPlaneService,
    repo(PaperOrderPlan),
  );
  const leanLocalSimulatorService = new LeanLocalSimulatorService();
  const leanCliRunner = new LeanCliRunner();
  const leanRunImportService = new LeanRunImportService(
    repo(LeanRun),
    repo(PortfolioTargetSnapshot),
  );
  const leanCloudRunner = new LeanCloudRunner(
    leanCliRunner,
    repo(LeanRun),
    repo(PortfolioTargetSnapshot),
  );
  const leanCloudManualImporter = new LeanCloudManualImporter(
    repo(LeanRun),
    repo(PortfolioTargetSnapshot),
  );
  const researchFactoryService = new ResearchFactoryService(
    repo(ResearchHypothesis),
    repo(ResearchJobRecord),
  );
  const leanDailyDataExportService = new LeanDailyDataExportService(
    repo(MarketDataBar),
  );
  const leanDataPreparationService = new LeanDataPreparationService(
    marketDataIngestionService,
    leanDailyDataExportService,
  );
  const leanPaperBridgeService = new LeanPaperBridgeService(
    controlPlaneService,
    leanRunImportService,
    currentAlphaTargetService,
    repo(PortfolioTargetSnapshot),
    repo(PaperOrderPlan),
  );
  const learningLoopService = new LearningLoopService(
    leanRunImportService,
    repo(AlphaDecision),
    repo(AlphaOutcomeLabel),
    repo(MarketDataBar),
    repo(LiveShadowRecord),
    repo(PromotionDecision),
    repo(AgentEvaluationRun),
    repo(AgentDecisionRecord),
    repo(AgentForecastLabel),
    repo(PaperOrderPlan),
    researchFactoryService,
  );
  const liveShadowService = new LiveShadowService(
    leanRunImportService,
    currentAlphaTargetService,
    repo(LiveShadowRecord),
  );
  const tossWriteBrokerAdapter = new TossWriteBrokerAdapter();
  const livePreflightService = new LivePreflightService(
    repo(LivePilotStatusRecord),
    repo(PortfolioTargetSnapshot),
    repo(PaperOrderPlan),
    repo(InvestmentProposal),
    repo(BrokerSnapshot),
    repo(ExecutionControlState),
    leanRunImportService,
    mlModelRegistryService,
    tossWriteBrokerAdapter,
  );
  const livePilot10UsdService = new LivePilot10UsdService(
    repo(LivePilotStatusRecord),
    livePreflightService,
  );
  const orchestrator = new V1PilotOrchestratorService(
    featureSnapshotService,
    llmEventFeatureService,
    numericAlphaService,
    llmAlphaService,
    metaAlphaService,
    huggingFaceSemanticEvidenceIngestService,
    leanLocalSimulatorService,
    leanRunImportService,
    leanPaperBridgeService,
    activeLlmPaperBridgeService,
    learningLoopService,
    liveShadowService,
    livePreflightService,
    livePilot10UsdService,
    mlPythonRunner,
    mlModelRegistryService,
    leanCloudRunner,
    leanCloudManualImporter,
    leanCliRunner,
    researchFactoryService,
    leanDataPreparationService,
  );
  const statusService = new V1PilotStatusService(
    repo(FeatureSnapshot),
    repo(AlphaDecision),
    repo(LeanRun),
    repo(PortfolioTargetSnapshot),
    repo(PaperOrderPlan),
    repo(InvestmentProposal),
    repo(BrokerSnapshot),
    repo(BrokerFill),
    repo(BrokerOrderStatusRecord),
    repo(ExecutionIntent),
    repo(LivePilotStatusRecord),
    repo(AgentEvaluationRun),
    repo(AgentDecisionRecord),
    repo(AgentForecastLabel),
    repo(LiveShadowRecord),
    repo(PromotionDecision),
    mlModelRegistryService,
    researchFactoryService,
  );
  const capitalEvidenceSliceService = new CapitalEvidenceSliceService(
    orchestrator,
    researchFactoryService,
    repo(ResearchJobRecord),
    repo(AlphaDecision),
    activeLlmAgentService,
    activeLlmAgentShadowService,
    activeLlmPaperBridgeService,
  );

  return {
    dataSource,
    controlPlaneService,
    brokerAdapterReadinessService,
    tossReadOnlyBrokerService,
    marketDataIngestionService,
    orchestrator,
    statusService,
    capitalEvidenceSliceService,
    activeLlmAgentService,
    activeLlmAgentShadowService,
    activeLlmPaperBridgeService,
    simulatedBrokerRehearsalService,
    async close(): Promise<void> {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
    },
  };
}

function createDataSource(options: LinceiRuntimeOptions): DataSource {
  return new DataSource({
    type: 'better-sqlite3',
    database:
      options.databasePath ?? process.env.DATABASE_PATH ?? 'data/investment.db',
    entities: databaseEntities,
    migrations: databaseMigrations,
    migrationsTableName: 'schema_migrations',
    migrationsTransactionMode: 'all',
    synchronize: options.synchronize ?? false,
    dropSchema: options.dropSchema ?? false,
    migrationsRun:
      options.migrationsRun ?? process.env.TYPEORM_MIGRATIONS_RUN === 'true',
  });
}
