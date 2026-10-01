import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';
import type { LookupAddress, LookupOptions } from 'node:dns';
import type { LookupFunction } from 'node:net';
import type { FetchedWebsite } from '../document/document';
import { FetcherError, isAbortError } from './errors';
import { validateIpAddress, validateUrlForFetch, type LookupFn, type ResolvedAddress } from './ssrf';

const HTML_MEDIA_TYPES = new Set(['text/html', 'application/xhtml+xml']);

/** Minimal transport abstraction so the redirect/SSRF logic is fully testable. */
export interface HttpResponse {
  status: number;
  /** Lowercased header names. */
  headers: Record<string, string>;
  body: AsyncIterable<Uint8Array>;
  cancel?: () => Promise<void> | void;
}

export interface FetchInit {
  signal: AbortSignal;
  redirect: 'manual';
  headers: Record<string, string>;
  maxResponseSize: number;
}

export type FetchImpl = (url: string, init: FetchInit) => Promise<HttpResponse>;

export interface FetcherOptions {
  /** Socket connect timeout in milliseconds. Default 10_000. */
  connectionTimeoutMs?: number;
  /** Total request budget including redirects, in milliseconds. Default 30_000. */
  totalTimeoutMs?: number;
  /** Maximum redirects to follow. Default 5. */
  maxRedirects?: number;
  /** Maximum decompressed response body in bytes. Default 5_000_000. */
  maxResponseSizeBytes?: number;
  userAgent?: string;
  /** DNS resolver; defaults to the system resolver. Injectable for tests. */
  lookup?: LookupFn;
  /** Low-level transport; defaults to undici. Injectable for tests. */
  fetchImpl?: FetchImpl;
}

const DEFAULT_OPTIONS: Required<
  Pick<FetcherOptions, 'connectionTimeoutMs' | 'totalTimeoutMs' | 'maxRedirects' | 'maxResponseSizeBytes' | 'userAgent'>
> = {
  connectionTimeoutMs: 10_000,
  totalTimeoutMs: 30_000,
  maxRedirects: 5,
  maxResponseSizeBytes: 5_000_000,
  userAgent: 'website-analyzer/0.2 (+https://github.com/website-analyzer)',
};

async function defaultLookup(hostname: string): Promise<ResolvedAddress[]> {
  const { promises: dns } = await import('node:dns');
  const result = await dns.lookup(hostname, { all: true, verbatim: true });
  return result.map((entry) => ({ address: entry.address, family: entry.family }));
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400 && status !== 304;
}

function parseMediaType(contentType: string | undefined): string | null {
  if (contentType === undefined) return null;
  const media = contentType.split(';')[0]?.trim().toLowerCase();
  return media !== undefined && media !== '' ? media : null;
}

async function readBody(
  body: AsyncIterable<Uint8Array>,
  limit: number,
  signal: AbortSignal,
): Promise<{ html: string; size: number }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of body) {
    if (signal.aborted) {
      throw new FetcherError('REQUEST_TIMEOUT', 'Request aborted before the response body was fully read');
    }
    size += chunk.byteLength;
    if (size > limit) {
      throw new FetcherError('RESPONSE_TOO_LARGE', `Response exceeds the ${limit}-byte size limit`);
    }
    chunks.push(Buffer.from(chunk));
  }
  return { html: Buffer.concat(chunks).toString('utf8'), size };
}

/**
 * Fetches a single website HTML document with SSRF protection.
 *
 * The fetcher is deliberately restricted to the main HTML document — it never
 * fetches images, scripts, stylesheets or any other subresource, keeping the
 * SSRF surface area minimal.
 */
function emptyBody(): AsyncIterable<Uint8Array> {
  return (async function* () {
    /* empty */
  })();
}

/**
 * Wraps the resolver so the socket layer only ever sees addresses that
 * passed validation. Pre-flight validation covers DNS rebinding between the
 * check and the connect for the *cached* answer; filtering here covers a
 * rebinding answer that arrives on a second lookup.
 */
function createSafeLookup(lookup: LookupFn): LookupFunction {
  return (hostname: string, lookupOptions: LookupOptions, callback) => {
    lookup(hostname, { ...lookupOptions }).then(
      (addresses) => {
        const allowed = addresses.filter((entry) => validateIpAddress(entry.address).allowed);
        if (allowed.length === 0) {
          callback(
            new Error(`Refusing to connect: every resolved address for ${hostname} is blocked`),
            '0.0.0.0',
          );
          return;
        }
        const mapped: LookupAddress[] = allowed.map((address) => ({
          address: address.address,
          family: address.family,
        }));
        if (lookupOptions.all === true) {
          callback(null, mapped);
          return;
        }
        const first = mapped[0];
        if (first === undefined) {
          callback(new Error(`Could not resolve ${hostname}`), '0.0.0.0');
          return;
        }
        callback(null, first.address, first.family);
      },
      (err) => callback(err instanceof Error ? err : new Error(String(err)), '0.0.0.0'),
    );
  };
}

