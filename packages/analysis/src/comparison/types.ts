/**
 * Domain types of run comparison.
 *
 * Comparison is a pure, deterministic projection over two persisted runs — it
 * is never stored. The types here are persistence-independent: an application
 * layer maps database rows (run + scores + findings) into
 * {@link ComparableRun} and receives a {@link RunComparison} back.
 */

export type ComparableRunStatus = 'completed' | 'partially_completed';

/** Categories compared side by side, in report order. `overall` comes first. */
export const COMPARISON_CATEGORIES = [
  'overall',
  'seo',
  'technical',
  'content',
  'accessibility',
  'performance',
] as const;

export type ComparisonCategory = (typeof COMPARISON_CATEGORIES)[number];

/**
 * The stable identity of a finding across runs is its rule code. Two runs can
 * never persist the same rule code twice (enforced by a uniqueness
 * constraint), so a rule code map is a lossless diff key.
 */
export interface ComparableFinding {
  ruleCode: string;
  category: string;
  severity: string;
  title: string;
  scoreImpact: number;
}

export interface ComparableRun {
  runId: string;
  analysisId: string;
  websiteId: string;
  status: ComparableRunStatus;
  createdAt: string;
  /** Category (incl. `overall`) → score. Missing categories are absent. */
  scores: Readonly<Record<string, number | null>>;
  findings: readonly ComparableFinding[];
}

export interface ComparableRunRef {
  runId: string;
  analysisId: string;
  status: ComparableRunStatus;
  createdAt: string;
  overall: number | null;
}

export interface ScoreChange {
  category: string;
  left: number | null;
  right: number | null;
  /** right − left; null when either side has no score for the category. */
  delta: number | null;
}

export type FindingChangeKind = 'new' | 'resolved' | 'unchanged';

/**
 * Severity direction of a finding present in both runs. Less severe on the
 * right is an improvement (HIGH → MEDIUM = improved); the reverse is a
 * regression. Computed deterministically, never by AI.
 */
export type SeverityTransition = 'improved' | 'regressed' | 'unchanged';

export interface FindingChange {
  ruleCode: string;
  category: string;
  title: string;
  leftSeverity: string | null;
  rightSeverity: string | null;
  change: FindingChangeKind;
  /** Set only for `unchanged` findings (present in both runs). */
  severityChange: SeverityTransition | null;
  scoreImpact: number;
}

export interface FindingChanges {
  new: FindingChange[];
  resolved: FindingChange[];
  unchanged: FindingChange[];
}

export interface ComparisonSummary {
  newCount: number;
  resolvedCount: number;
  unchangedCount: number;
  improvedCount: number;
  regressedCount: number;
}

export interface RunComparison {
  left: ComparableRunRef;
  right: ComparableRunRef;
  scoreChanges: ScoreChange[];
  findingChanges: FindingChanges;
  summary: ComparisonSummary;
}

/** Reasons two runs may not be compared. Mapped to HTTP errors by the API. */
export type ComparisonValidationError = 'same_run' | 'different_website' | 'incompatible_status';

export interface ComparableRunMetadata {
  runId: string;
  websiteId: string;
  status: string;
}
