/**
 * API contracts for the analysis feature: user-facing analysis history,
 * per-attempt runs, persisted findings and score snapshots.
 */

export type AnalysisStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type AnalysisRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'cancelled';

export interface AnalysisWebsiteRef {
  id: string;
  name: string;
  url: string;
  host: string;
}

export interface AnalysisRunSummary {
  id: string;
  status: AnalysisRunStatus;
  attempt: number;
  progress: number;
  engineVersion: string;
  scoringVersion: string;
  errorCode: string | null;
  createdAt: string;
  completedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
}

export interface AnalysisSummary {
  id: string;
  websiteId: string;
  website: AnalysisWebsiteRef;
  status: AnalysisStatus;
  latestRunId: string | null;
  latestRunStatus: AnalysisRunStatus | null;
  latestScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisFindingDto {
  id: string;
  ruleCode: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  scoreImpact: number;
  evidence: unknown;
  createdAt: string;
}

export interface AnalysisScoreDto {
  category: string;
  score: number;
  weight: number | null;
}

export type AIResultStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface AISummaryDto {
  headline: string;
  overview: string;
  strengths: string[];
  weaknesses: string[];
}

export interface AIRecommendationDto {
  title: string;
  description: string;
  priority: string;
  effort: string;
  impact: string;
  category: string;
  relatedFindingCodes: string[];
}

/** AI enrichment state of a run — independent of the deterministic run status. */
export interface AIResultDto {
  status: AIResultStatus;
  task: string;
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  schemaVersion: string | null;
  summary: AISummaryDto | null;
  recommendations: AIRecommendationDto[] | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  latencyMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisRunDetail extends AnalysisRunSummary {
  analysisId: string;
  engineVersion: string;
  scoringVersion: string;
  startedAt: string | null;
  errorMessage: string | null;
  updatedAt: string;
  findings: AnalysisFindingDto[];
  scores: AnalysisScoreDto[];
  ai: AIResultDto | null;
}

export interface AnalysisListResponse {
  items: AnalysisSummary[];
}

export interface AnalysisRunListResponse {
  items: AnalysisRunSummary[];
}

export interface CreateAnalysisRequest {
  websiteId: string;
}

export interface CreateAnalysisResponse {
  analysis: AnalysisSummary;
  run: AnalysisRunSummary;
}

export interface CancelAnalysisResponse {
  analysis: AnalysisSummary;
}

export type FindingsSort = 'severity' | 'impact' | 'code' | 'newest';

export interface FindingsExplorerRequest {
  severity?: string;
  category?: string;
  search?: string;
  sort?: FindingsSort;
  page?: number;
  limit?: number;
}

export interface FindingsExplorerResponse {
  items: AnalysisFindingDto[];
  total: number;
  page: number;
  limit: number;
}