/**
 * Coordinates the V1 validation loop invoked by repo scripts and the v1-pilot CLI.
 *
 * Order of operations follows SPEC.md: alpha -> LEAN backtest/import -> paper bridge
 * -> broker-write pre-trade risk check. Real-money broker writes remain blocked unless a future
 * user-approved spec changes the active scope. LEAN CLI is preferred; the local
 * simulator exists so CI and dev machines without Docker/LEAN can still prove artifact flow.
 */
import { Injectable, Logger } from '@nestjs/common';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { LeanAcceptanceMode } from './lean/lean-run-acceptance';
import { FeatureSnapshotService } from './alpha/feature-snapshot.service';
import { LlmEventFeatureService } from './alpha/llm-event-feature.service';
import { NumericAlphaService } from './alpha/numeric-alpha.service';
import { LlmAlphaService } from './alpha/llm-alpha.service';
import { MetaAlphaService } from './alpha/meta-alpha.service';
import { HuggingFaceSemanticEvidenceIngestService } from './alpha/huggingface-semantic-evidence-ingest.service';
import { LeanLocalSimulatorService } from './lean/lean-local-simulator.service';
import { LeanRunImportService } from './lean/lean-run-import.service';
import { ActiveLlmPaperBridgeService } from './paper/active-llm-paper-bridge.service';
import { LeanPaperBridgeService } from './paper/lean-paper-bridge.service';
import { LearningLoopService } from './learning/learning-loop.service';
import { LiveShadowService } from './live/live-shadow.service';
import { LivePreflightService } from './live/live-preflight.service';
import { LivePilot10UsdService } from './live/live-pilot-10usd.service';
import { MlPythonRunner } from './ml/ml-python.runner';
import { MlModelRegistryService } from './ml/ml-model-registry.service';
import { LeanCloudRunner } from './lean/lean-cloud.runner';
import { LeanCloudManualImporter } from './lean/lean-cloud-manual-importer';
import { LeanCliRunner } from './lean/lean-cli.runner';
import { ResearchFactoryService } from './research/research-factory.service';
import {
  LeanDataPreparationService,
  LeanLocalDataPreparationResult,
} from './lean/lean-data-preparation.service';
import { resolveUniverseSelection } from './universe/universe-manifest';

@Injectable()
export class V1PilotOrchestratorService {
  private readonly logger = new Logger(V1PilotOrchestratorService.name);

  constructor(
    private readonly featureSnapshotService: FeatureSnapshotService,
    private readonly llmEventFeatureService: LlmEventFeatureService,
    private readonly numericAlphaService: NumericAlphaService,
    private readonly llmAlphaService: LlmAlphaService,
    private readonly metaAlphaService: MetaAlphaService,
    private readonly huggingFaceSemanticEvidenceIngestService: HuggingFaceSemanticEvidenceIngestService,
    private readonly leanLocalSimulatorService: LeanLocalSimulatorService,
    private readonly leanRunImportService: LeanRunImportService,
    private readonly leanPaperBridgeService: LeanPaperBridgeService,
    private readonly activeLlmPaperBridgeService: ActiveLlmPaperBridgeService,
    private readonly learningLoopService: LearningLoopService,
    private readonly liveShadowService: LiveShadowService,
    private readonly livePreflightService: LivePreflightService,
    private readonly livePilot10UsdService: LivePilot10UsdService,
    private readonly mlPythonRunner: MlPythonRunner,
    private readonly mlModelRegistryService: MlModelRegistryService,
    private readonly leanCloudRunner: LeanCloudRunner,
    private readonly leanCloudManualImporter: LeanCloudManualImporter,
    private readonly leanCliRunner: LeanCliRunner,
    private readonly researchFactoryService: ResearchFactoryService,
    private readonly leanDataPreparationService: LeanDataPreparationService,
  ) {}

  async trainMlBaseline(): Promise<Record<string, unknown>> {
    return this.mlPythonRunner.runTraining();
  }

  async downloadExternalBaselines(): Promise<Record<string, unknown>> {
    return this.mlPythonRunner.runExternalBaselineDownload();
  }

