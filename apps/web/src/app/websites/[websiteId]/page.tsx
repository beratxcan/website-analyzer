'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { Button, Card, Skeleton } from '@/components/ui';
import { AnalysisHistory } from '@/components/websites/analysis-history';
import { getWebsite, getWebsiteTrends } from '@/features/websites/api';
import { createAnalysis, listAnalyses } from '@/features/analyses/api';
import { ApiClientError } from '@/lib/api/client';

// The charting library is the heaviest dependency on this route; loading it
// after the page shell keeps the initial bundle small.
const TrendCharts = dynamic(
  () => import('@/components/trends/trend-charts').then((mod) => mod.TrendCharts),
  {
    ssr: false,
    loading: () => <Skeleton className="h-64 w-full" />,
  },
);

export default function WebsitePage() {
  const params = useParams<{ websiteId: string }>();
  const websiteId = params.websiteId;
  const router = useRouter();
  const queryClient = useQueryClient();

  const websiteQuery = useQuery({
    queryKey: ['websites', 'detail', websiteId],
    queryFn: () => getWebsite(websiteId),
  });
  const trendsQuery = useQuery({
    queryKey: ['websites', websiteId, 'trends'],
    queryFn: () => getWebsiteTrends(websiteId),
  });
  const analysesQuery = useQuery({ queryKey: ['analyses'], queryFn: listAnalyses });
  const analyses = (analysesQuery.data?.items ?? []).filter(
    (analysis) => analysis.websiteId === websiteId,
  );
  const latestAnalysis = analyses[0];
  const analysisBusy =
    latestAnalysis !== undefined &&
    (latestAnalysis.status === 'pending' || latestAnalysis.status === 'running');

  const createMutation = useMutation({
    mutationFn: () => createAnalysis(websiteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['analyses'] });
      void queryClient.invalidateQueries({ queryKey: ['websites', websiteId, 'analyses'] });
      void queryClient.invalidateQueries({ queryKey: ['websites', websiteId, 'trends'] });
    },
  });

  const website = websiteQuery.data;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <button
          onClick={() => router.push(website ? `/projects/${website.projectId}` : '/projects')}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to project
        </button>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                {websiteQuery.isPending ? '…' : website?.name}
              </h1>
              <p className="mt-1 truncate text-sm text-slate-500">
                {website?.url} <span className="text-xs text-slate-400">· {website?.host}</span>
              </p>
              {latestAnalysis && (
                <p className="mt-2 text-sm text-slate-600">
                  Last run:{' '}
                  <button
                    onClick={() => router.push(`/analyses/${latestAnalysis.id}`)}
                    className="font-medium text-emerald-700 hover:underline"
                  >
                    {latestAnalysis.latestScore !== null
                      ? `${latestAnalysis.latestScore}/100`
                      : 'in progress'}
                  </button>
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => router.push(`/analyses/compare?websiteId=${websiteId}`)}
              >
                Compare runs
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || analysisBusy}
              >
                {analysisBusy ? 'Analysis in progress…' : 'Run analysis'}
              </Button>
            </div>
          </div>
          {createMutation.isError && (
            <p className="mt-2 text-sm text-rose-600">
              {createMutation.error instanceof ApiClientError
                ? createMutation.error.message
                : 'Failed to start analysis'}
            </p>
          )}
        </Card>

        <section>
          <h2 className="mb-3 text-sm font-medium text-slate-900">Score Trends</h2>
          <TrendCharts
            trends={trendsQuery.data}
            isPending={trendsQuery.isPending}
            isError={trendsQuery.isError}
          />
        </section>

        <section>
          <AnalysisHistory websiteId={websiteId} />
        </section>

        {websiteQuery.isPending && (
          <Card>
            <Skeleton className="h-5 w-40" />
          </Card>
        )}
      </main>
    </div>
  );
}