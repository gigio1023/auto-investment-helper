/**
 * Builds deterministic feature snapshots from ingested bars.
 * Synthetic features are test-only (ALLOW_SYNTHETIC_FEATURES); production paths fail closed on thin history.
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeatureSnapshot } from '../../../entities/feature-snapshot.entity';
import type { FeatureSnapshotContract } from '../contracts/v1-pilot.contracts';
import { validateFeatureSnapshot } from '../contracts/v1-pilot.validators';
import { hashObject } from '../../../shared/hash.util';
import { MarketDataBar } from '../../../entities/market-data-bar.entity';
import {
  activeUniverseSymbols,
  resolveUniverseSelection,
} from '../universe/universe-manifest';

@Injectable()
export class FeatureSnapshotService {
  constructor(
    @InjectRepository(FeatureSnapshot)
    private readonly featureRepository: Repository<FeatureSnapshot>,
    @InjectRepository(MarketDataBar)
    private readonly marketDataRepository: Repository<MarketDataBar>,
  ) {}

  async buildSnapshotsForUniverse(
    datasetId = 'v1-lean-universe',
    options?: {
      allowSynthetic?: boolean;
      symbols?: string[];
      maxBarAgeHours?: number;
    },
  ): Promise<FeatureSnapshotContract[]> {
    const allowSynthetic =
      options?.allowSynthetic === true ||
      process.env.ALLOW_SYNTHETIC_FEATURES === 'true';
    const asOf = new Date().toISOString();
    const snapshots: FeatureSnapshotContract[] = [];

    const symbols = options?.symbols?.length
      ? resolveUniverseSelection({ overrideSymbols: options.symbols })
          .activeSymbols
      : activeUniverseSymbols();

    for (const symbol of symbols) {
      const bars = await this.marketDataRepository.find({
        where: { datasetId, symbol },
        order: { timestamp: 'DESC' },
        take: 260,
      });
      if (bars.length < 2 && !allowSynthetic) {
        throw new BadRequestException(
          `Insufficient market data for ${symbol}: need at least 2 daily bars in dataset "${datasetId}" (found ${bars.length}). Ingest bars or set ALLOW_SYNTHETIC_FEATURES=true for simulator/tests only.`,
        );
      }
      const latestBar = bars[0];
      if (latestBar && options?.maxBarAgeHours) {
        const latestTimestamp = new Date(latestBar.timestamp).getTime();
        const maxAgeMs = options.maxBarAgeHours * 3_600_000;
        if (Date.now() - latestTimestamp > maxAgeMs) {
          throw new BadRequestException(
            `Stale market data for ${symbol}: latest bar ${latestBar.timestamp} exceeds ${options.maxBarAgeHours}h max age for prospective decisions.`,
          );
        }
      }
      const features = this.computeFeatures(bars, allowSynthetic);
      const snapshot: FeatureSnapshotContract = {
        id: `feature-${symbol}-${asOf.slice(0, 10)}`,
        symbol,
        asOf,
        dataAvailabilityTime:
          bars[0]?.availabilityTimestamp ??
          new Date(Date.now() - 86_400_000).toISOString(),
        availableAt:
          bars[0]?.availabilityTimestamp ??
          new Date(Date.now() - 86_400_000).toISOString(),
        timeframe: 'daily',
        features,
        sourceRefs: bars.length
          ? [`market-data-bar:${bars[0].id}`]
          : [`synthetic:${symbol}`],
        inputHash: hashObject({ symbol, features, asOf }),
        featureVersion: 'v1',
      };
      validateFeatureSnapshot(snapshot);
      snapshots.push(snapshot);
      await this.featureRepository.upsert(
        this.featureRepository.create(snapshot),
        ['id'],
      );
    }

    return snapshots;
  }

  private computeFeatures(
    bars: MarketDataBar[],
    allowSynthetic: boolean,
  ): Record<string, number | string | boolean | null> {
    if (bars.length < 2) {
      if (!allowSynthetic) {
        throw new BadRequestException(
          'computeFeatures called without enough bars and synthetic features disabled',
        );
      }
      return {
        return_20d: 0.02,
        return_63d: 0.04,
        return_126d: 0.06,
        realized_vol_20d: 0.15,
        drawdown_63d: -0.03,
        price_vs_sma_200d: 1.01,
        dollar_volume_20d: 1_000_000,
        market_regime_score: 0.55,
      };
    }

    const closes = [...bars].reverse().map((bar) => bar.close);
    const latest = closes[closes.length - 1];
    const returnFor = (lookback: number): number => {
      const index = Math.max(0, closes.length - 1 - lookback);
      const base = closes[index] || latest;
      return base === 0 ? 0 : latest / base - 1;
    };
    const returns = closes.slice(-21).map((value, index, array) => {
      if (index === 0) {
        return 0;
      }
      const previous = array[index - 1];
      return previous === 0 ? 0 : value / previous - 1;
    });
    const mean =
      returns.reduce((sum, value) => sum + value, 0) /
      Math.max(returns.length, 1);
    const variance =
      returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      Math.max(returns.length, 1);
    const sma200 =
      closes.slice(-200).reduce((sum, value) => sum + value, 0) /
      Math.max(Math.min(closes.length, 200), 1);
    const peak = Math.max(...closes.slice(-63));
    const drawdown = peak === 0 ? 0 : latest / peak - 1;
    const dollarVolume =
      bars
        .slice(0, 20)
        .reduce((sum, bar) => sum + bar.close * (bar.volume ?? 0), 0) /
      Math.max(Math.min(bars.length, 20), 1);

    return {
      return_20d: Number(returnFor(20).toFixed(6)),
      return_63d: Number(returnFor(63).toFixed(6)),
      return_126d: Number(returnFor(126).toFixed(6)),
      realized_vol_20d: Number(Math.sqrt(variance * 252).toFixed(6)),
      drawdown_63d: Number(drawdown.toFixed(6)),
      price_vs_sma_200d: Number((latest / sma200).toFixed(6)),
      dollar_volume_20d: Number(dollarVolume.toFixed(2)),
      market_regime_score: Number((0.5 + returnFor(63) * 2).toFixed(6)),
    };
  }
}
