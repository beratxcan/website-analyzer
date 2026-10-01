'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { AnalysisSummary } from '@analyzer/contracts';
import { listAnalyses } from '@/features/analyses/api';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui';

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  running: 'bg-sky-100 text-sky-700',
  pending: 'bg-slate-100 text-slate-600',
  failed: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function Row({ analysis }: { analysis: AnalysisSummary }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(`/analyses/${analysis.id}`)}
      className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{analysis.website.name}</p>
        <p className="text-xs text-slate-400">{formatDate(analysis.createdAt)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {analysis.latestScore !== null && (
          <span className="text-sm font-semibold text-slate-900">{analysis.latestScore}</span>
        )}
        <Badge className={STATUS_STYLES[analysis.status] ?? STATUS_STYLES.pending}>
          {analysis.status}
        </Badge>
      </div>
    </button>
  );
}

export function RecentAnalyses() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['analyses'],
    queryFn: listAnalyses,
  });
  const items = data?.items.slice(0, 10) ?? [];

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Recent Analyses</h2>
      </div>
      {isPending && (
        <div className="space-y-3 p-4">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      )}
      {isError && <p className="px-4 py-6 text-sm text-rose-600">Unable to load analyses.</p>}
      {!isPending && !isError && items.length === 0 && (
        <div className="p-4">
          <EmptyState title="No analyses yet" description="Run an analysis on a website to see it here." />
        </div>
      )}
      {!isPending && !isError && items.length > 0 && (
        <div className="max-h-96 overflow-y-auto">
          {items.map((analysis) => (
            <Row key={analysis.id} analysis={analysis} />
          ))}
        </div>
      )}
    </Card>
  );
}