'use client';

import type { AIResultDto } from '@analyzer/contracts';
import { Card, Spinner } from '@/components/ui';

function stateBadge(status: AIResultDto['status']) {
  switch (status) {
    case 'completed':
      return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Ready</span>;
    case 'pending':
    case 'running':
      return <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">Generating</span>;
    case 'failed':
      return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">Unavailable</span>;
    case 'skipped':
      return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Skipped</span>;
  }
}

/**
 * Executive summary panel of the AI enrichment. The deterministic analysis
 * remains fully usable no matter what state the AI is in.
 */
export function AIInsights({ ai }: { ai: AIResultDto | null }) {
  if (!ai) {
    return (
      <Card>
        <h3 className="text-sm font-semibold text-slate-900">AI Insights</h3>
        <p className="mt-2 text-sm text-slate-500">
          No AI enrichment for this run yet. Once generated, an executive summary will appear here.
        </p>
      </Card>
    );
  }

  if (ai.status === 'pending' || ai.status === 'running') {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">AI Insights</h3>
          {stateBadge(ai.status)}
        </div>
        <div className="mt-3 flex items-center gap-3 text-sm text-slate-600">
          <Spinner />
          <span>Generating executive summary…</span>
        </div>
      </Card>
    );
  }

  if (ai.status === 'skipped') {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">AI Insights</h3>
          {stateBadge(ai.status)}
        </div>
        <p className="mt-2 text-sm text-slate-500">AI enrichment is disabled for this deployment.</p>
      </Card>
    );
  }

  if (ai.status === 'failed' || !ai.summary) {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">AI Insights</h3>
          {stateBadge('failed')}
        </div>
        <p className="mt-2 text-sm text-slate-500">
          AI insights could not be generated for this run
          {ai.errorCode ? ` (${ai.errorCode})` : ''}. The deterministic analysis above remains valid.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">AI Insights</h3>
        {stateBadge(ai.status)}
      </div>

      <p className="mt-3 text-lg font-medium text-slate-900">{ai.summary.headline}</p>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">{ai.summary.overview}</p>

      {(ai.summary.strengths.length > 0 || ai.summary.weaknesses.length > 0) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {ai.summary.strengths.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Strengths</p>
              <ul className="mt-2 space-y-1">
                {ai.summary.strengths.map((strength) => (
                  <li key={strength} className="text-sm text-slate-600">
                    · {strength}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {ai.summary.weaknesses.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-rose-600">Weaknesses</p>
              <ul className="mt-2 space-y-1">
                {ai.summary.weaknesses.map((weakness) => (
                  <li key={weakness} className="text-sm text-slate-600">
                    · {weakness}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}