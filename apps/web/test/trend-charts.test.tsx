import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrendCharts } from '../src/components/trends/trend-charts';
import type { WebsiteTrendPointDto } from '@analyzer/contracts';

function point(overrides: Partial<WebsiteTrendPointDto> = {}): WebsiteTrendPointDto {
  return {
    runId: 'run-1',
    analysisId: 'analysis-1',
    createdAt: '2026-09-01T00:00:00.000Z',
    overall: 70,
    seo: 65,
    technical: 75,
    content: 70,
    accessibility: 80,
    performance: 85,
    ...overrides,
  };
}

describe('TrendCharts', () => {
  it('shows skeletons while loading', () => {
    render(<TrendCharts trends={undefined} isPending isError={false} />);
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows an empty state when there are no runs', () => {
    render(<TrendCharts trends={[]} isPending={false} isError={false} />);
    expect(screen.getByText('No trends yet')).toBeInTheDocument();
  });

  it('explains that a single run cannot show trends', () => {
    render(<TrendCharts trends={[point()]} isPending={false} isError={false} />);
    expect(screen.getByText('One analysis so far')).toBeInTheDocument();
  });

  it('renders the overall chart and all category charts with two runs', () => {
    const trends = [
      point({ runId: 'run-1', overall: 70 }),
      point({ runId: 'run-2', createdAt: '2026-09-02T00:00:00.000Z', overall: 87 }),
    ];
    render(<TrendCharts trends={trends} isPending={false} isError={false} />);

    expect(screen.getByText('Overall Score Trend')).toBeInTheDocument();
    expect(screen.getByText('SEO')).toBeInTheDocument();
    expect(screen.getByText('Technical')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByText('Accessibility')).toBeInTheDocument();
    expect(screen.getByText('Performance')).toBeInTheDocument();
    // One big overall chart + five category charts.
    expect(document.querySelectorAll('.recharts-responsive-container').length).toBe(6);
  });

  it('shows an error state', () => {
    render(<TrendCharts trends={undefined} isPending={false} isError />);
    expect(screen.getByText('Unable to load score trends.')).toBeInTheDocument();
  });
});