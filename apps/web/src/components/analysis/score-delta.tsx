'use client';

import type { AnalysisScoreDto, WebsiteTrendPointDto } from '@analyzer/contracts';
import { Card } from '@/components/ui';

const CATEGORIES = ['seo', 'technical', 'content', 'accessibility', 'performance'] as const;

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-sm text-slate-400">—</span>;
  }
  if (delta === 0) {
    return <span className="text-sm font-semibold text-slate-500">0</span>;
  }
  const positive = delta > 0;
  return (
    <span
      className={`text-sm font-semibold ${positive ? 'text-emerald-600' : 'text-rose-600'}`}
      aria-label={`${positive ? 'up' : 'down'} ${Math.abs(delta)} points`}
    >
      {positive ? '+' : ''}
      {delta}
    </span>
  );
}

/**
 * Category score cards with the delta vs the previous completed run of the
 * same website. Deltas are omitted when there is no previous run.
 */
export function ScoreDelta({
  runId,
  scores,
  trends,
}: {
  runId: string;
  scores: AnalysisScoreDto[];
  trends: WebsiteTrendPointDto[];
}) {
  const currentIndex = trends.findIndex((point) => point.runId === runId);
  const previous = currentIndex > 0 ? trends[currentIndex - 1] : undefined;
  const byCategory = new Map(scores.map((score) => [score.category, score.score]));

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {CATEGORIES.map((category) => {
        const current = byCategory.get(category);
        const previousScore =
          previous !== undefined ? previous[category as keyof WebsiteTrendPointDto] : null;
        const delta =
          current !== undefined && typeof previousScore === 'number'
            ? current - previousScore
            : null;
        return (
          <Card key={category} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{category}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              {current ?? '—'}
            </p>
            <div className="mt-1 flex items-center gap-1">
              <span className="text-xs text-slate-400">vs prev</span>
              <DeltaBadge delta={delta} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}