function createUndiciTransport(dispatcher: Agent): FetchImpl {
  return async (url, init) => {
    const response = await undiciFetch(url, {
      method: 'GET',
      signal: init.signal,
      redirect: 'manual',
      maxResponseSize: init.maxResponseSize,
      dispatcher,
      headers: init.headers,
    } as unknown as UndiciRequestInit);
    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
    return {
      status: response.status,
      headers,
      body: response.body ?? emptyBody(),
      cancel: () => response.body?.cancel(),
    };
  };
}

export class WebsiteFetcher {
  private readonly connectionTimeoutMs: number;
  private readonly totalTimeoutMs: number;
  private readonly maxRedirects: number;
  private readonly maxResponseSizeBytes: number;
  private readonly userAgent: string;
  private readonly lookup: LookupFn;
  private readonly fetchImpl: FetchImpl;

  constructor(options: FetcherOptions = {}) {
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? DEFAULT_OPTIONS.connectionTimeoutMs;
    this.totalTimeoutMs = options.totalTimeoutMs ?? DEFAULT_OPTIONS.totalTimeoutMs;
    this.maxRedirects = options.maxRedirects ?? DEFAULT_OPTIONS.maxRedirects;
    this.maxResponseSizeBytes = options.maxResponseSizeBytes ?? DEFAULT_OPTIONS.maxResponseSizeBytes;
    this.userAgent = options.userAgent ?? DEFAULT_OPTIONS.userAgent;
    this.lookup = options.lookup ?? defaultLookup;
    if (options.fetchImpl !== undefined) {
      this.fetchImpl = options.fetchImpl;
    } else {
      // Defense in depth: every connection attempt resolves through the
      // validating lookup, closing the DNS-rebinding window between our
      // pre-flight check and the actual connect.
      const dispatcher = new Agent({
        connect: {
          timeout: this.connectionTimeoutMs,
          lookup: createSafeLookup(this.lookup),
        },
      });
      this.fetchImpl = createUndiciTransport(dispatcher);
    }
  }

  async fetch(rawUrl: string): Promise<FetchedWebsite> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.totalTimeoutMs);
    try {
      const initialUrl = await validateUrlForFetch(rawUrl, this.lookup);
      let currentUrl = initialUrl;
      let redirectCount = 0;
      let response: HttpResponse | null = null;

      for (;;) {
        const current = await this.request(currentUrl, controller.signal);
        const location = current.headers.location;

        if (isRedirect(current.status) && location !== undefined) {
          await current.cancel?.();
          if (redirectCount >= this.maxRedirects) {
            throw new FetcherError(
              'REDIRECT_LIMIT_EXCEEDED',
              `More than ${this.maxRedirects} redirects while fetching ${rawUrl}`,
            );
          }
          // Redirect targets are validated exactly like the initial URL.
          currentUrl = await validateUrlForFetch(new URL(location, currentUrl).toString(), this.lookup);
          redirectCount += 1;
          continue;
        }

        response = current;
        break;
      }

      const contentType = parseMediaType(response.headers['content-type']);
      if (contentType !== null && !HTML_MEDIA_TYPES.has(contentType)) {
        throw new FetcherError(
          'INVALID_CONTENT_TYPE',
          `Content type "${contentType}" is not a supported HTML document`,
        );
      }

      const { html, size } = await readBody(response.body, this.maxResponseSizeBytes, controller.signal);

      return {
        url: rawUrl,
        finalUrl: currentUrl.toString(),
        statusCode: response.status,
        headers: response.headers,
        contentType,
        contentLength: size,
        responseDurationMs: Date.now() - startedAt,
        html,
        redirectCount,
        fetchTimestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw this.mapError(error);
    } finally {
      clearTimeout(timer);
    }
  }

  private async request(url: URL, signal: AbortSignal): Promise<HttpResponse> {
    try {
      return await this.fetchImpl(url.toString(), {
        signal,
        redirect: 'manual',
        headers: {
          accept: 'text/html, application/xhtml+xml',
          'accept-encoding': 'gzip, deflate, br',
          'user-agent': this.userAgent,
        },
        maxResponseSize: this.maxResponseSizeBytes,
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): Error {
    if (error instanceof FetcherError) {
      return error;
    }
    if (isAbortError(error)) {
      return new FetcherError('REQUEST_TIMEOUT', `Request exceeded the ${this.totalTimeoutMs}ms total timeout`);
    }
    const cause = (error as { cause?: { code?: string } }).cause;
    if (cause?.code === 'ETIMEDOUT') {
      return new FetcherError('CONNECTION_TIMEOUT', `Connection to the target exceeded ${this.connectionTimeoutMs}ms`);
    }
    if (cause?.code === 'ECONNREFUSED') {
      return new FetcherError('CONNECTION_REFUSED', 'Connection to the target was refused');
    }
    if (cause?.code === 'ENOTFOUND' || cause?.code === 'EAI_AGAIN') {
      return new FetcherError('DNS_RESOLUTION_FAILED', 'Could not resolve the target hostname');
    }
    return new FetcherError('FETCH_FAILED', `Fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}