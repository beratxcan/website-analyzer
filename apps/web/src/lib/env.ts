/**
 * Resolves the API base URL for browser-side requests.
 *
 * `NEXT_PUBLIC_API_URL` is inlined by Next.js at build time; when unset the
 * local development default (`http://localhost:4000`) is used.
 */
export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (raw && raw.length > 0) {
    return raw.replace(/\/+$/, '');
  }
  return 'http://localhost:4000';
}