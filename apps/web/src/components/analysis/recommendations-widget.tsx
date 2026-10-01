'use client';

import type { AIResultDto, AIRecommendationDto } from '@analyzer/contracts';
import { Badge, Card, EmptyState, Spinner } from '@/components/ui';

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'] as const;

const PRIORITY_STYLES: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

function RecommendationCard({ recommendation }: { recommendation: AIRecommendationDto }) {
  return (
    <li className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-slate-900">{recommendation.title}</p>
        <Badge className={PRIORITY_STYLES[recommendation.priority] ?? ''}>
          {recommendation.priority}
        </Badge>
        <Badge className="bg-slate-100 text-slate-600">{recommendation.category}</Badge>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{recommendation.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">
          {recommendation.effort} effort · {recommendation.impact} impact
        </span>
        <span className="text-xs text-slate-400">·</span>
        <div className="flex flex-wrap gap-1">
          {recommendation.relatedFindingCodes.map((code) => (
            <code key={code} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
              {code}
            </code>
          ))}
        </div>
      </div>
    </li>
  );
}

/**
 * AI recommendations sorted by priority (critical → low). Degrades
 * gracefully: generating/failed/absent AI states never break the screen.
 */
export function RecommendationsWidget({ ai }: { ai: AIResultDto | null }) {
  if (!ai) {
    return (
      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Top Recommendations</h2>
        <p className="mt-2 text-sm text-slate-500">
          No AI insights for this run yet.
        </p>
      </Card>
    );
  }

  if (ai.status === 'pending' || ai.status === 'running') {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <Spinner />
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Top Recommendations</h2>
            <p className="text-sm text-slate-500">AI insights are being generated…</p>
          </div>
        </div>
      </Card>
    );
  }

  if (ai.status === 'failed' || !ai.recommendations) {
    return (
      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Top Recommendations</h2>
        <p className="mt-2 text-sm text-slate-500">
          AI insights are unavailable{ai.errorCode ? ` (${ai.errorCode})` : ''}. The deterministic
          results above remain valid.
        </p>
      </Card>
    );
  }

  const ordered = [...ai.recommendations].sort((a, b) => {
    const rankA = PRIORITY_ORDER.indexOf(a.priority as (typeof PRIORITY_ORDER)[number]);
    const rankB = PRIORITY_ORDER.indexOf(b.priority as (typeof PRIORITY_ORDER)[number]);
    return (rankA === -1 ? PRIORITY_ORDER.length : rankA) - (rankB === -1 ? PRIORITY_ORDER.length : rankB);
  });

  return (
    <Card className="p-0">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Top Recommendations</h2>
      </div>
      <div className="p-4">
        {ordered.length === 0 ? (
          <EmptyState
            title="No recommendations"
            description="The AI did not produce recommendations for this run."
          />
        ) : (
          <ul className="space-y-3">
            {ordered.map((recommendation) => (
              <RecommendationCard key={recommendation.title} recommendation={recommendation} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}