  /**
   * End-to-end local LEAN evidence path: optional Stooq ingest, alpha export,
   * Lean CLI execution, and DB import. This is a debugging/supporting path;
   * Cloud-imported QuantConnect artifacts remain promotion evidence.
   */
  async runFullBacktest(
    options: {
      skipAlphaCycle?: boolean;
      downloadData?: boolean;
      ingestUniverseBars?: boolean;
      validationMode?: string;
      noStaticMeta?: boolean;
      noStaticMl?: boolean;
      backtestTimeoutMs?: number;
    } = {},
  ): Promise<Record<string, unknown>> {
    const repoRoot = resolve(process.cwd(), '..');
    const steps: Record<string, unknown> = {};
    const noStaticMeta = options.noStaticMeta ?? true;
    const noStaticMl = options.noStaticMl ?? true;
    const universeSelection = resolveUniverseSelection();
    const universeSymbols = universeSelection.activeSymbols;
    const shouldRunAlphaCycle =
      options.skipAlphaCycle !== true && (!noStaticMeta || !noStaticMl);
    const validationMode =
      options.validationMode ??
      (noStaticMeta && noStaticMl ? 'historical-research' : 'flow-validation');
    const usesStaticMetaOverlay = !noStaticMeta;
    const usesStaticMlPredictions = !noStaticMl;
    const alphaMode = noStaticMeta ? 'numeric-only' : 'meta-overlay';

    const localDataPreparation =
      await this.leanDataPreparationService.prepareLocalDailyData({
        ingestUniverseBars: options.ingestUniverseBars,
      });
    steps.localLeanDataPreparation = localDataPreparation;
    if (
      options.downloadData === false &&
      localDataPreparation.status !== 'ready'
    ) {
      throw new Error(
        `Local LEAN daily data is blocked: ${localDataPreparation.blockers.join('; ')}`,
      );
    }

    if (shouldRunAlphaCycle) {
      steps.alphaCycle = await this.runAlphaCycle();
    }

    if (validationMode === 'flow-validation') {
      this.logger.warn(
        '[v1-pilot] validationMode=flow-validation: static Nest alpha/ML overlay is pipeline proof only, not historical performance validation.',
      );
    }

    const leanResult = this.leanCliRunner.runBacktest({
      downloadData: options.downloadData !== false,
      validationMode,
      usesStaticMetaOverlay,
      usesStaticMlPredictions,
      noStaticMeta,
      noStaticMl,
      alphaMode,
      universeSymbols,
      universeProfile: universeSelection.profile,
      requireStrategyEvidence: true,
      timeoutMs: options.backtestTimeoutMs,
    });
    steps.leanBacktest = leanResult;
    steps.universeSelection = universeSelection;

    const artifactsRoot = join(repoRoot, 'artifacts/lean-runs');
    this.writeLeanLatestMarker(artifactsRoot, '.latest', leanResult.runId);
    this.writeLeanLatestMarker(
      artifactsRoot,
      '.latest-strategy',
      leanResult.runId,
    );
    steps.import = await this.leanRunImportService.importFromDirectory(
      leanResult.outputDirectory,
      undefined,
      { acceptanceMode: 'strategy-backtest' },
    );

    return {
      status: 'completed',
      runId: leanResult.runId,
      mode: leanResult.mode,
      validation: {
        validationMode,
        usesStaticMetaOverlay,
        usesStaticMlPredictions,
        noStaticMeta,
        noStaticMl,
        alphaMode,
      },
      steps,
    };
  }

  getMlModelStatus(): { status: string; modelName?: string; blocker?: string } {
    const readiness = this.mlModelRegistryService.getModelReadiness();
    return {
      status: readiness.status,
      modelName: readiness.modelName,
      blocker: readiness.blocker,
    };
  }

  async prepareLeanLocalData(
    options: {
      ingestUniverseBars?: boolean;
    } = {},
  ): Promise<LeanLocalDataPreparationResult> {
    return this.leanDataPreparationService.prepareLocalDailyData(options);
  }

  async runAlphaCycle(): Promise<{
    featureCount: number;
    numericCount: number;
    llmFeatureCount: number;
    llmCount: number;
    metaCount: number;
    featureIds: string[];
    numericDecisionIds: string[];
    llmFeatureIds: string[];
    llmDecisionIds: string[];
    metaDecisionIds: string[];
  }> {
    const snapshots =
      await this.featureSnapshotService.buildSnapshotsForUniverse(
        'v1-lean-universe',
        { allowSynthetic: false },
      );
    const numeric = await this.numericAlphaService.buildDecisions(snapshots);
    const llmFeatures = await this.llmEventFeatureService.buildFeatures(
      snapshots,
      numeric,
    );
    const llm = await this.llmAlphaService.buildDecisions(
      snapshots,
      numeric,
      llmFeatures,
    );
    const meta = await this.metaAlphaService.combine(snapshots, numeric, llm);
    return {
      featureCount: snapshots.length,
      numericCount: numeric.length,
      llmFeatureCount: llmFeatures.length,
      llmCount: llm.length,
      metaCount: meta.length,
      featureIds: snapshots.map((snapshot) => snapshot.id),
      numericDecisionIds: numeric.map((decision) => decision.id),
      llmFeatureIds: llmFeatures.map((feature) => feature.id),
      llmDecisionIds: llm.map((decision) => decision.id),
      metaDecisionIds: meta.map((decision) => decision.id),
    };
  }

  async ingestSemanticEvidence(options: {
    source?: 'hf-fomc-statements-minutes';
    limit?: number;
    sourcePath?: string;
  }) {
    return this.huggingFaceSemanticEvidenceIngestService.ingest(options);
  }

  async buildHypothesisRegistry(options: {
    indexPath?: string;
    strategyRegisterPath?: string;
  }) {
    return this.researchFactoryService.ingestAlphaArchitectCorpus(options);
  }

