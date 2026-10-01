'use client';

import { useQuery } from '@tanstack/react-query';
import type { TopIssueDto } from '@analyzer/contracts';
import { getTopIssues } from '@/features/dashboard/api';
import { Card, EmptyState, Skeleton } from '@/components/ui';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
  info: 'bg-sky-100 text-sky-700',
};

export function TopIssues() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['dashboard', 'top-issues'],
    queryFn: () => getTopIssues(8),
  });

  return (
    <Card className="p-0">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Top Issues</h2>
      </div>
      <div className="p-4">
        {isPending && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        )}
        {isError && <p className="text-sm text-rose-600">Unable to load top issues.</p>}
        {!isPending && !isError && data?.items.length === 0 && (
          <EmptyState title="No issues yet" description="Completed analyses will surface the most common findings here." />
        )}
        {!isPending && !isError && (data?.items.length ?? 0) > 0 && (
          <ul className="space-y-3">
            {data!.items.map((issue: TopIssueDto) => (
              <li key={issue.ruleCode}>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-slate-900">{issue.title}</p>
                  <span className="shrink-0 text-xs text-slate-500">{issue.count}×</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-400"
                      style={{ width: `${Math.min((issue.count / (data!.items[0]?.count ?? 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_STYLES[issue.severity] ?? ''}`}>
                    {issue.severity}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">{issue.ruleCode}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}