import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportDownloadButton } from '../src/components/analysis/report-download-button';
import { ApiClientError, type DownloadedFile } from '../src/lib/api/client';

const saveDownloadedFile = vi.fn();

vi.mock('../src/lib/download', () => ({
  saveDownloadedFile: (file: DownloadedFile) => saveDownloadedFile(file),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('ReportDownloadButton', () => {
  beforeEach(() => {
    saveDownloadedFile.mockReset();
  });

  it('saves the fetched pdf', async () => {
    const file: DownloadedFile = {
      blob: new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
      filename: 'example-com-analysis-2026-09-06.pdf',
    };
    render(<ReportDownloadButton getFile={() => Promise.resolve(file)} />);

    await userEvent.click(screen.getByRole('button', { name: 'Download Report' }));

    await waitFor(() => expect(saveDownloadedFile).toHaveBeenCalledWith(file));
    // The button returns to its idle label after a successful download.
    expect(screen.getByRole('button', { name: 'Download Report' })).toBeEnabled();
  });

  it('shows a generating state while the report is rendered', async () => {
    const pending = deferred<DownloadedFile>();
    render(<ReportDownloadButton getFile={() => pending.promise} label="Export Comparison Report" />);

    await userEvent.click(screen.getByRole('button', { name: 'Export Comparison Report' }));

    const generating = screen.getByRole('button', { name: /Generating report/ });
    expect(generating).toBeDisabled();
    expect(generating).toHaveAttribute('aria-busy', 'true');

    pending.resolve({
      blob: new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
      filename: 'example-com-comparison-2026-09-06.pdf',
    });
    await waitFor(() => expect(saveDownloadedFile).toHaveBeenCalled());
  });

  it('surfaces API errors inline without losing the page', async () => {
    render(
      <ReportDownloadButton
        getFile={() =>
          Promise.reject(new ApiClientError(409, 'REPORT_UNAVAILABLE', 'This analysis has no completed run to report yet'))
        }
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Download Report' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This analysis has no completed run to report yet');
    expect(saveDownloadedFile).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for unexpected failures', async () => {
    render(<ReportDownloadButton getFile={() => Promise.reject(new Error('boom'))} />);

    await userEvent.click(screen.getByRole('button', { name: 'Download Report' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The report could not be generated');
  });
});
