'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { Button, Card, Skeleton } from '@/components/ui';
import { AIInsights } from '@/components/analysis/ai-insights';
import { FindingsExplorer } from '@/components/analysis/findings-explorer';
import { FindingDrawer } from '@/components/analysis/finding-drawer';
import { RecommendationsWidget } from '@/components/analysis/recommendations-widget';
import { ReportDownloadButton } from '@/components/analysis/report-download-button';
import { ScoreDelta } from '@/components/analysis/score-delta';
import { downloadAnalysisReport, getAnalysis, getRunDetail, listRuns } from '@/features/analyses/api';
import { getWebsiteTrends } from '@/features/websites/api';
import type { AnalysisFindingDto, AnalysisRunDetail } from '@analyzer/contracts';

const POLL_INTERVAL_MS = 2_500;

const STATUS_LABELS: Record<string, string> = {
  pending: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export default function AnalysisDetailPage() {
  const params = useParams<{ analysisId: string }>();
  const analysisId = params.analysisId;
  const router = useRouter();
  const [selectedFinding, setSelectedFinding] = useState<AnalysisFindingDto | null>(null);

  const analysisQuery = useQuery({
    queryKey: ['analyses', analysisId],
    queryFn: () => getAnalysis(analysisId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'pending' || status === 'running' ? POLL_INTERVAL_MS : false;
    },
  });
  const analysis = analysisQuery.data;

  const runsQuery = useQuery({
    queryKey: ['analyses', analysisId, 'runs'],
    queryFn: () => listRuns(analysisId),
    enabled: analysis !== undefined,
    refetchInterval: (query) => {
      const run = query.state.data?.items[0];
      return run && (run.status === 'queued' || run.status === 'running')
        ? POLL_INTERVAL_MS
        : false;
    },
  });
  const latestRun = runsQuery.data?.items[0];

  const detailQuery = useQuery({
    queryKey: ['analyses', analysisId, 'runs', latestRun?.id],
    queryFn: () => getRunDetail(analysisId, latestRun!.id),
    enabled: latestRun !== undefined,
    refetchInterval: (query) => {
      const ai = (query.state.data as AnalysisRunDetail | undefined)?.ai;
      return ai && (ai.status === 'pending' || ai.status === 'running')
        ? POLL_INTERVAL_MS
        : false;
    },
  });
  const detail = detailQuery.data;
  const ai = detail?.ai ?? null;

  const trendsQuery = useQuery({
    queryKey: ['websites', analysis?.website.id, 'trends'],
    queryFn: () => getWebsiteTrends(analysis!.website.id),
    enabled: analysis !== undefined,
  });
  const trends = trendsQuery.data ?? [];

  const website = analysis?.website;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <button
          onClick={() => router.push(website ? `/websites/${website.id}` : '/dashboard')}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to website
        </button>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                {website?.name ?? 'Analysis'}
              </h1>
              <p className="mt-1 truncate text-sm text-slate-500">
                {website?.url} <span className="text-xs text-slate-400">· {website?.host}</span>
              </p>
              {analysis && (
                <p className="mt-2 text-sm text-slate-600">
                  Status:{' '}
                  <span className="font-medium text-slate-900">
                    {STATUS_LABELS[analysis.status] ?? analysis.status}
                  </span>
                  {analysis.latestScore !== null && (
                    <span className="ml-2">
                      Score: <span className="font-medium text-slate-900">{analysis.latestScore}/100</span>
                    </span>
                  )}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {website && (
                <Button
                  variant="secondary"
                  onClick={() => router.push(`/analyses/compare?websiteId=${website.id}`)}
                >
                  Compare runs
                </Button>
              )}
              {detail && (
                <ReportDownloadButton getFile={() => downloadAnalysisReport(analysisId)} />
              )}
              {website && (
                <Button variant="secondary" onClick={() => router.push(`/websites/${website.id}`)}>
                  View trends
                </Button>
              )}
            </div>
          </div>
        </Card>

        {analysisQuery.isPending || runsQuery.isPending ? (
          <Card>
            <Skeleton className="h-24 w-full" />
          </Card>
        ) : detail ? (
          <>
            <section>
              <h2 className="mb-3 text-sm font-medium text-slate-900">Category Scores</h2>
              <ScoreDelta runId={detail.id} scores={detail.scores} trends={trends} />
            </section>

            {detail.errorMessage && (
              <p className="text-sm text-rose-600">
                {detail.errorCode ? `${detail.errorCode}: ` : ''}
                {detail.errorMessage}
              </p>
            )}

            <section className="space-y-4">
              <AIInsights ai={ai} />
              <RecommendationsWidget ai={ai} />
            </section>

            <section>
              <FindingsExplorer analysisId={analysisId} onSelect={setSelectedFinding} />
            </section>
          </>
        ) : (
          <Card>
            <p className="text-sm text-slate-500">
              Waiting for the analysis run to be picked up by the worker…
            </p>
          </Card>
        )}
      </main>
      <FindingDrawer
        finding={selectedFinding}
        ai={ai}
        onClose={() => setSelectedFinding(null)}
      />
    </div>
  );
}