  async runSelectedRunBiasCheck(options: {
    targetRef?: string;
    hypothesisId?: string;
    minVariantCount?: number;
  }) {
    return this.researchFactoryService.checkSelectedRunBias(options);
  }

  async runLeanBacktest(
    projectName: string,
  ): Promise<{ runId: string; mode: string }> {
    if (projectName !== 'aggressive_llm_momentum') {
      throw new Error(`Unsupported LEAN project: ${projectName}`);
    }

    const repoRoot = resolve(process.cwd(), '..');
    const preferSimulator = process.env.LEAN_ALLOW_SIMULATOR === 'true';

    if (preferSimulator) {
      const workspaceRoot = join(repoRoot, 'engines/lean', projectName);
      const metaDecisionsPath = join(
        workspaceRoot,
        'input/meta_decisions.json',
      );
      const result = this.leanLocalSimulatorService.simulateRun({
        projectName,
        workspaceRoot,
        resultRoot: join(repoRoot, 'artifacts/lean-runs'),
        metaDecisionsPath: existsSync(metaDecisionsPath)
          ? metaDecisionsPath
          : join(workspaceRoot, 'input/meta_decisions.json.example'),
      });
      const artifactsRoot = join(repoRoot, 'artifacts/lean-runs');
      this.writeLeanLatestMarker(artifactsRoot, '.latest', result.runId);
      this.writeLeanLatestMarker(
        artifactsRoot,
        '.latest-simulator',
        result.runId,
      );
      return { runId: result.runId, mode: 'simulator' };
    }

    const result = this.leanCliRunner.runBacktest({ projectName });
    const artifactsRoot = join(repoRoot, 'artifacts/lean-runs');
    this.writeLeanLatestMarker(artifactsRoot, '.latest', result.runId);
    return { runId: result.runId, mode: result.mode };
  }

  async runQuantConnectCloudBacktest(
    projectName = 'aggressive_llm_momentum',
    options: { push?: boolean } = {},
  ) {
    return this.leanCloudRunner.runCloudBacktest({
      projectName,
      push: options.push,
    });
  }

  async importQuantConnectCloudBacktest(input: {
    projectName?: string;
    projectId?: number;
    backtestId: string;
  }) {
    return this.leanCloudManualImporter.importCloudBacktest(input);
  }

  async listQuantConnectCloudProjects(options: { limit?: number } = {}) {
    return this.leanCloudManualImporter.listCloudProjects(options);
  }

  async listQuantConnectCloudBacktests(options: {
    projectId?: number;
    projectName?: string;
    limit?: number;
  }) {
    return this.leanCloudManualImporter.listCloudBacktests(options);
  }

  async syncQuantConnectObjectStore(key: string, sourcePath: string) {
    return this.leanCloudRunner.syncObjectStore(key, sourcePath);
  }

  async importLeanRun(
    target: string,
    options: { acceptanceMode?: LeanAcceptanceMode } = {
      acceptanceMode: 'strategy-backtest',
    },
  ) {
    const repoRoot = resolve(process.cwd(), '..');
    const artifactsRoot = join(repoRoot, 'artifacts/lean-runs');
    if (target === 'latest') {
      const latestMarker =
        options.acceptanceMode === 'schema-import'
          ? '.latest'
          : '.latest-strategy';
      if (!existsSync(join(artifactsRoot, latestMarker))) {
        throw new Error(
          `No ${latestMarker} LEAN run marker found. Run run-full-backtest first for strategy evidence.`,
        );
      }
      return this.leanRunImportService.importLatestFromArtifactsRoot(
        artifactsRoot,
        { ...options, latestMarker },
      );
    }
    return this.leanRunImportService.importFromDirectory(
      join(artifactsRoot, target),
      undefined,
      options,
    );
  }

  async runPaperCycle() {
    return this.leanPaperBridgeService.runPaperCycle();
  }

  async runPaperReplay() {
    return this.leanPaperBridgeService.runPaperReplay();
  }

  async runActiveLlmPaperCycle(
    options: { runId?: string; maxActions?: number } = {},
  ) {
    return this.activeLlmPaperBridgeService.runPaperCycle(options);
  }

  async runLiveShadow() {
    return this.liveShadowService.runLiveShadow();
  }

  async runLearningLoop() {
    return this.learningLoopService.runLearningLoop();
  }

  async runLivePreflight() {
    return this.livePreflightService.runPreflight();
  }

  async runLivePilot10Usd(confirmRealMoney: boolean) {
    return this.livePilot10UsdService.execute({ confirmRealMoney });
  }

  private writeLeanLatestMarker(
    artifactsRoot: string,
    markerName: string,
    runId: string,
  ): void {
    mkdirSync(artifactsRoot, { recursive: true });
    writeFileSync(join(artifactsRoot, markerName), `${runId}\n`, 'utf8');
  }
}
