import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RecommendationsWidget } from '../src/components/analysis/recommendations-widget';
import type { AIResultDto } from '@analyzer/contracts';

function completedAI(overrides: Partial<AIResultDto> = {}): AIResultDto {
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
        title: 'Medium rec',
        description: 'Fix the medium issue.',
        priority: 'medium',
        effort: 'medium',
        impact: 'medium',
        category: 'seo',
        relatedFindingCodes: ['SEO_META_DESCRIPTION_MISSING'],
      },
      {
        title: 'Critical rec',
        description: 'Fix the critical issue.',
        priority: 'critical',
        effort: 'low',
        impact: 'high',
        category: 'technical',
        relatedFindingCodes: ['TECH_SECURITY_HEADER_MISSING'],
      },
      {
        title: 'Low rec',
        description: 'Fix the low issue.',
        priority: 'low',
        effort: 'high',
        impact: 'low',
        category: 'content',
        relatedFindingCodes: ['CONTENT_LOW_TEXT_LENGTH'],
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
    ...overrides,
  };
}

describe('RecommendationsWidget', () => {
  it('renders recommendations sorted by priority (critical first)', () => {
    render(<RecommendationsWidget ai={completedAI()} />);
    const titles = screen.getAllByRole('listitem').map((item) => within(item).getByText(/rec$/).textContent);
    expect(titles).toEqual(['Critical rec', 'Medium rec', 'Low rec']);
  });

  it('shows effort, impact and related finding codes', () => {
    render(<RecommendationsWidget ai={completedAI()} />);
    expect(screen.getByText(/low effort/)).toBeInTheDocument();
    expect(screen.getByText(/high impact/)).toBeInTheDocument();
    expect(screen.getByText('TECH_SECURITY_HEADER_MISSING')).toBeInTheDocument();
  });

  it('shows a generating state while the AI runs', () => {
    render(<RecommendationsWidget ai={{ ...completedAI(), status: 'running', recommendations: null }} />);
    expect(screen.getByText('AI insights are being generated…')).toBeInTheDocument();
  });

  it('shows an unavailable state on failure without breaking the page', () => {
    render(
      <RecommendationsWidget
        ai={{ ...completedAI(), status: 'failed', recommendations: null, errorCode: 'AI_CONFIG_INVALID' }}
      />,
    );
    expect(screen.getByText(/AI_CONFIG_INVALID/)).toBeInTheDocument();
  });

  it('shows an empty state when there are no recommendations', () => {
    render(<RecommendationsWidget ai={{ ...completedAI(), recommendations: [] }} />);
    expect(screen.getByText('No recommendations')).toBeInTheDocument();
  });

  it('shows a neutral state when there is no AI result yet', () => {
    render(<RecommendationsWidget ai={null} />);
    expect(screen.getByText('No AI insights for this run yet.')).toBeInTheDocument();
  });
});