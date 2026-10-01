'use client';

import { useEffect, useState } from 'react';
import type { HealthCheckResponse } from '@analyzer/contracts';
import { getApiBaseUrl } from '@/lib/env';

type ApiStatusState =
  | { kind: 'loading' }
  | { kind: 'success'; health: HealthCheckResponse }
  | { kind: 'error'; message: string };

function statusStyles(status: HealthCheckResponse['status']): string {
  switch (status) {
    case 'ok':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
    case 'degraded':
      return 'bg-amber-50 text-amber-800 ring-amber-200';
  }
}

function componentStyles(status: 'up' | 'down'): string {
  return status === 'up'
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-rose-100 text-rose-700';
}

export function ApiStatus() {
  const [state, setState] = useState<ApiStatusState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`${getApiBaseUrl()}/health`);
        if (!response.ok) {
          throw new Error(`API responded with HTTP ${response.status}`);
        }
        const health = (await response.json()) as HealthCheckResponse;
        if (!cancelled) {
          setState({ kind: 'success', health });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'loading') {
    return (
      <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
        Checking API health…
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded-lg border border-slate-200 p-4">
        <p className="text-sm font-medium text-slate-900">API unreachable</p>
        <p className="mt-1 text-sm text-slate-500">
          {state.message} — is the API running? ({getApiBaseUrl()})
        </p>
      </div>
    );
  }

  const { health } = state;
  const checks = Object.entries(health.checks);

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ${statusStyles(health.status)}`}
        >
          {health.status}
        </span>
        <span className="text-sm text-slate-500">
          API v{health.version} · up {health.uptimeSeconds}s
        </span>
      </div>
      {checks.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {checks.map(([name, check]) => (
            <li key={name} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{name}</span>
              <span className="flex items-center gap-2">
                {check.latencyMs !== undefined && (
                  <span className="text-xs text-slate-400">{check.latencyMs}ms</span>
                )}
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${componentStyles(check.status)}`}
                >
                  {check.status}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}