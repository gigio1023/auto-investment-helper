import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import {
  UniverseInstrument,
  UniverseManifest,
  UniverseProfile,
  UniverseSelectionOptions,
  UniverseSelectionReport,
} from './universe-manifest.types';

const DEFAULT_MANIFEST_RELATIVE_PATH = 'config/universes/quality-gated-v2.json';
const LEAN_RUNTIME_MANIFEST_RELATIVE_PATH =
  'engines/lean/aggressive_llm_momentum/input/universe_manifest.runtime.json';

export function resolveUniverseSelection(
  options: UniverseSelectionOptions = {},
): UniverseSelectionReport {
  const manifestPath = resolveManifestPath(options.manifestPath);
  const manifest = loadUniverseManifest(manifestPath);
  const profileName =
    options.profile ??
    process.env.V1_UNIVERSE_PROFILE ??
    manifest.defaultProfile;
  const envAllowLeveraged =
    process.env.V1_ALLOW_LEVERAGED_ETF === undefined
      ? undefined
      : process.env.V1_ALLOW_LEVERAGED_ETF === 'true';
  const allowLeveragedEtf =
    options.allowLeveragedEtf ??
    envAllowLeveraged ??
    manifest.rules?.defaultAllowLeveragedEtf ??
    false;
  const profile = resolveProfile(manifest, profileName);
  const instruments = indexInstruments(manifest);
  const overrideSymbols = options.overrideSymbols
    ? uniqueSymbols(options.overrideSymbols)
    : parseSymbols(process.env.V1_UNIVERSE_SYMBOLS);

  validateProfile(profile, instruments, allowLeveragedEtf);

  const activeSymbols = overrideSymbols.length
    ? validateOverrideSymbols(
        manifest,
        instruments,
        overrideSymbols,
        allowLeveragedEtf,
      )
    : (profile.activeSymbols ?? []);

  validateActiveSymbols(instruments, activeSymbols, allowLeveragedEtf);

  return {
    manifestId: manifest.id,
    manifestPath,
    profile: profile.name,
    asOf: manifest.asOf,
    generatedAt: new Date().toISOString(),
    activeSymbols,
    benchmarkSymbols: profile.benchmarkSymbols ?? [],
    watchlistSymbols: profile.watchlistSymbols ?? [],
    hardExcludedSymbols: manifest.instruments
      .filter((instrument) => instrument.status === 'hard_excluded')
      .map((instrument) => instrument.symbol),
    tacticalDisabledSymbols: manifest.instruments
      .filter((instrument) => instrument.status === 'tactical_disabled')
      .map((instrument) => instrument.symbol),
    symbolCaps: symbolCapsFor(instruments, activeSymbols),
    sleeveBySymbol: sleeveBySymbolFor(instruments, activeSymbols),
    sleeveCaps: manifest.sleeveCaps,
    etfSymbols: activeSymbols.filter(
      (symbol) => instruments.get(symbol)?.assetType === 'etf',
    ),
    minimumStartDate: profile.minimumStartDate,
    allowLeveragedEtf,
    overrideSymbols: overrideSymbols.length ? overrideSymbols : undefined,
    taxContext: {
      operatorTaxResidence: 'KR',
      listedMarket: 'US',
      notes: [
        'Track realized gains, dividends, withholding, and turnover in research reports; this is not tax advice.',
        'Korea and U.S. tax rules can change, so verify NTS and treaty references before relying on reports.',
      ],
    },
  };
}

export function activeUniverseSymbols(): string[] {
  return resolveUniverseSelection().activeSymbols;
}

export function prepareLeanRuntimeUniverseManifest(): string {
  const source = resolveManifestPath();
  const target = join(repoRoot(), LEAN_RUNTIME_MANIFEST_RELATIVE_PATH);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  return target;
}

export function leanRuntimeUniverseManifestParameter(): string {
  return 'input/universe_manifest.runtime.json';
}

