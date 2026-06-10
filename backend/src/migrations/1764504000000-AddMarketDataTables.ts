import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds market-data ledgers required by feature snapshots and active agent scoring. */
export class AddMarketDataTables1764504000000 implements MigrationInterface {
  name = 'AddMarketDataTables1764504000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "market_data_bars" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "datasetId" varchar NOT NULL,
        "provider" varchar NOT NULL DEFAULT ('manual'),
        "sourceRef" varchar,
        "symbol" varchar NOT NULL,
        "timeframe" varchar NOT NULL DEFAULT ('1d'),
        "timestamp" varchar NOT NULL,
        "availabilityTimestamp" varchar NOT NULL,
        "currency" varchar NOT NULL DEFAULT ('KRW'),
        "open" float NOT NULL,
        "high" float NOT NULL,
        "low" float NOT NULL,
        "close" float NOT NULL,
        "adjustedClose" float,
        "volume" float,
        "notes" text NOT NULL,
        "brokerExecutionEnabled" boolean NOT NULL DEFAULT (0),
        "liveTradingEnabled" boolean NOT NULL DEFAULT (0),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_market_data_bars_dataset_symbol_time"
          UNIQUE ("datasetId", "symbol", "timeframe", "timestamp")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_market_data_bars_dataset"
      ON "market_data_bars" ("datasetId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_market_data_bars_symbol"
      ON "market_data_bars" ("symbol")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "market_data_ingestion_runs" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "trigger" varchar NOT NULL DEFAULT ('manual'),
        "status" varchar NOT NULL,
        "provider" varchar NOT NULL DEFAULT ('stooq'),
        "datasetId" varchar NOT NULL,
        "symbols" text NOT NULL,
        "timeframe" varchar NOT NULL DEFAULT ('1d'),
        "currency" varchar NOT NULL DEFAULT ('KRW'),
        "windowStart" varchar NOT NULL,
        "windowEnd" varchar NOT NULL,
        "requestHash" varchar NOT NULL,
        "imported" integer NOT NULL DEFAULT (0),
        "replaced" integer NOT NULL DEFAULT (0),
        "latestAvailabilityTimestamp" varchar,
        "importedSymbols" text NOT NULL,
        "failedSymbols" text NOT NULL,
        "blockedReasons" text NOT NULL,
        "error" varchar,
        "brokerExecutionEnabled" boolean NOT NULL DEFAULT (0),
        "liveTradingEnabled" boolean NOT NULL DEFAULT (0),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_market_data_ingestion_runs_dataset"
      ON "market_data_ingestion_runs" ("datasetId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_market_data_ingestion_runs_dataset"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "market_data_ingestion_runs"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_market_data_bars_symbol"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_market_data_bars_dataset"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "market_data_bars"');
  }
}
