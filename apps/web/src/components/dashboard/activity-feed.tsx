'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ActivityEventType } from '@analyzer/contracts';
import { getActivity } from '@/features/dashboard/api';
import { Card, EmptyState, Skeleton } from '@/components/ui';

const EVENT_STYLES: Record<ActivityEventType, { icon: string; classes: string }> = {
  project_created: { icon: '▣', classes: 'bg-slate-100 text-slate-600' },
  website_added: { icon: '⌂', classes: 'bg-sky-100 text-sky-700' },
  analysis_completed: { icon: '✓', classes: 'bg-emerald-100 text-emerald-700' },
  ai_insights_generated: { icon: '✦', classes: 'bg-violet-100 text-violet-700' },
};

function formatRelative(value: string): string {
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

export function ActivityFeed() {
  const router = useRouter();
  const { data, isPending, isError } = useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () => getActivity(20),
  });
  const items = data?.items ?? [];

  const navigate = (item: { analysisId: string | null; websiteId: string | null; projectId: string | null }) => {
    if (item.analysisId) {
      router.push(`/analyses/${item.analysisId}`);
    } else if (item.websiteId) {
      router.push(`/websites/${item.websiteId}`);
    } else if (item.projectId) {
      router.push(`/projects/${item.projectId}`);
    }
  };

  return (
    <Card className="p-0">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Recent Activity</h2>
      </div>
      <div className="max-h-[26rem] overflow-y-auto p-2">
        {isPending && (
          <div className="space-y-3 p-2">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        )}
        {isError && <p className="p-4 text-sm text-rose-600">Unable to load activity.</p>}
        {!isPending && !isError && items.length === 0 && (
          <div className="p-3">
            <EmptyState title="No activity yet" description="Create a project, add a website and run an analysis." />
          </div>
        )}
        {!isPending && !isError && items.length > 0 && (
          <ul>
            {items.map((item) => {
              const style = EVENT_STYLES[item.type] ?? EVENT_STYLES.analysis_completed;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => navigate(item)}
                    className="flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left hover:bg-slate-50"
                  >
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${style.classes}`}>
                      {style.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{item.title}</p>
                      <p className="truncate text-sm text-slate-500">{item.description}</p>
                    </div>
                    <span className="shrink-0 pt-0.5 text-xs text-slate-400">{formatRelative(item.timestamp)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}