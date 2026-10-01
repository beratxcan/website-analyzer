/**
 * API contracts for the professional report.
 *
 * `ReportDocumentDto` is the JSON projection of the framework-independent
 * `ReportDocument`; the PDF endpoint renders exactly the same model, so the
 * two representations can never diverge.
 */

export type ReportKind = 'analysis' | 'comparison';

export type ReportRunStatus = 'completed' | 'partially_completed';

export type ReportAIStatus = 'completed' | 'failed' | 'skipped' | 'pending' | 'running' | null;

export interface ReportMetadataDto {
  title: string;
  websiteName: string;
  websiteHost: string;
  websiteUrl: string;
  analysisDate: string;
  generatedAt: string;
  analysisId: string;
  runId: string;
  runStatus: ReportRunStatus;
  engineVersion: string;
  scoringVersion: string;
  aiStatus: ReportAIStatus;
}

export interface ReportScoreDto {
  category: string;
  score: number | null;
  weight: number | null;
}

export interface ReportScoreSummaryDto {
  overall: number | null;
  categories: ReportScoreDto[];
}

export interface ReportFindingDto {
  ruleCode: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  scoreImpact: number;
  evidence: string[];
}

export interface ReportRecommendationDto {
  title: string;
  description: string;
  priority: string;
  impact: string;
  effort: string;
  category: string;
  relatedFindingCodes: string[];
}

export interface ReportExecutiveSummaryDto {
  headline: string;
  overview: string;
  strengths: string[];
  weaknesses: string[];
  /** `ai` when a validated AI summary existed, else the deterministic fallback. */
  source: 'ai' | 'deterministic';
}

export interface ReportScoreChangeDto {
  category: string;
  left: number | null;
  right: number | null;
  delta: number | null;
}

export interface ReportFindingChangeDto {
  ruleCode: string;
  title: string;
  category: string;
  leftSeverity: string | null;
  rightSeverity: string | null;
  change: 'new' | 'resolved' | 'unchanged';
  severityChange: 'improved' | 'regressed' | 'unchanged' | null;
}

export interface ReportComparisonDto {
  leftRunId: string;
  rightRunId: string;
  leftDate: string;
  rightDate: string;
  leftScore: number | null;
  rightScore: number | null;
  overallDelta: number | null;
  scoreChanges: ReportScoreChangeDto[];
  resolved: ReportFindingChangeDto[];
  new: ReportFindingChangeDto[];
  improved: ReportFindingChangeDto[];
  regressed: ReportFindingChangeDto[];
  summary: {
    newCount: number;
    resolvedCount: number;
    unchangedCount: number;
    improvedCount: number;
    regressedCount: number;
  };
}

export interface ReportDocumentDto {
  metadata: ReportMetadataDto;
  executiveSummary: ReportExecutiveSummaryDto;
  scoreSummary: ReportScoreSummaryDto;
  criticalFindings: ReportFindingDto[];
  additionalFindings: ReportFindingDto[];
  recommendations: ReportRecommendationDto[];
  comparison: ReportComparisonDto | null;
}
