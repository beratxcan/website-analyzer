/**
 * API contracts for comparing two completed analysis runs.
 *
 * Comparisons are computed at runtime and never persisted; the shapes here
 * mirror the deterministic comparison domain of `@analyzer/analysis`.
 */

export type ComparableRunStatus = 'completed' | 'partially_completed';

export type FindingChangeKind = 'new' | 'resolved' | 'unchanged';

export type SeverityTransition = 'improved' | 'regressed' | 'unchanged';

export interface ComparisonRunRefDto {
  runId: string;
  analysisId: string;
  status: ComparableRunStatus;
  createdAt: string;
  overall: number | null;
}

export interface ScoreChangeDto {
  category: string;
  left: number | null;
  right: number | null;
  /** right − left; null when either side lacks a score for the category. */
  delta: number | null;
}

export interface FindingChangeDto {
  ruleCode: string;
  category: string;
  title: string;
  leftSeverity: string | null;
  rightSeverity: string | null;
  change: FindingChangeKind;
  /** Only set for findings present in both runs. */
  severityChange: SeverityTransition | null;
  scoreImpact: number;
}

export interface FindingChangesDto {
  new: FindingChangeDto[];
  resolved: FindingChangeDto[];
  unchanged: FindingChangeDto[];
}

export interface ComparisonSummaryDto {
  newCount: number;
  resolvedCount: number;
  unchangedCount: number;
  improvedCount: number;
  regressedCount: number;
}

export interface ComparisonResultDto {
  left: ComparisonRunRefDto;
  right: ComparisonRunRefDto;
  scoreChanges: ScoreChangeDto[];
  findingChanges: FindingChangesDto;
  summary: ComparisonSummaryDto;
}

export interface CompareRunsRequest {
  leftRunId: string;
  rightRunId: string;
}
