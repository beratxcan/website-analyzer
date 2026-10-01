'use client';

import type { DashboardOverviewDto } from '@analyzer/contracts';
import { Card, Skeleton } from '@/components/ui';

function StatCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card className="min-w-0">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tracking-tight ${accent ? 'text-emerald-600' : 'text-slate-900'}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}

export function StatCards({ data }: { data: DashboardOverviewDto | undefined }) {
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Card key={index}>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-3 h-8 w-12" />
          </Card>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Projects" value={String(data.totalProjects)} />
      <StatCard label="Websites" value={String(data.totalWebsites)} />
      <StatCard
        label="Analyses"
        value={String(data.totalAnalyses)}
        hint={`${data.completedAnalyses} completed · ${data.failedAnalyses} failed`}
      />
      <StatCard
        label="Average Score"
        value={data.averageScore !== null ? String(data.averageScore) : '—'}
        hint={data.averageScore !== null ? 'of 100' : 'no completed analyses'}
        accent
      />
    </div>
  );
}