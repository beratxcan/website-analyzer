import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FindingDrawer } from '../src/components/analysis/finding-drawer';
import type { AIResultDto, AnalysisFindingDto } from '@analyzer/contracts';

function finding(overrides: Partial<AnalysisFindingDto> = {}): AnalysisFindingDto {
  return {
    id: 'finding-1',
    ruleCode: 'TECH_SECURITY_HEADER_MISSING',
    category: 'technical',
    severity: 'high',
    title: 'Security response headers missing',
    description: 'The response lacks strict-transport-security.',
    scoreImpact: 10,
    evidence: [{ type: 'header', name: 'strict-transport-security', source: 'response' }],
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function completedAI(): AIResultDto {
  return {
    status: 'completed',
    task: 'analysis_insights',
    provider: 'fake',
    model: 'fake-model',
    promptVersion: '1.0.0',
    schemaVersion: '1.0.0',
    summary: { headline: 'h', overview: 'o', strengths: [], weaknesses: [] },
    recommendations: [
      {
        title: 'Add security headers',
        description: 'Serve strict-transport-security on all responses.',
        priority: 'high',
        effort: 'low',
        impact: 'high',
        category: 'technical',
        relatedFindingCodes: ['TECH_SECURITY_HEADER_MISSING'],
      },
    ],
    inputTokens: 10,
    outputTokens: 10,
    totalTokens: 20,
    estimatedCostUsd: null,
    latencyMs: 5,
    errorCode: null,
    errorMessage: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('FindingDrawer', () => {
  it('renders nothing when no finding is selected', () => {
    const { container } = render(
      <FindingDrawer finding={null} ai={completedAI()} onClose={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows rule code, title, description, severity and evidence', () => {
    render(<FindingDrawer finding={finding()} ai={completedAI()} onClose={() => undefined} />);
    expect(screen.getByText('TECH_SECURITY_HEADER_MISSING')).toBeInTheDocument();
    expect(screen.getByText('Security response headers missing')).toBeInTheDocument();
    expect(screen.getByText(/lacks strict-transport-security/)).toBeInTheDocument();
    // The severity badge and the related recommendation's priority both read "high".
    expect(screen.getAllByText('high').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/−10 points/)).toBeInTheDocument();
    expect(screen.getByText('strict-transport-security: (present)')).toBeInTheDocument();
  });

  it('shows the AI explanation and related recommendations', () => {
    render(<FindingDrawer finding={finding()} ai={completedAI()} onClose={() => undefined} />);
    expect(screen.getByText('AI Explanation')).toBeInTheDocument();
    expect(screen.getByText('Serve strict-transport-security on all responses.')).toBeInTheDocument();
    expect(screen.getByText('Related Recommendations')).toBeInTheDocument();
    expect(screen.getByText('Add security headers')).toBeInTheDocument();
  });

  it('closes via the Close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<FindingDrawer finding={finding()} ai={completedAI()} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('notes when no AI explanation exists for the finding', () => {
    const ai = { ...completedAI(), recommendations: [] };
    render(<FindingDrawer finding={finding()} ai={ai} onClose={() => undefined} />);
    expect(
      screen.getByText('No AI explanation was generated for this specific finding.'),
    ).toBeInTheDocument();
  });
});