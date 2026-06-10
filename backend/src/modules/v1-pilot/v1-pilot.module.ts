/**
 * V1 autonomous validation module: alpha generation, LEAN ingest, paper bridge, broker adapters, broker-write gates.
 * Kept separate from ControlPlaneModule to preserve the LEAN/LLM/broker credential boundaries in the spec.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlphaDecision } from '../../entities/alpha-decision.entity';
import { AlphaOutcomeLabel } from '../../entities/alpha-outcome-label.entity';
import { AgentDecisionRecord } from '../../entities/agent-decision-record.entity';
import { AgentEvaluationRun } from '../../entities/agent-evaluation-run.entity';
import { AgentForecastLabel } from '../../entities/agent-forecast-label.entity';
import { ExecutionIntent } from '../../entities/execution-intent.entity';
import { FeatureSnapshot } from '../../entities/feature-snapshot.entity';
import { LeanRun } from '../../entities/lean-run.entity';
import { LlmEventFeature } from '../../entities/llm-event-feature.entity';
import { LiveShadowRecord } from '../../entities/live-shadow-record.entity';
import { LivePilotStatusRecord } from '../../entities/live-pilot-status.entity';
import { MarketDataBar } from '../../entities/market-data-bar.entity';
import { NewsSource } from '../../entities/news-source.entity';
import { PortfolioTargetSnapshot } from '../../entities/portfolio-target-snapshot.entity';
import { PromotionDecision } from '../../entities/promotion-decision.entity';
import { RawEvidenceRecord } from '../../entities/raw-evidence-record.entity';
import { ResearchHypothesis } from '../../entities/research-hypothesis.entity';
import { ResearchJobRecord } from '../../entities/research-job-record.entity';
import { PaperOrderPlan } from '../../entities/paper-order-plan.entity';
import { InvestmentProposal } from '../../entities/investment-proposal.entity';
import { BrokerSnapshot } from '../../entities/broker-snapshot.entity';
import { BrokerFill } from '../../entities/broker-fill.entity';
import { BrokerOrderStatusRecord } from '../../entities/broker-order-status.entity';
import { ExecutionControlState } from '../../entities/execution-control-state.entity';
import { ControlPlaneModule } from '../control-plane/control-plane.module';
import { RiskGateModule } from '../risk-gate/risk-gate.module';
import { FeatureSnapshotService } from './alpha/feature-snapshot.service';
import { CurrentAlphaTargetService } from './alpha/current-alpha-target.service';
import { LlmEventFeatureService } from './alpha/llm-event-feature.service';
import { NumericAlphaService } from './alpha/numeric-alpha.service';
import { LlmAlphaService } from './alpha/llm-alpha.service';
import { MetaAlphaService } from './alpha/meta-alpha.service';
import { RawEvidenceArchiveService } from './alpha/raw-evidence-archive.service';
import { HuggingFaceSemanticEvidenceIngestService } from './alpha/huggingface-semantic-evidence-ingest.service';
import { LeanLocalSimulatorService } from './lean/lean-local-simulator.service';
import { LeanDailyDataExportService } from './lean/lean-daily-data-export.service';
import { LeanDataPreparationService } from './lean/lean-data-preparation.service';
import { LeanCloudRunner } from './lean/lean-cloud.runner';
import { LeanCloudManualImporter } from './lean/lean-cloud-manual-importer';
import { LeanRunImportService } from './lean/lean-run-import.service';
import { ActiveLlmPaperBridgeService } from './paper/active-llm-paper-bridge.service';
import { LeanPaperBridgeService } from './paper/lean-paper-bridge.service';
import { LearningLoopService } from './learning/learning-loop.service';
import { LiveShadowService } from './live/live-shadow.service';
import { LivePreflightService } from './live/live-preflight.service';
import { LivePilot10UsdService } from './live/live-pilot-10usd.service';
import { MockBrokerAdapter } from './broker/mock-broker.adapter';
import { SimulatedBrokerRehearsalService } from './broker/simulated-broker-rehearsal.service';
import { TossWriteBrokerAdapter } from './broker/toss-write-broker.adapter';
import { V1PilotOrchestratorService } from './v1-pilot-orchestrator.service';
import { V1PilotController } from './v1-pilot.controller';
import { V1PilotStatusService } from './v1-pilot-status.service';
import { MlModelRegistryService } from './ml/ml-model-registry.service';
import { MlPythonRunner } from './ml/ml-python.runner';
import { MlBaselineInferenceService } from './ml/ml-baseline-inference.service';
import { LeanCliRunner } from './lean/lean-cli.runner';
import { ResearchFactoryService } from './research/research-factory.service';
import { CapitalEvidenceSliceService } from './research/capital-evidence-slice.service';
import { ActiveLlmAgentShadowService } from './agent/active-llm-agent-shadow.service';
import { ActiveLlmAgentService } from './agent/active-llm-agent.service';

@Module({
  imports: [
    ControlPlaneModule,
    RiskGateModule,
    TypeOrmModule.forFeature([
      AlphaDecision,
      AlphaOutcomeLabel,
      AgentDecisionRecord,
      AgentEvaluationRun,
      AgentForecastLabel,
      ExecutionIntent,
      FeatureSnapshot,
      LeanRun,
      LlmEventFeature,
      LiveShadowRecord,
      LivePilotStatusRecord,
      MarketDataBar,
      NewsSource,
      PortfolioTargetSnapshot,
      PromotionDecision,
      RawEvidenceRecord,
      ResearchHypothesis,
      ResearchJobRecord,
      PaperOrderPlan,
      InvestmentProposal,
      BrokerSnapshot,
      BrokerFill,
      BrokerOrderStatusRecord,
      ExecutionControlState,
    ]),
  ],
  controllers: [V1PilotController],
  providers: [
    FeatureSnapshotService,
    RawEvidenceArchiveService,
    HuggingFaceSemanticEvidenceIngestService,
    LlmEventFeatureService,
    NumericAlphaService,
    MlModelRegistryService,
    MlPythonRunner,
    MlBaselineInferenceService,
    LlmAlphaService,
    MetaAlphaService,
    CurrentAlphaTargetService,
    LeanLocalSimulatorService,
    LeanDailyDataExportService,
    LeanDataPreparationService,
    LeanCloudRunner,
    LeanCloudManualImporter,
    LeanCliRunner,
    LeanRunImportService,
    ResearchFactoryService,
    CapitalEvidenceSliceService,
    ActiveLlmAgentService,
    ActiveLlmAgentShadowService,
    ActiveLlmPaperBridgeService,
    LeanPaperBridgeService,
    LearningLoopService,
    LiveShadowService,
    LivePreflightService,
    LivePilot10UsdService,
    MockBrokerAdapter,
    SimulatedBrokerRehearsalService,
    TossWriteBrokerAdapter,
    V1PilotOrchestratorService,
    V1PilotStatusService,
  ],
  exports: [
    V1PilotOrchestratorService,
    LeanRunImportService,
    LivePreflightService,
  ],
})
export class V1PilotModule {}
