/** Thrown when a website URL fails validation or normalization. */
export class WebsiteUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebsiteUrlError';
  }
}

export interface NormalizedWebsiteUrl {
  /** The original URL as provided (trimmed). */
  url: string;
  /**
   * Canonical form used for identity/deduplication:
   * `scheme://host[:port]/path` — lowercase host, default ports and
   * trailing slashes stripped, query and fragment removed.
   */
  normalizedUrl: string;
  /** Lowercased hostname of the target. */
  host: string;
}

/**
 * Validates a website target URL and derives its canonical form.
 *
 * Rules:
 * - HTTP/HTTPS only
 * - absolute URLs only
 * - credentials in the URL (user:pass@) are rejected
 * - hostname required
 *
 * Throws {@link WebsiteUrlError} when the input is not acceptable.
 */
export function normalizeWebsiteUrl(input: string): NormalizedWebsiteUrl {
  const url = input.trim();

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new WebsiteUrlError('URL is not a valid absolute URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new WebsiteUrlError('URL must use the http or https protocol');
  }

  if (parsed.username !== '' || parsed.password !== '') {
    throw new WebsiteUrlError('URL must not contain credentials');
  }

  if (parsed.hostname === '') {
    throw new WebsiteUrlError('URL must include a hostname');
  }

  const host = parsed.hostname.toLowerCase();
  const defaultPort =
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443');
  const port = parsed.port !== '' && !defaultPort ? `:${parsed.port}` : '';
  const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');

  return {
    url,
    normalizedUrl: `${parsed.protocol}//${host}${port}${path}`,
    host,
  };
}