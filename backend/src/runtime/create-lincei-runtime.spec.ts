import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Repository } from 'typeorm';
import { createLinceiRuntime } from './create-lincei-runtime';
import { MarketDataBar } from '../entities/market-data-bar.entity';
import { FeatureSnapshot } from '../entities/feature-snapshot.entity';
import { AlphaDecision } from '../entities/alpha-decision.entity';
import { LlmEventFeature } from '../entities/llm-event-feature.entity';

describe('createLinceiRuntime', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('creates a framework-neutral runtime without booting Nest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lincei-runtime-'));
    const runtime = await createLinceiRuntime({
      databasePath: join(dir, 'runtime.sqlite'),
      synchronize: true,
      dropSchema: true,
      loadEnv: false,
    });

    try {
      expect(runtime.dataSource.isInitialized).toBe(true);
      expect(runtime.orchestrator).toBeDefined();
      expect(runtime.statusService).toBeDefined();
      expect(runtime.capitalEvidenceSliceService).toBeDefined();
      expect(runtime.activeLlmAgentService).toBeDefined();
      expect(runtime.activeLlmAgentShadowService).toBeDefined();
      expect(runtime.activeLlmPaperBridgeService).toBeDefined();
      expect(runtime.simulatedBrokerRehearsalService).toBeDefined();
    } finally {
      await runtime.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('can replay the alpha cycle without duplicate primary-key failures', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lincei-runtime-alpha-'));
    const openAiEnvPath = join(dir, 'openai.env');
    writeFileSync(openAiEnvPath, 'OPENAI_API_KEY=test-openai-key\n');
    process.env.LINCEI_OPENAI_ENV_FILE = openAiEnvPath;
    process.env.V1_UNIVERSE_SYMBOLS = 'SPY,QQQ';
    const runtime = await createLinceiRuntime({
      databasePath: join(dir, 'runtime.sqlite'),
      synchronize: true,
      dropSchema: true,
      loadEnv: false,
    });

    try {
      await seedBars(runtime.dataSource.getRepository(MarketDataBar));

      const first = await runtime.orchestrator.runAlphaCycle();
      const second = await runtime.orchestrator.runAlphaCycle();

      expect(first).toMatchObject({
        featureCount: 2,
        numericCount: 2,
        llmFeatureCount: 6,
        llmCount: 6,
        metaCount: 2,
      });
      expect(second).toEqual(first);
      await expect(
        runtime.dataSource.getRepository(FeatureSnapshot).count(),
      ).resolves.toBe(2);
      await expect(
        runtime.dataSource.getRepository(LlmEventFeature).count(),
      ).resolves.toBe(6);
      await expect(
        runtime.dataSource.getRepository(AlphaDecision).count(),
      ).resolves.toBe(10);
    } finally {
      await runtime.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);
});

async function seedBars(repository: Repository<MarketDataBar>) {
  const availabilityTimestamp = new Date(Date.now() - 60_000).toISOString();
  const symbols = ['SPY', 'QQQ'];
  const bars = symbols.flatMap((symbol) =>
    [3, 2, 1].map((daysAgo, index) => {
      const timestamp = new Date(
        Date.now() - daysAgo * 86_400_000,
      ).toISOString();
      const close = 100 + index * 2 + (symbol === 'QQQ' ? 5 : 0);
      return {
        datasetId: 'v1-lean-universe',
        provider: 'manual' as const,
        sourceRef: `test:${symbol}:${index}`,
        symbol,
        timeframe: '1d',
        timestamp,
        availabilityTimestamp,
        currency: 'USD',
        open: close - 1,
        high: close + 1,
        low: close - 2,
        close,
        adjustedClose: close,
        volume: 1_000_000 + index,
        notes: [],
        brokerExecutionEnabled: false,
        liveTradingEnabled: false,
      };
    }),
  );
  await repository.save(bars);
}
