'use client';

import type { ComparisonResultDto, ScoreChangeDto } from '@analyzer/contracts';
import { Card } from '@/components/ui';

const CATEGORY_LABELS: Record<string, string> = {
  overall: 'Overall',
  seo: 'SEO',
  technical: 'Technical',
  content: 'Content',
  accessibility: 'Accessibility',
  performance: 'Performance',
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function score(value: number | null): string {
  return value === null ? '—' : String(value);
}

/**
 * Numeric delta. Always rendered as text (never color-only), so the value is
 * available to screen readers and conveys direction on its own.
 */
export function DeltaValue({ delta, className = '' }: { delta: number | null; className?: string }) {
  if (delta === null) {
    return <span className={`text-slate-400 ${className}`}>no change data</span>;
  }
  if (delta === 0) {
    return <span className={`text-slate-500 ${className}`}>0</span>;
  }
  const improved = delta > 0;
  return (
    <span
      className={`font-semibold ${improved ? 'text-emerald-600' : 'text-rose-600'} ${className}`}
      aria-label={`${improved ? 'increased' : 'decreased'} by ${Math.abs(delta)} points`}
    >
      {improved ? '+' : ''}
      {delta}
    </span>
  );
}

function CategoryCard({ change }: { change: ScoreChangeDto }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {categoryLabel(change.category)}
      </p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
        {score(change.left)} <span className="text-slate-400">→</span> {score(change.right)}
      </p>
      <div className="mt-1 text-sm">
        <DeltaValue delta={change.delta} />
      </div>
    </Card>
  );
}

/** Overall score movement plus one card per category. */
export function ComparisonSummary({ comparison }: { comparison: ComparisonResultDto }) {
  const overall = comparison.scoreChanges.find((change) => change.category === 'overall');
  const categories = comparison.scoreChanges.filter((change) => change.category !== 'overall');

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Previous</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              {score(comparison.left.overall)}
            </p>
            <p className="mt-1 text-xs text-slate-500">{formatDate(comparison.left.createdAt)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Overall change
            </p>
            <p className="mt-1 text-2xl">
              <DeltaValue delta={overall?.delta ?? null} />
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Current</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              {score(comparison.right.overall)}
            </p>
            <p className="mt-1 text-xs text-slate-500">{formatDate(comparison.right.createdAt)}</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {categories.map((change) => (
          <CategoryCard key={change.category} change={change} />
        ))}
      </div>
    </div>
  );
}
