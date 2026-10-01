import { describe, expect, it } from 'vitest';
import {
  compareFindings,
  compareRuns,
  compareScores,
  isComparableRunStatus,
  validateComparison,
  type ComparableFinding,
  type ComparableRun,
} from '../src';

function finding(
  ruleCode: string,
  severity = 'medium',
  category = 'seo',
  extra: Partial<ComparableFinding> = {},
): ComparableFinding {
  return {
    ruleCode,
    severity,
    category,
    title: `Title for ${ruleCode}`,
    scoreImpact: 5,
    ...extra,
  };
}

function run(
  id: string,
  scores: Record<string, number | null>,
  findings: ComparableFinding[],
  overrides: Partial<ComparableRun> = {},
): ComparableRun {
  return {
    runId: `run-${id}`,
    analysisId: `analysis-${id}`,
    websiteId: 'website-1',
    status: 'completed',
    createdAt: `2026-09-0${id}T10:00:00.000Z`,
    scores,
    findings,
    ...overrides,
  };
}

const SCORES_LEFT = {
  overall: 72,
  seo: 72,
  technical: 79,
  content: 81,
  accessibility: 94,
  performance: 91,
};

const SCORES_RIGHT = {
  overall: 87,
  seo: 82,
  technical: 86,
  content: 84,
  accessibility: 96,
  performance: 96,
};

describe('isComparableRunStatus', () => {
  it('accepts only completed and partially completed runs', () => {
    expect(isComparableRunStatus('completed')).toBe(true);
    expect(isComparableRunStatus('partially_completed')).toBe(true);
    expect(isComparableRunStatus('queued')).toBe(false);
    expect(isComparableRunStatus('running')).toBe(false);
    expect(isComparableRunStatus('failed')).toBe(false);
    expect(isComparableRunStatus('cancelled')).toBe(false);
  });
});

describe('validateComparison', () => {
  const base = { runId: 'run-1', websiteId: 'website-1', status: 'completed' };

  it('accepts two runs of the same website that are both comparable', () => {
    expect(validateComparison(base, { ...base, runId: 'run-2' })).toBeNull();
  });

  it('rejects selecting the same run twice', () => {
    expect(validateComparison(base, { ...base })).toBe('same_run');
  });

  it('rejects runs from different websites', () => {
    expect(
      validateComparison(base, { runId: 'run-2', websiteId: 'website-2', status: 'completed' }),
    ).toBe('different_website');
  });

  it('rejects incompatible run statuses', () => {
    expect(
      validateComparison(base, { runId: 'run-2', websiteId: 'website-1', status: 'running' }),
    ).toBe('incompatible_status');
    expect(
      validateComparison(
        { runId: 'run-1', websiteId: 'website-1', status: 'failed' },
        { runId: 'run-2', websiteId: 'website-1', status: 'completed' },
      ),
    ).toBe('incompatible_status');
  });
});

describe('compareScores', () => {
  it('computes the delta per category in a fixed order with overall first', () => {
    const changes = compareScores(
      { scores: SCORES_LEFT },
      { scores: SCORES_RIGHT },
    );
    expect(changes.map((change) => change.category)).toEqual([
      'overall',
      'seo',
      'technical',
      'content',
      'accessibility',
      'performance',
    ]);
    expect(changes[0]).toEqual({ category: 'overall', left: 72, right: 87, delta: 15 });
    expect(changes[1]).toEqual({ category: 'seo', left: 72, right: 82, delta: 10 });
    expect(changes[5]).toEqual({ category: 'performance', left: 91, right: 96, delta: 5 });
  });

  it('supports negative deltas', () => {
    const changes = compareScores(
      { scores: { overall: 90 } },
      { scores: { overall: 80 } },
    );
    expect(changes[0]?.delta).toBe(-10);
  });

  it('returns a null delta when either side has no score', () => {
    const changes = compareScores(
      { scores: { overall: 87 } },
      { scores: { overall: null } },
    );
    expect(changes[0]).toEqual({ category: 'overall', left: 87, right: null, delta: null });

    const missing = compareScores({ scores: {} }, { scores: {} });
    expect(missing[0]).toEqual({ category: 'overall', left: null, right: null, delta: null });
  });
});