export function writeUniverseSelectionReport(
  outputDirectory: string,
  report: UniverseSelectionReport,
): void {
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(
    join(outputDirectory, 'universe-selection-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

function loadUniverseManifest(manifestPath: string): UniverseManifest {
  if (!existsSync(manifestPath)) {
    throw new Error(`Universe manifest not found: ${manifestPath}`);
  }
  const manifest = JSON.parse(
    readFileSync(manifestPath, 'utf8'),
  ) as UniverseManifest;
  if (!manifest.id || !Array.isArray(manifest.instruments)) {
    throw new Error(`Invalid universe manifest: ${manifestPath}`);
  }
  return manifest;
}

function resolveManifestPath(explicitPath?: string): string {
  const configured =
    explicitPath ??
    process.env.V1_UNIVERSE_MANIFEST ??
    DEFAULT_MANIFEST_RELATIVE_PATH;
  return isAbsolute(configured) ? configured : join(repoRoot(), configured);
}

function repoRoot(): string {
  const cwd = process.cwd();
  return cwd.endsWith('/backend') ? resolve(cwd, '..') : cwd;
}

function resolveProfile(
  manifest: UniverseManifest,
  profileName: string,
): UniverseProfile {
  const profile = manifest.profiles.find(
    (candidate) => candidate.name === profileName,
  );
  if (!profile) {
    throw new Error(`Unknown universe profile: ${profileName}`);
  }
  if (!profile.extends) {
    return normalizeProfile(profile);
  }
  const parent = resolveProfile(manifest, profile.extends);
  return normalizeProfile({
    ...profile,
    activeSymbols: mergeSymbols(
      parent.activeSymbols,
      profile.activeSymbols,
      profile.activeAdd,
    ),
    benchmarkSymbols: mergeSymbols(
      parent.benchmarkSymbols,
      profile.benchmarkSymbols,
    ),
    watchlistSymbols: mergeSymbols(
      parent.watchlistSymbols,
      profile.watchlistSymbols,
    ),
    minimumStartDate: maxDate(
      parent.minimumStartDate,
      profile.minimumStartDate,
    ),
  });
}

function normalizeProfile(profile: UniverseProfile): UniverseProfile {
  return {
    ...profile,
    activeSymbols: uniqueSymbols(profile.activeSymbols ?? []),
    benchmarkSymbols: uniqueSymbols(profile.benchmarkSymbols ?? []),
    watchlistSymbols: uniqueSymbols(profile.watchlistSymbols ?? []),
  };
}

function indexInstruments(
  manifest: UniverseManifest,
): Map<string, UniverseInstrument> {
  return new Map(
    manifest.instruments.map((instrument) => [
      instrument.symbol.toUpperCase(),
      { ...instrument, symbol: instrument.symbol.toUpperCase() },
    ]),
  );
}

function validateProfile(
  profile: UniverseProfile,
  instruments: Map<string, UniverseInstrument>,
  allowLeveragedEtf: boolean,
): void {
  if (profile.requiresAllowLeveragedEtf && !allowLeveragedEtf) {
    throw new Error(
      `Universe profile ${profile.name} requires V1_ALLOW_LEVERAGED_ETF=true.`,
    );
  }
  validateActiveSymbols(
    instruments,
    profile.activeSymbols ?? [],
    allowLeveragedEtf,
  );
}

function validateActiveSymbols(
  instruments: Map<string, UniverseInstrument>,
  symbols: string[],
  allowLeveragedEtf: boolean,
): void {
  for (const symbol of symbols) {
    const instrument = instruments.get(symbol);
    if (!instrument) {
      throw new Error(
        `Universe symbol ${symbol} is not declared in the manifest.`,
      );
    }
    if (instrument.status === 'hard_excluded') {
      throw new Error(
        `Universe symbol ${symbol} is hard excluded: ${
          instrument.exclusionReason ?? 'no reason recorded'
        }`,
      );
    }
    if (instrument.requiresAllowLeveragedEtf && !allowLeveragedEtf) {
      throw new Error(
        `Universe symbol ${symbol} requires V1_ALLOW_LEVERAGED_ETF=true.`,
      );
    }
  }
}

function validateOverrideSymbols(
  manifest: UniverseManifest,
  instruments: Map<string, UniverseInstrument>,
  symbols: string[],
  allowLeveragedEtf: boolean,
): string[] {
  const allowedStatuses = new Set(
    manifest.rules?.debugOverrideAllowedStatuses ?? [
      'active',
      'benchmark',
      'watchlist',
    ],
  );
  validateActiveSymbols(instruments, symbols, allowLeveragedEtf);
  for (const symbol of symbols) {
    const instrument = instruments.get(symbol);
    if (!instrument || !allowedStatuses.has(instrument.status)) {
      throw new Error(
        `Universe override rejected for ${symbol}: status is not tradable.`,
      );
    }
  }
  return symbols;
}

function symbolCapsFor(
  instruments: Map<string, UniverseInstrument>,
  symbols: string[],
): Record<string, number> {
  return Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      instruments.get(symbol)?.maxPositionPct ?? 0.08,
    ]),
  );
}

function sleeveBySymbolFor(
  instruments: Map<string, UniverseInstrument>,
  symbols: string[],
): Record<string, string> {
  return Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      instruments.get(symbol)?.sleeve ?? 'unclassified',
    ]),
  );
}

function parseSymbols(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return uniqueSymbols(raw.split(','));
}

function uniqueSymbols(symbols: string[]): string[] {
  return [
    ...new Set(
      symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
    ),
  ];
}

function mergeSymbols(
  base: string[] | undefined,
  replacement?: string[],
  additions?: string[],
): string[] {
  return uniqueSymbols([...(replacement ?? base ?? []), ...(additions ?? [])]);
}

function maxDate(left?: string, right?: string): string | undefined {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return left > right ? left : right;
}
