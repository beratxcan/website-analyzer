'use client';

import { useState } from 'react';
import { Button, Spinner } from '@/components/ui';
import { ApiClientError, type DownloadedFile } from '@/lib/api/client';
import { saveDownloadedFile } from '@/lib/download';

type DownloadState = 'idle' | 'generating' | 'error';

/**
 * Fetches a server-rendered PDF report and saves it, surfacing a
 * "Generating report…" state while the request is in flight. The page state
 * around the button is untouched by a download, and failures degrade to an
 * accessible inline message instead of breaking the screen.
 */
export function ReportDownloadButton({
  getFile,
  label = 'Download Report',
  className = '',
}: {
  getFile: () => Promise<DownloadedFile>;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<DownloadState>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    setState('generating');
    setError(null);
    try {
      const file = await getFile();
      saveDownloadedFile(file);
      setState('idle');
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : 'The report could not be generated',
      );
      setState('error');
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="secondary"
        onClick={() => void handleClick()}
        disabled={state === 'generating'}
        aria-busy={state === 'generating'}
      >
        {state === 'generating' ? (
          <>
            <Spinner />
            <span className="ml-2">Generating report…</span>
          </>
        ) : (
          label
        )}
      </Button>
      {state === 'error' && error && (
        <p role="alert" className="mt-2 text-sm text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
