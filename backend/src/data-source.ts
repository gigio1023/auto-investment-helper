import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AutonomousRun } from './entities/autonomous-run.entity';
import { AutonomousRunSchedule } from './entities/autonomous-run-schedule.entity';
import { AgentDecisionRecord } from './entities/agent-decision-record.entity';
import { AgentEvaluationRun } from './entities/agent-evaluation-run.entity';
import { AgentForecastLabel } from './entities/agent-forecast-label.entity';
import { BrokerFill } from './entities/broker-fill.entity';
import { BrokerOrderCommand } from './entities/broker-order-command.entity';
import { BrokerOrderStatusRecord } from './entities/broker-order-status.entity';
import { BrokerSnapshot } from './entities/broker-snapshot.entity';
import { BudgetEnvelope } from './entities/budget-envelope.entity';
import { ExecutionControlState } from './entities/execution-control-state.entity';
import { FundingReadinessRecord } from './entities/funding-readiness-record.entity';
import { InvestmentProposal } from './entities/investment-proposal.entity';
import { LivePilotReadinessRecord } from './entities/live-pilot-readiness-record.entity';
import { MarketDataBar } from './entities/market-data-bar.entity';
import { MarketDataIngestionRun } from './entities/market-data-ingestion-run.entity';
import { NewsSource } from './entities/news-source.entity';
import { OrderPlanApproval } from './entities/order-plan-approval.entity';
import { PaperAccount } from './entities/paper-account.entity';
import { PaperAccountEvent } from './entities/paper-account-event.entity';
import { PaperOrderPlan } from './entities/paper-order-plan.entity';
import { PaperReservationHoldRecord } from './entities/paper-reservation-hold.entity';
import { Report } from './entities/report.entity';
import { ResearchRun } from './entities/research-run.entity';
import { RiskEvaluation } from './entities/risk-evaluation.entity';
import { AddPaperLockReservationIndexes1763760000000 } from './migrations/1763760000000-AddPaperLockReservationIndexes';
import { AddFundingReadinessRecords1763846400000 } from './migrations/1763846400000-AddFundingReadinessRecords';
import { AddLivePilotReadinessRecords1763932800000 } from './migrations/1763932800000-AddLivePilotReadinessRecords';
import { AddBrokerOrderCommands1764019200000 } from './migrations/1764019200000-AddBrokerOrderCommands';
import { AddBrokerOrderStatusRecords1764105600000 } from './migrations/1764105600000-AddBrokerOrderStatusRecords';
import { AddV1PilotTables1764201600000 } from './migrations/1764201600000-AddV1PilotTables';
import { LeanRun } from './entities/lean-run.entity';
import { FeatureSnapshot } from './entities/feature-snapshot.entity';
import { AlphaDecision } from './entities/alpha-decision.entity';
import { AlphaOutcomeLabel } from './entities/alpha-outcome-label.entity';
import { PortfolioTargetSnapshot } from './entities/portfolio-target-snapshot.entity';
import { ExecutionIntent } from './entities/execution-intent.entity';
import { LivePilotStatusRecord } from './entities/live-pilot-status.entity';
import { LlmEventFeature } from './entities/llm-event-feature.entity';
import { LiveShadowRecord } from './entities/live-shadow-record.entity';
import { PromotionDecision } from './entities/promotion-decision.entity';
import { RawEvidenceRecord } from './entities/raw-evidence-record.entity';
import { ResearchHypothesis } from './entities/research-hypothesis.entity';
import { ResearchJobRecord } from './entities/research-job-record.entity';
import { AddSpecEvidenceTables1764288000000 } from './migrations/1764288000000-AddSpecEvidenceTables';
import { AddLiveShadowEvidenceMode1764374400000 } from './migrations/1764374400000-AddLiveShadowEvidenceMode';
import { AddResearchFactoryTables1764460800000 } from './migrations/1764460800000-AddResearchFactoryTables';
import { AddMarketDataTables1764504000000 } from './migrations/1764504000000-AddMarketDataTables';
import { AddAgentEvaluationTables1764547200000 } from './migrations/1764547200000-AddAgentEvaluationTables';
import { loadRepoEnv } from './shared/repo-env.loader';

loadRepoEnv();

export const databaseEntities = [
  Report,
  NewsSource,
  BrokerFill,
  BrokerOrderCommand,
  BrokerOrderStatusRecord,
  OrderPlanApproval,
  PaperAccountEvent,
  BudgetEnvelope,
  BrokerSnapshot,
  FundingReadinessRecord,
  LivePilotReadinessRecord,
  ExecutionControlState,
  InvestmentProposal,
  MarketDataBar,
  MarketDataIngestionRun,
  RiskEvaluation,
  AutonomousRun,
  AutonomousRunSchedule,
  AgentDecisionRecord,
  AgentEvaluationRun,
  AgentForecastLabel,
  ResearchRun,
  PaperAccount,
  PaperOrderPlan,
  PaperReservationHoldRecord,
  LeanRun,
  FeatureSnapshot,
  AlphaDecision,
  AlphaOutcomeLabel,
  LlmEventFeature,
  LiveShadowRecord,
  PromotionDecision,
  RawEvidenceRecord,
  ResearchHypothesis,
  ResearchJobRecord,
  PortfolioTargetSnapshot,
  ExecutionIntent,
  LivePilotStatusRecord,
];

export const databaseMigrations = [
  AddPaperLockReservationIndexes1763760000000,
  AddFundingReadinessRecords1763846400000,
  AddLivePilotReadinessRecords1763932800000,
  AddBrokerOrderCommands1764019200000,
  AddBrokerOrderStatusRecords1764105600000,
  AddV1PilotTables1764201600000,
  AddSpecEvidenceTables1764288000000,
  AddLiveShadowEvidenceMode1764374400000,
  AddResearchFactoryTables1764460800000,
  AddMarketDataTables1764504000000,
  AddAgentEvaluationTables1764547200000,
];

const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: process.env.DATABASE_PATH ?? 'data/investment.db',
  entities: databaseEntities,
  migrations: databaseMigrations,
  migrationsTableName: 'schema_migrations',
  migrationsTransactionMode: 'all',
  synchronize: false,
});

export default AppDataSource;
