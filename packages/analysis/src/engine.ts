import { asError } from '@analyzer/shared';
import { WebsiteFetcher } from './fetcher/fetcher';
import type { NormalizedWebsiteDocument } from './document/document';
import { normalizeHtmlDocument } from './document/normalize';
import { AnalyzerRegistry } from './registry';
import { ScoringEngine, type CategoryScores } from './scoring';
import { severityWeight, type AnalysisStatus, type AnalyzerCategory, type Finding } from './types';
import type { Analyzer } from './analyzers/analyzer';

export const ANALYSIS_ENGINE_VERSION = '1.0.0';

export interface AnalyzerRunResult {
  analyzerId: string;
  category: AnalyzerCategory;
  analyzerVersion: string;
  status: 'completed' | 'failed';
  findings: Finding[];
  durationMs: number;
  error?: string;
}

export interface VersionMetadata {
  analysisEngineVersion: string;
  scoringVersion: string;
  analyzerVersions: Record<string, string>;
}

export interface AnalysisMetadata {
  url: string;
  finalUrl: string;
  statusCode: number;
  contentType: string | null;
  contentLength: number;
  redirectCount: number;
  responseDurationMs: number;
  fetchedAt: string;
  durationMs: number;
  engine: VersionMetadata;
}

export interface AnalysisResult {
  status: AnalysisStatus;
  metadata: AnalysisMetadata;
  findings: Finding[];
  categoryScores: CategoryScores;
  overallScore: number | null;
  analyzerResults: AnalyzerRunResult[];
}

export interface AnalysisEngineOptions {
  registry?: AnalyzerRegistry;
  fetcher?: WebsiteFetcher;
  scoring?: ScoringEngine;
}

/** Progress observation emitted during analysis. Non-business-critical. */
export interface AnalysisProgress {
  /** 0–100; roughly reflects the execution stage. */
  progress: number;
  stage: string;
}

export interface AnalyzeOptions {
  /** Called at safe stage boundaries; a throw aborts the analysis. */
  onProgress?: (progress: AnalysisProgress) => void;
}

/** Analyzer id → progress milestones (matching the worker's progress model). */
const ANALYZER_PROGRESS: Record<string, number> = {
  seo: 40,
  technical: 55,
  content: 70,
  accessibility: 82,
  performance: 94,
};

function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const bySeverity = severityWeight(a.severity) - severityWeight(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return a.code.localeCompare(b.code);
  });
}

/**
 * Orchestrates the deterministic analysis pipeline:
 *
 * ```text
 * URL → Fetcher → NormalizedDocument → Registry → Analyzers → Findings → Scores
 * ```
 *
 * The engine is persistence-independent; an application service decides how
 * to store the result. Analyzers run in isolation: one failing analyzer
 * never discards the others' results.
 */
export class AnalysisEngine {
  private readonly registry: AnalyzerRegistry;
  private readonly fetcher: WebsiteFetcher;
  private readonly scoring: ScoringEngine;

  constructor(options: AnalysisEngineOptions = {}) {
    this.registry = options.registry ?? AnalyzerRegistry.default();
    this.fetcher = options.fetcher ?? new WebsiteFetcher();
    this.scoring = options.scoring ?? new ScoringEngine();
  }

  /** Full pipeline: fetch the URL, normalize, analyze. */
  async analyze(url: string, options: AnalyzeOptions = {}): Promise<AnalysisResult> {
    options.onProgress?.({ progress: 10, stage: 'fetching' });
    const fetched = await this.fetcher.fetch(url);
    options.onProgress?.({ progress: 25, stage: 'parsing' });
    const document = normalizeHtmlDocument(fetched);
    return this.analyzeDocument(
      document,
      {
        url: fetched.url,
        finalUrl: fetched.finalUrl,
        statusCode: fetched.statusCode,
        contentType: fetched.contentType,
        contentLength: fetched.contentLength,
        redirectCount: fetched.redirectCount,
        responseDurationMs: fetched.responseDurationMs,
        fetchedAt: fetched.fetchTimestamp,
      },
      options,
    );
  }

  /** Analyzes an already-normalized document (used by tests and replay). */
  analyzeDocument(
    document: NormalizedWebsiteDocument,
    fetchMetadata?: Omit<AnalysisMetadata, 'durationMs' | 'engine'>,
    options: AnalyzeOptions = {},
  ): AnalysisResult {
    const startedAt = Date.now();
    const analyzerResults = this.registry.all.map((analyzer) => {
      const result = this.runAnalyzer(analyzer, document);
      const progress = ANALYZER_PROGRESS[analyzer.id];
      if (progress !== undefined) {
        options.onProgress?.({ progress, stage: analyzer.id });
      }
      return result;
    });
    const findings = sortFindings(analyzerResults.flatMap((result) => result.findings));
    const categoryScores = this.computeCategoryScores(analyzerResults);
    const overallScore = this.scoring.scoreOverall(categoryScores);
    const status: AnalysisStatus = analyzerResults.some((result) => result.status === 'failed')
      ? 'partially_completed'
      : 'completed';

    options.onProgress?.({ progress: 100, stage: 'completed' });

    return {
      status,
      metadata: {
        url: document.url,
        finalUrl: document.finalUrl,
        statusCode: document.statusCode,
        contentType: document.contentType,
        contentLength: document.contentLength,
        redirectCount: document.redirectCount,
        responseDurationMs: document.responseDurationMs,
        fetchedAt: document.fetchTimestamp,
        durationMs: Date.now() - startedAt,
        engine: this.versionMetadata(),
        ...(fetchMetadata ?? {}),
      },
      findings,
      categoryScores,
      overallScore,
      analyzerResults,
    };
  }

  private runAnalyzer(analyzer: Analyzer, document: NormalizedWebsiteDocument): AnalyzerRunResult {
    const startedAt = Date.now();
    try {
      const findings = analyzer.analyze(document);
      return {
        analyzerId: analyzer.id,
        category: analyzer.category,
        analyzerVersion: analyzer.version,
        status: 'completed',
        findings,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        analyzerId: analyzer.id,
        category: analyzer.category,
        analyzerVersion: analyzer.version,
        status: 'failed',
        findings: [],
        durationMs: Date.now() - startedAt,
        error: asError(error).message,
      };
    }
  }

  private computeCategoryScores(results: readonly AnalyzerRunResult[]): CategoryScores {
    const scores: CategoryScores = {};
    for (const result of results) {
      if (result.status === 'completed') {
        scores[result.category] = this.scoring.scoreCategory(result.category, result.findings);
      }
    }
    return scores;
  }

  private versionMetadata(): VersionMetadata {
    const analyzerVersions: Record<string, string> = {};
    for (const analyzer of this.registry.all) {
      analyzerVersions[analyzer.id] = analyzer.version;
    }
    return {
      analysisEngineVersion: ANALYSIS_ENGINE_VERSION,
      scoringVersion: this.scoring.version,
      analyzerVersions,
    };
  }
}

export type { FetchedWebsite } from './document/document';