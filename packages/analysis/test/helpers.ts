import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeHtmlDocument } from '../src/document/normalize';
import type { FetchedWebsite, NormalizedWebsiteDocument } from '../src/document/document';
import type { Analyzer } from '../src/analyzers/analyzer';
import type { Finding } from '../src/types';
import type { FetchImpl, HttpResponse } from '../src/fetcher/fetcher';

export function loadFixture(name: string): string {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf8');
}

export function asyncIterableFromString(value: string): AsyncIterable<Uint8Array> {
  const buffer = Buffer.from(value, 'utf8');
  return (async function* () {
    yield new Uint8Array(buffer);
  })();
}

export interface MockRequest {
  url: string;
  headers: Record<string, string>;
  signal: AbortSignal;
}

export function createMockFetch(handler: (request: MockRequest) => HttpResponse | Promise<HttpResponse>): FetchImpl {
  return async (url, init) => handler({ url, headers: init.headers, signal: init.signal });
}

export function htmlResponse(
  status: number,
  html: string,
  headers: Record<string, string> = {},
): HttpResponse {
  return {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
    body: asyncIterableFromString(html),
  };
}

/** DNS stub resolving every hostname to a public address. */
export const publicLookup = async (): Promise<{ address: string; family: number }[]> => [
  { address: '93.184.216.34', family: 4 },
];

export function makeFetched(overrides: Partial<FetchedWebsite> & { html: string }): FetchedWebsite {
  const html = overrides.html;
  return {
    url: overrides.url ?? 'https://example.com/',
    finalUrl: overrides.finalUrl ?? 'https://example.com/',
    statusCode: overrides.statusCode ?? 200,
    headers: overrides.headers ?? {},
    contentType: overrides.contentType ?? 'text/html',
    contentLength: overrides.contentLength ?? Buffer.byteLength(html, 'utf8'),
    responseDurationMs: overrides.responseDurationMs ?? 100,
    html,
    redirectCount: overrides.redirectCount ?? 0,
    fetchTimestamp: overrides.fetchTimestamp ?? '2026-09-05T00:00:00.000Z',
  };
}

export function documentFromHtml(html: string, overrides: Partial<FetchedWebsite> = {}): NormalizedWebsiteDocument {
  return normalizeHtmlDocument(makeFetched({ html, ...overrides }));
}

export function analyzeHtml(analyzer: Analyzer, html: string, overrides: Partial<FetchedWebsite> = {}): Finding[] {
  return analyzer.analyze(documentFromHtml(html, overrides));
}

export function findingCodes(findings: readonly Finding[]): string[] {
  return findings.map((finding) => finding.code);
}