describe('compareFindings', () => {
  it('classifies findings as new, resolved and unchanged by rule code', () => {
    const left = [
      finding('SEO_META_DESCRIPTION_MISSING', 'high'),
      finding('TECH_SECURITY_HEADER_MISSING', 'high'),
      finding('CONTENT_LOW_TEXT_LENGTH', 'medium'),
    ];
    const right = [
      finding('TECH_SECURITY_HEADER_MISSING', 'high'),
      finding('CONTENT_LOW_TEXT_LENGTH', 'medium'),
      finding('A11Y_IMAGE_ALT_MISSING', 'medium', 'accessibility'),
    ];

    const diff = compareFindings(left, right);

    expect(diff.new.map((change) => change.ruleCode)).toEqual(['A11Y_IMAGE_ALT_MISSING']);
    expect(diff.resolved.map((change) => change.ruleCode)).toEqual([
      'SEO_META_DESCRIPTION_MISSING',
    ]);
    expect(diff.unchanged.map((change) => change.ruleCode)).toEqual([
      'TECH_SECURITY_HEADER_MISSING',
      'CONTENT_LOW_TEXT_LENGTH',
    ]);
  });

  it('flags a less severe finding as improved and a more severe one as regressed', () => {
    const left = [
      finding('SEO_META_DESCRIPTION_MISSING', 'high'),
      finding('CONTENT_LOW_TEXT_LENGTH', 'medium'),
      finding('PERF_HTML_TOO_LARGE', 'low', 'performance'),
    ];
    const right = [
      finding('SEO_META_DESCRIPTION_MISSING', 'medium'),
      finding('CONTENT_LOW_TEXT_LENGTH', 'high'),
      finding('PERF_HTML_TOO_LARGE', 'low', 'performance'),
    ];

    const diff = compareFindings(left, right);
    const byCode = new Map(diff.unchanged.map((change) => [change.ruleCode, change]));

    expect(byCode.get('SEO_META_DESCRIPTION_MISSING')?.severityChange).toBe('improved');
    expect(byCode.get('CONTENT_LOW_TEXT_LENGTH')?.severityChange).toBe('regressed');
    expect(byCode.get('PERF_HTML_TOO_LARGE')?.severityChange).toBe('unchanged');
    expect(byCode.get('SEO_META_DESCRIPTION_MISSING')?.leftSeverity).toBe('high');
    expect(byCode.get('SEO_META_DESCRIPTION_MISSING')?.rightSeverity).toBe('medium');
  });

  it('never reports a severity transition for new or resolved findings', () => {
    const diff = compareFindings(
      [finding('RESOLVED_ONE', 'high')],
      [finding('NEW_ONE', 'high')],
    );
    expect(diff.new[0]?.severityChange).toBeNull();
    expect(diff.resolved[0]?.severityChange).toBeNull();
    expect(diff.new[0]?.leftSeverity).toBeNull();
    expect(diff.resolved[0]?.rightSeverity).toBeNull();
  });

  it('orders each section by severity then rule code deterministically', () => {
    const left: ComparableFinding[] = [];
    const right = [
      finding('B_LOW', 'low'),
      finding('A_CRITICAL', 'critical'),
      finding('C_MEDIUM', 'medium'),
      finding('D_HIGH', 'high'),
    ];

    const diff = compareFindings(left, right);
    expect(diff.new.map((change) => change.ruleCode)).toEqual([
      'A_CRITICAL',
      'D_HIGH',
      'C_MEDIUM',
      'B_LOW',
    ]);

    // Stable across repeated runs (no map-iteration nondeterminism).
    const again = compareFindings(left, right);
    expect(again).toEqual(diff);
  });

  it('handles empty finding sets', () => {
    expect(compareFindings([], [])).toEqual({ new: [], resolved: [], unchanged: [] });
    const resolved = compareFindings([finding('X')], []);
    expect(resolved.resolved).toHaveLength(1);
    expect(resolved.new).toHaveLength(0);
  });
});

describe('compareRuns', () => {
  it('returns refs, score changes, finding changes and a summary', () => {
    const left = run('1', SCORES_LEFT, [
      finding('SEO_META_DESCRIPTION_MISSING', 'high'),
      finding('CONTENT_LOW_TEXT_LENGTH', 'medium'),
    ]);
    const right = run('2', SCORES_RIGHT, [
      finding('CONTENT_LOW_TEXT_LENGTH', 'low'),
      finding('A11Y_IMAGE_ALT_MISSING', 'medium', 'accessibility'),
    ]);

    const comparison = compareRuns(left, right);

    expect(comparison.left).toMatchObject({ runId: 'run-1', overall: 72, status: 'completed' });
    expect(comparison.right).toMatchObject({ runId: 'run-2', overall: 87 });
    expect(comparison.scoreChanges[0]?.delta).toBe(15);
    expect(comparison.findingChanges.new).toHaveLength(1);
    expect(comparison.findingChanges.resolved).toHaveLength(1);
    expect(comparison.findingChanges.unchanged).toHaveLength(1);
    expect(comparison.summary).toEqual({
      newCount: 1,
      resolvedCount: 1,
      unchangedCount: 1,
      improvedCount: 1,
      regressedCount: 0,
    });
  });
});
