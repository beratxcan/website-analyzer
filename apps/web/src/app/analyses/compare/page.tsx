'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import type { AnalysisWebsiteRef, WebsiteTrendPointDto } from '@analyzer/contracts';
import { AppHeader } from '@/components/app-header';
import { Card, EmptyState, Skeleton } from '@/components/ui';
import { ComparisonSummary } from '@/components/comparison/comparison-summary';
import { FindingChanges } from '@/components/comparison/finding-changes';
import { ReportDownloadButton } from '@/components/analysis/report-download-button';
import { downloadComparisonReport, getComparison, listAnalyses } from '@/features/analyses/api';
import { getWebsiteTrends } from '@/features/websites/api';
import { ApiClientError } from '@/lib/api/client';

const EMPTY_RUNS: WebsiteTrendPointDto[] = [];

const SELECT_CLASSES =
  'rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-slate-500 focus:outline-none';

function formatRun(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function runOptionLabel(run: WebsiteTrendPointDto): string {
  const score = run.overall === null ? 'no score' : `${run.overall}/100`;
  return `${formatRun(run.createdAt)} — ${score}`;
}

export default function ComparePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Compare Analyses</h1>
          <p className="mt-1 text-sm text-slate-500">
            Select two completed runs of the same website to see what improved and what regressed.
          </p>
        </div>
        {/* `useSearchParams` needs a Suspense boundary for static rendering. */}
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <CompareView />
        </Suspense>
      </main>
    </div>
  );
}

function CompareView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const websiteId = searchParams.get('websiteId') ?? '';
  const [leftRunId, setLeftRunId] = useState('');
  const [rightRunId, setRightRunId] = useState('');

  const analysesQuery = useQuery({ queryKey: ['analyses'], queryFn: listAnalyses });
  const websites = useMemo<AnalysisWebsiteRef[]>(() => {
    const byId = new Map<string, AnalysisWebsiteRef>();
    for (const analysis of analysesQuery.data?.items ?? []) {
      if (!byId.has(analysis.website.id)) {
        byId.set(analysis.website.id, analysis.website);
      }
    }
    return [...byId.values()];
  }, [analysesQuery.data]);

  const trendsQuery = useQuery({
    queryKey: ['websites', websiteId, 'trends'],
    queryFn: () => getWebsiteTrends(websiteId),
    enabled: websiteId !== '',
  });
  const runs = trendsQuery.data ?? EMPTY_RUNS;

  // Selecting another website invalidates the previous run selection.
  useEffect(() => {
    setLeftRunId('');
    setRightRunId('');
  }, [websiteId]);

  // Default to the two most recent completed runs (previous vs current).
  useEffect(() => {
    if (runs.length === 0) return;
    const latest = runs[runs.length - 1];
    const previous = runs.length >= 2 ? runs[runs.length - 2] : undefined;
    setRightRunId((current) => (current === '' ? (latest?.runId ?? '') : current));
    setLeftRunId((current) => (current === '' ? (previous?.runId ?? '') : current));
  }, [runs]);

  const sameRun = leftRunId !== '' && leftRunId === rightRunId;
  const canCompare = leftRunId !== '' && rightRunId !== '' && !sameRun;

  const comparisonQuery = useQuery({
    queryKey: ['comparison', leftRunId, rightRunId],
    queryFn: () => getComparison(leftRunId, rightRunId),
    enabled: canCompare,
    retry: false,
  });

  const comparison = comparisonQuery.data;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="compare-website" className="mb-1 block text-xs font-medium text-slate-600">
              Website
            </label>
            <select
              id="compare-website"
              className={SELECT_CLASSES}
              value={websiteId}
              onChange={(event) => {
                const next = event.target.value;
                router.replace(
                  next ? `/analyses/compare?websiteId=${encodeURIComponent(next)}` : '/analyses/compare',
                  { scroll: false },
                );
              }}
            >
              <option value="">Select a website…</option>
              {websites.map((website) => (
                <option key={website.id} value={website.id}>
                  {website.name} ({website.host})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="compare-left" className="mb-1 block text-xs font-medium text-slate-600">
              Previous analysis
            </label>
            <select
              id="compare-left"
              className={SELECT_CLASSES}
              value={leftRunId}
              disabled={runs.length === 0}
              onChange={(event) => setLeftRunId(event.target.value)}
            >
              {runs.length === 0 && <option value="">No completed runs</option>}
              {runs.map((run) => (
                <option key={run.runId} value={run.runId}>
                  {runOptionLabel(run)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="compare-right" className="mb-1 block text-xs font-medium text-slate-600">
              Current analysis
            </label>
            <select
              id="compare-right"
              className={SELECT_CLASSES}
              value={rightRunId}
              disabled={runs.length === 0}
              onChange={(event) => setRightRunId(event.target.value)}
            >
              {runs.length === 0 && <option value="">No completed runs</option>}
              {runs.map((run) => (
                <option key={run.runId} value={run.runId}>
                  {runOptionLabel(run)}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto">
            <ReportDownloadButton
              label="Export Comparison Report"
              getFile={() => downloadComparisonReport(leftRunId, rightRunId)}
            />
          </div>
        </div>
      </Card>

      {websiteId === '' ? (
        <EmptyState
          title="Select a website"
          description="Comparison works on completed runs of a single website."
        />
      ) : trendsQuery.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : runs.length < 2 ? (
        <EmptyState
          title="No previous analysis"
          description="At least two completed analyses are required. Run the analysis again to build history."
        />
      ) : sameRun ? (
        <EmptyState
          title="Same run selected"
          description="Choose two different runs to see a meaningful comparison."
        />
      ) : comparisonQuery.isError ? (
        <Card>
          <p role="alert" className="text-sm text-rose-600">
            {comparisonQuery.error instanceof ApiClientError
              ? comparisonQuery.error.message
              : 'This comparison could not be generated.'}
          </p>
        </Card>
      ) : comparisonQuery.isPending || !comparison ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <ComparisonSummary comparison={comparison} />
          <FindingChanges comparison={comparison} />
        </>
      )}
    </div>
  );
}
