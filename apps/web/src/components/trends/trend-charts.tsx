'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { WebsiteTrendPointDto } from '@analyzer/contracts';
import { Card, EmptyState, Skeleton } from '@/components/ui';

const CATEGORY_COLORS: Record<string, string> = {
  overall: '#0f766e',
  seo: '#2563eb',
  technical: '#7c3aed',
  content: '#d97706',
  accessibility: '#059669',
  performance: '#dc2626',
};

const CATEGORY_LABELS: Record<string, string> = {
  overall: 'Overall Score',
  seo: 'SEO',
  technical: 'Technical',
  content: 'Content',
  accessibility: 'Accessibility',
  performance: 'Performance',
};

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ChartCard({ title, points, color }: { title: string; points: { label: string; value: number | null }[]; color: string }) {
  return (
    <Card className="p-4">
      <p className="mb-3 text-sm font-semibold text-slate-900">{title}</p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(value) => [`${value}/100`, title]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function chartPoints(trends: WebsiteTrendPointDto[], category: string) {
  return trends.map((point) => ({
    label: shortDate(point.createdAt),
    value: point[category as keyof WebsiteTrendPointDto] as number | null,
  }));
}

export function TrendCharts({
  trends,
  isPending,
  isError,
}: {
  trends: WebsiteTrendPointDto[] | undefined;
  isPending: boolean;
  isError: boolean;
}) {
  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-56 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <p className="text-sm text-rose-600">Unable to load score trends.</p>
      </Card>
    );
  }

  if (!trends || trends.length === 0) {
    return (
      <EmptyState
        title="No trends yet"
        description="Complete an analysis to start tracking this website's scores over time."
      />
    );
  }

  if (trends.length === 1) {
    return (
      <EmptyState
        title="One analysis so far"
        description="Run the analysis again later to see how scores evolve — trends need at least two completed runs."
      />
    );
  }

  const categories = ['overall', 'seo', 'technical', 'content', 'accessibility', 'performance'];

  return (
    <div className="space-y-4">
      <ChartCard
        title="Overall Score Trend"
        points={chartPoints(trends, 'overall')}
        color={CATEGORY_COLORS.overall ?? '#0f766e'}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.slice(1).map((category) => (
          <ChartCard
            key={category}
            title={CATEGORY_LABELS[category] ?? category}
            points={chartPoints(trends, category)}
            color={CATEGORY_COLORS[category] ?? '#2563eb'}
          />
        ))}
      </div>
    </div>
  );
}