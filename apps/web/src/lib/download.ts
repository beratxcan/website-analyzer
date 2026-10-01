import type { DownloadedFile } from '@/lib/api/client';

/**
 * Triggers a browser download for an already-fetched binary file. The
 * filename comes from the server's `Content-Disposition` header, so it is
 * sanitized server-side rather than derived from user input here.
 */
export function saveDownloadedFile(file: DownloadedFile): void {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename ?? 'report.pdf';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
