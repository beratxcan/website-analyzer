import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ComparisonResultDto } from '@analyzer/contracts';
import { ComparisonSummary } from '../src/components/comparison/comparison-summary';
import { FindingChanges } from '../src/components/comparison/finding-changes';

function makeComparison(overrides: Partial<ComparisonResultDto> = {}): ComparisonResultDto {
  return {
    left: {
      runId: 'run-left',
      analysisId: 'analysis-left',
      status: 'completed',
      createdAt: '2026-09-01T10:00:00.000Z',
      overall: 72,
    },
    right: {
      runId: 'run-right',
      analysisId: 'analysis-right',
      status: 'completed',
      createdAt: '2026-09-06T10:00:00.000Z',
      overall: 87,
    },
    scoreChanges: [
      { category: 'overall', left: 72, right: 87, delta: 15 },
      { category: 'seo', left: 72, right: 82, delta: 10 },
      { category: 'technical', left: 79, right: 86, delta: 7 },
      { category: 'content', left: 81, right: 84, delta: 3 },
      { category: 'accessibility', left: 94, right: 96, delta: 2 },
      { category: 'performance', left: 91, right: 96, delta: 5 },
    ],
    findingChanges: {
      resolved: [
        {
          ruleCode: 'SEO_META_DESCRIPTION_MISSING',
          category: 'seo',
          title: 'Meta description is missing',
          leftSeverity: 'high',
          rightSeverity: null,
          change: 'resolved',
          severityChange: null,
          scoreImpact: 10,
        },
      ],
      new: [
        {
          ruleCode: 'A11Y_IMAGE_ALT_MISSING',
          category: 'accessibility',
          title: 'Images are missing alt text',
          leftSeverity: null,
          rightSeverity: 'medium',
          change: 'new',
          severityChange: null,
          scoreImpact: 6,
        },
      ],
      unchanged: [
        {
          ruleCode: 'TECH_SECURITY_HEADER_MISSING',
          category: 'technical',
          title: 'Security headers are missing',
          leftSeverity: 'high',
          rightSeverity: 'medium',
          change: 'unchanged',
          severityChange: 'improved',
          scoreImpact: 10,
        },
        {
          ruleCode: 'CONTENT_LOW_TEXT_LENGTH',
          category: 'content',
          title: 'Low content length',
          leftSeverity: 'low',
          rightSeverity: 'medium',
          change: 'unchanged',
          severityChange: 'regressed',
          scoreImpact: 8,
        },
      ],
    },
    summary: {
      newCount: 1,
      resolvedCount: 1,
      unchangedCount: 2,
      improvedCount: 1,
      regressedCount: 1,
    },
    ...overrides,
  };
}

describe('ComparisonSummary', () => {
  it('renders previous and current overall scores with the numeric delta', () => {
    const { container } = render(<ComparisonSummary comparison={makeComparison()} />);

    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    // The delta is exposed as text for screen readers, not color alone.
    expect(screen.getByLabelText('increased by 15 points')).toBeInTheDocument();
    expect(container.textContent).toContain('72');
    expect(container.textContent).toContain('87');
  });

  it('renders a card per category with the numeric change as text', () => {
    const { container } = render(<ComparisonSummary comparison={makeComparison()} />);

    for (const label of ['SEO', 'Technical', 'Content', 'Accessibility', 'Performance']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('increased by 10 points')).toBeInTheDocument();
    expect(container.textContent).toContain('82');
    expect(container.textContent).toContain('96');
  });

  it('describes a negative delta as a decrease', () => {
    const comparison = makeComparison({
      scoreChanges: [{ category: 'overall', left: 90, right: 80, delta: -10 }],
    });
    render(<ComparisonSummary comparison={comparison} />);

    expect(screen.getByLabelText('decreased by 10 points')).toBeInTheDocument();
  });

  it('handles missing scores without crashing', () => {
    const comparison = makeComparison({
      left: { ...makeComparison().left, overall: null },
      scoreChanges: [{ category: 'overall', left: null, right: 87, delta: null }],
    });
    render(<ComparisonSummary comparison={comparison} />);

    expect(screen.getByText('no change data')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('FindingChanges', () => {
  it('summarizes resolved, new, improved and regressed counts', () => {
    render(<FindingChanges comparison={makeComparison()} />);

    const resolvedCard = screen.getByText('Resolved').closest('div');
    const newCard = screen.getByText('New').closest('div');
    const improvedCard = screen.getByText('Severity improved').closest('div');
    const regressedCard = screen.getByText('Severity regressed').closest('div');

    expect(within(resolvedCard as HTMLElement).getByText('1')).toBeInTheDocument();
    expect(within(newCard as HTMLElement).getByText('1')).toBeInTheDocument();
    expect(within(improvedCard as HTMLElement).getByText('1')).toBeInTheDocument();
    expect(within(regressedCard as HTMLElement).getByText('1')).toBeInTheDocument();
  });

  it('renders the three diff sections with their counts and findings', () => {
    render(<FindingChanges comparison={makeComparison()} />);

    expect(screen.getByRole('heading', { name: 'Resolved Issues (1)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'New Issues (1)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unchanged Issues (2)' })).toBeInTheDocument();

    expect(screen.getByText('Meta description is missing')).toBeInTheDocument();
    expect(screen.getByText('SEO_META_DESCRIPTION_MISSING')).toBeInTheDocument();
    expect(screen.getByText('Images are missing alt text')).toBeInTheDocument();
    expect(screen.getByText('A11Y_IMAGE_ALT_MISSING')).toBeInTheDocument();
  });

  it('flags severity improvements and regressions', () => {
    render(<FindingChanges comparison={makeComparison()} />);
    expect(screen.getByText('Improved')).toBeInTheDocument();
    expect(screen.getByText('Regressed')).toBeInTheDocument();
  });

  it('shows empty states when a section has no findings', () => {
    render(<FindingChanges comparison={makeComparison()} />);

    expect(screen.queryByText('No issues were resolved between these runs')).not.toBeInTheDocument();

    const empty = makeComparison({
      findingChanges: { resolved: [], new: [], unchanged: [] },
      summary: {
        newCount: 0,
        resolvedCount: 0,
        unchangedCount: 0,
        improvedCount: 0,
        regressedCount: 0,
      },
    });
    render(<FindingChanges comparison={empty} />);

    expect(screen.getByText('No issues were resolved between these runs')).toBeInTheDocument();
    expect(screen.getByText('No new issues appeared in the current run')).toBeInTheDocument();
    expect(screen.getByText('No issues are shared by both runs')).toBeInTheDocument();
  });
});
