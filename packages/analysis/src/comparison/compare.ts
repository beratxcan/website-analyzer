/**
 * Deterministic comparison of two analysis runs.
 *
 * Both functions are pure: the same inputs always yield structurally
 * identical output, and every list is ordered by a total, stable key
 * (severity rank → rule code), so diffs are reproducible across requests.
 */
import { SEVERITY_ORDER, type Severity } from '../types';
import {
  COMPARISON_CATEGORIES,
  type ComparableFinding,
  type ComparableRun,
  type ComparableRunMetadata,
  type ComparableRunStatus,
  type ComparisonValidationError,
  type FindingChange,
  type FindingChanges,
  type RunComparison,
  type ScoreChange,
  type SeverityTransition,
} from './types';

/** Statuses of runs that carry a usable, complete-enough result to compare. */
export function isComparableRunStatus(status: string): status is ComparableRunStatus {
  return status === 'completed' || status === 'partially_completed';
}

/**
 * Domain rules for a valid comparison. Returns the first violation, or null.
 * Website/ownership resolution stays in the application layer; only the
 * deterministic rules live here.
 */
export function validateComparison(
  left: ComparableRunMetadata,
  right: ComparableRunMetadata,
): ComparisonValidationError | null {
  if (left.runId === right.runId) {
    return 'same_run';
  }
  if (left.websiteId !== right.websiteId) {
    return 'different_website';
  }
  if (!isComparableRunStatus(left.status) || !isComparableRunStatus(right.status)) {
    return 'incompatible_status';
  }
  return null;
}

/** Rank of a persisted severity string; unknown/null sort last. */
function severityRank(severity: string | null): number {
  if (severity === null) return 99;
  const index = SEVERITY_ORDER.indexOf(severity as Severity);
  return index === -1 ? SEVERITY_ORDER.length : index;
}

function severityTransition(leftSeverity: string, rightSeverity: string): SeverityTransition {
  const left = severityRank(leftSeverity);
  const right = severityRank(rightSeverity);
  if (right > left) return 'improved';
  if (right < left) return 'regressed';
  return 'unchanged';
}

/** Orders findings by severity then rule code for a stable, readable diff. */
function compareFindingOrder(
  aSeverity: string | null,
  bSeverity: string | null,
  aCode: string,
  bCode: string,
): number {
  return severityRank(aSeverity) - severityRank(bSeverity) || aCode.localeCompare(bCode);
}

/** Category scores (incl. `overall`) with their delta, in a fixed order. */
export function compareScores(
  left: Pick<ComparableRun, 'scores'>,
  right: Pick<ComparableRun, 'scores'>,
): ScoreChange[] {
  return COMPARISON_CATEGORIES.map((category) => {
    const leftScore = left.scores[category] ?? null;
    const rightScore = right.scores[category] ?? null;
    return {
      category,
      left: leftScore,
      right: rightScore,
      delta: leftScore !== null && rightScore !== null ? rightScore - leftScore : null,
    };
  });
}

/**
 * Diff of two finding sets keyed on the stable rule code:
 *
 * ```text
 * only in right → new
 * only in left  → resolved
 * in both       → unchanged (+ deterministic severity transition)
 * ```
 */
export function compareFindings(
  left: readonly ComparableFinding[],
  right: readonly ComparableFinding[],
): FindingChanges {
  const leftByCode = new Map(left.map((finding) => [finding.ruleCode, finding]));
  const rightByCode = new Map(right.map((finding) => [finding.ruleCode, finding]));

  const added: FindingChange[] = [];
  const resolved: FindingChange[] = [];
  const unchanged: FindingChange[] = [];

  for (const [ruleCode, finding] of rightByCode) {
    const previous = leftByCode.get(ruleCode);
    if (!previous) {
      added.push(toChange(ruleCode, finding, null, finding.severity, 'new'));
      continue;
    }
    unchanged.push(
      toChange(
        ruleCode,
        finding,
        previous.severity,
        finding.severity,
        'unchanged',
      ),
    );
  }

  for (const [ruleCode, finding] of leftByCode) {
    if (!rightByCode.has(ruleCode)) {
      resolved.push(toChange(ruleCode, finding, finding.severity, null, 'resolved'));
    }
  }

  added.sort((a, b) => compareFindingOrder(a.rightSeverity, b.rightSeverity, a.ruleCode, b.ruleCode));
  resolved.sort((a, b) =>
    compareFindingOrder(a.leftSeverity, b.leftSeverity, a.ruleCode, b.ruleCode),
  );
  unchanged.sort((a, b) =>
    compareFindingOrder(a.rightSeverity, b.rightSeverity, a.ruleCode, b.ruleCode),
  );

  return { new: added, resolved, unchanged };
}

function toChange(
  ruleCode: string,
  finding: ComparableFinding,
  leftSeverity: string | null,
  rightSeverity: string | null,
  change: FindingChange['change'],
): FindingChange {
  return {
    ruleCode,
    category: finding.category,
    title: finding.title,
    leftSeverity,
    rightSeverity,
    change,
    severityChange:
      change === 'unchanged' && leftSeverity !== null && rightSeverity !== null
        ? severityTransition(leftSeverity, rightSeverity)
        : null,
    scoreImpact: finding.scoreImpact,
  };
}

/** Full comparison of two runs: score deltas, finding diff and summary. */
export function compareRuns(left: ComparableRun, right: ComparableRun): RunComparison {
  const scoreChanges = compareScores(left, right);
  const findingChanges = compareFindings(left.findings, right.findings);
  const improvedCount = findingChanges.unchanged.filter(
    (finding) => finding.severityChange === 'improved',
  ).length;
  const regressedCount = findingChanges.unchanged.filter(
    (finding) => finding.severityChange === 'regressed',
  ).length;

  return {
    left: toRef(left),
    right: toRef(right),
    scoreChanges,
    findingChanges,
    summary: {
      newCount: findingChanges.new.length,
      resolvedCount: findingChanges.resolved.length,
      unchangedCount: findingChanges.unchanged.length,
      improvedCount,
      regressedCount,
    },
  };
}

function toRef(run: ComparableRun) {
  return {
    runId: run.runId,
    analysisId: run.analysisId,
    status: run.status,
    createdAt: run.createdAt,
    overall: run.scores.overall ?? null,
  };
}
