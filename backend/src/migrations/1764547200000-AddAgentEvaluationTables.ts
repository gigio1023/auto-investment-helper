import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds prospective LLM agent evaluation ledgers without enabling broker writes. */
export class AddAgentEvaluationTables1764547200000
  implements MigrationInterface
{
  name = 'AddAgentEvaluationTables1764547200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_decision_records" (
        "id" varchar PRIMARY KEY NOT NULL,
        "runId" varchar NOT NULL,
        "strategyVariant" varchar NOT NULL,
        "agentId" varchar NOT NULL,
        "symbol" varchar NOT NULL,
        "asOf" varchar NOT NULL,
        "availableAt" varchar NOT NULL,
        "horizonHours" integer NOT NULL,
        "status" varchar NOT NULL,
        "direction" varchar NOT NULL,
        "forecastProbabilityUp" float NOT NULL,
        "expectedReturnBps" float,
        "confidence" float NOT NULL,
        "thesis" varchar,
        "counterThesis" varchar,
        "invalidationCondition" varchar,
        "proposedAction" text NOT NULL,
        "riskNotes" text NOT NULL,
        "sourceSnapshotRefs" text NOT NULL,
        "evidenceRefs" text NOT NULL,
        "model" varchar NOT NULL,
        "promptVersion" varchar NOT NULL,
        "policyVersion" varchar NOT NULL,
        "toolPolicyVersion" varchar NOT NULL,
        "memoryPolicyVersion" varchar NOT NULL,
        "inputHash" varchar NOT NULL,
        "outputHash" varchar NOT NULL,
        "blockerReasons" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_decision_records_run_status"
      ON "agent_decision_records" ("runId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_decision_records_symbol_as_of"
      ON "agent_decision_records" ("symbol", "asOf")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_decision_records_variant_available"
      ON "agent_decision_records" ("strategyVariant", "availableAt")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_evaluation_runs" (
        "runId" varchar PRIMARY KEY NOT NULL,
        "mode" varchar NOT NULL,
        "strategyVariant" varchar NOT NULL,
        "status" varchar NOT NULL,
        "startedAt" varchar NOT NULL,
        "completedAt" varchar,
        "horizonHours" integer NOT NULL,
        "symbols" text NOT NULL,
        "promptVersion" varchar NOT NULL,
        "policyVersion" varchar NOT NULL,
        "inputHash" varchar NOT NULL,
        "outputHash" varchar,
        "decisionCount" integer NOT NULL,
        "blockedCount" integer NOT NULL,
        "abstainedCount" integer NOT NULL,
        "evidenceRefs" text NOT NULL,
        "blockerReasons" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_evaluation_runs_mode_status"
      ON "agent_evaluation_runs" ("mode", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_evaluation_runs_started_status"
      ON "agent_evaluation_runs" ("startedAt", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_forecast_labels" (
        "id" varchar PRIMARY KEY NOT NULL,
        "decisionId" varchar NOT NULL,
        "runId" varchar NOT NULL,
        "symbol" varchar NOT NULL,
        "labelAsOf" varchar NOT NULL,
        "horizonEnd" varchar NOT NULL,
        "status" varchar NOT NULL,
        "actualDirection" varchar NOT NULL,
        "realizedReturnBps" float,
        "forecastProbabilityUp" float NOT NULL,
        "brierScore" float,
        "logScore" float,
        "evidenceRefs" text NOT NULL,
        "blockerReasons" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_forecast_labels_decision_status"
      ON "agent_forecast_labels" ("decisionId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_forecast_labels_symbol_horizon"
      ON "agent_forecast_labels" ("symbol", "horizonEnd")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_agent_forecast_labels_symbol_horizon"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_agent_forecast_labels_decision_status"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "agent_forecast_labels"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_agent_evaluation_runs_started_status"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_agent_evaluation_runs_mode_status"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "agent_evaluation_runs"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_agent_decision_records_variant_available"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_agent_decision_records_symbol_as_of"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_agent_decision_records_run_status"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "agent_decision_records"');
  }
}
