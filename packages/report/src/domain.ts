/**
 * The professional report is a pure projection of an analysis run.
 *
 * ```text
 * AnalysisRun (+ findings, scores, AI result, optional comparison)
 *        ↓
 *   ReportBuilder
 *        ↓
 *   ReportDocument          ← the ONLY input a renderer may consume
 *        ↓
 *   PdfReportRenderer       ← never touches a database or Prisma
 * ```
 *
 * The model is deliberately persistence-neutral, bounded and deterministic:
 * the same {@link ReportDocument} always renders to the same bytes.
 */
import type { RunComparison } from '@analyzer/analysis';

export type ReportRunStatus = 'completed' | 'partially_completed';

export type ReportAIStatus = 'completed' | 'failed' | 'skipped' | 'pending' | 'running' | null;

export interface ReportMetadata {
  title: string;
  websiteName: string;
  websiteHost: string;
  websiteUrl: string;
  /** ISO timestamp of the analysis (run completion, falling back to creation). */
  analysisDate: string;
  /** ISO timestamp of document generation; fixes PDF metadata determinism. */
  generatedAt: string;
  analysisId: string;
  runId: string;
  runStatus: ReportRunStatus;
  engineVersion: string;
  scoringVersion: string;
  aiStatus: ReportAIStatus;
}

export interface ReportScore {
  category: string;
  score: number | null;
  weight: number | null;
}

export interface ReportScoreSummary {
  overall: number | null;
  categories: ReportScore[];
}

export interface ReportFinding {
  ruleCode: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  scoreImpact: number;
  /** Compact, sanitized, human-readable evidence lines. */
  evidence: string[];
}

export interface ReportRecommendation {
  title: string;
  description: string;
  priority: string;
  impact: string;
  effort: string;
  category: string;
  relatedFindingCodes: string[];
}

export interface ReportExecutiveSummary {
  headline: string;
  overview: string;
  strengths: string[];
  weaknesses: string[];
  /** `ai` when a validated AI summary was available, else the deterministic fallback. */
  source: 'ai' | 'deterministic';
}

export interface ReportScoreChange {
  category: string;
  left: number | null;
  right: number | null;
  delta: number | null;
}

export interface ReportFindingChange {
  ruleCode: string;
  title: string;
  category: string;
  leftSeverity: string | null;
  rightSeverity: string | null;
  change: 'new' | 'resolved' | 'unchanged';
  severityChange: 'improved' | 'regressed' | 'unchanged' | null;
}

export interface ReportComparison {
  leftRunId: string;
  rightRunId: string;
  leftDate: string;
  rightDate: string;
  leftScore: number | null;
  rightScore: number | null;
  overallDelta: number | null;
  scoreChanges: ReportScoreChange[];
  resolved: ReportFindingChange[];
  new: ReportFindingChange[];
  improved: ReportFindingChange[];
  regressed: ReportFindingChange[];
  summary: {
    newCount: number;
    resolvedCount: number;
    unchangedCount: number;
    improvedCount: number;
    regressedCount: number;
  };
}

export interface ReportDocument {
  metadata: ReportMetadata;
  executiveSummary: ReportExecutiveSummary;
  scoreSummary: ReportScoreSummary;
  /** Prioritized for the reader: critical and high findings first. */
  criticalFindings: ReportFinding[];
  /** Medium findings, when they add value; low findings are intentionally omitted. */
  additionalFindings: ReportFinding[];
  recommendations: ReportRecommendation[];
  comparison: ReportComparison | null;
}

/**
 * Persistence-neutral input of the builder. An application layer maps its
 * rows into this shape; the report package never queries anything.
 */
export interface ReportSource {
  analysisId: string;
  runId: string;
  runStatus: ReportRunStatus;
  engineVersion: string;
  scoringVersion: string;
  runCreatedAt: string;
  runCompletedAt: string | null;
  website: {
    name: string;
    host: string;
    url: string;
  };
  scores: ReadonlyArray<{ category: string; score: number; weight: number | null }>;
  findings: ReadonlyArray<{
    ruleCode: string;
    category: string;
    severity: string;
    title: string;
    description: string;
    scoreImpact: number;
    evidence: unknown;
  }>;
  ai: {
    status: Exclude<ReportAIStatus, null>;
    summary: {
      headline: string;
      overview: string;
      strengths: string[];
      weaknesses: string[];
    } | null;
    recommendations: ReportRecommendation[] | null;
  } | null;
  /** Precomputed deterministic diff, when the report is a comparison report. */
  comparison?: RunComparison | null;
}
