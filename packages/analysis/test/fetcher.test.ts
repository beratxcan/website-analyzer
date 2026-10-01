import { describe, expect, it } from 'vitest';
import { WebsiteFetcher, type FetcherOptions } from '../src/fetcher/fetcher';
import { FetcherError } from '../src/fetcher/errors';
import {
  asyncIterableFromString,
  createMockFetch,
  htmlResponse,
  publicLookup,
} from './helpers';

const IDEAL_HTML = '<!DOCTYPE html><html><head><title>Example</title></head><body><p>Hello</p></body></html>';

function fetcher(options: FetcherOptions = {}): WebsiteFetcher {
  return new WebsiteFetcher({ lookup: publicLookup, ...options });
}

describe('WebsiteFetcher', () => {
  it('fetches a valid HTTPS document and reports metadata', async () => {
    const calls: string[] = [];
    const f = fetcher({
      fetchImpl: createMockFetch((req) => {
        calls.push(req.url);
        return htmlResponse(200, IDEAL_HTML, { 'x-custom': 'value', 'content-encoding': 'gzip' });
      }),
    });

    const result = await f.fetch('https://example.com/');

    expect(calls).toEqual(['https://example.com/']);
    expect(result.statusCode).toBe(200);
    expect(result.finalUrl).toBe('https://example.com/');
    expect(result.contentType).toBe('text/html');
    expect(result.html).toContain('<title>Example</title>');
    expect(result.contentLength).toBe(Buffer.byteLength(IDEAL_HTML, 'utf8'));
    expect(result.redirectCount).toBe(0);
    expect(result.headers['x-custom']).toBe('value');
    expect(result.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(result.fetchTimestamp).toBeTruthy();
    expect(result.responseDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('fetches a plain HTTP document', async () => {
    const f = fetcher({
      fetchImpl: createMockFetch(() => htmlResponse(200, IDEAL_HTML)),
    });
    const result = await f.fetch('http://example.com/');
    expect(result.statusCode).toBe(200);
    expect(result.finalUrl).toBe('http://example.com/');
  });

  it('accepts a response without a content-type header', async () => {
    const f = fetcher({
      fetchImpl: createMockFetch(() => ({ status: 200, headers: {}, body: asyncIterableFromString(IDEAL_HTML) })),
    });
    const result = await f.fetch('https://example.com/');
    expect(result.contentType).toBeNull();
  });

  it('rejects an unsupported protocol before any network call', async () => {
    let called = false;
    const f = fetcher({
      fetchImpl: createMockFetch(() => {
        called = true;
        return htmlResponse(200, IDEAL_HTML);
      }),
    });
    await expect(f.fetch('ftp://example.com/file')).rejects.toMatchObject({ code: 'UNSUPPORTED_PROTOCOL' });
    expect(called).toBe(false);
  });

  it('rejects malformed URLs', async () => {
    await expect(fetcher().fetch('not a url')).rejects.toMatchObject({ code: 'INVALID_URL' });
  });

  it('rejects localhost', async () => {
    await expect(fetcher().fetch('http://localhost:3000/')).rejects.toMatchObject({ code: 'HOSTNAME_BLOCKED' });
  });

  it('rejects private IPv4 and IPv6 targets', async () => {
    const f = fetcher({
      fetchImpl: createMockFetch(() => htmlResponse(200, IDEAL_HTML)),
    });
    await expect(f.fetch('http://10.0.0.1/')).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
    await expect(f.fetch('http://127.0.0.1:8080/')).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
    await expect(f.fetch('http://[::1]/')).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
    await expect(f.fetch('http://[fc00::1]/')).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
  });

  it('rejects a hostname that resolves to a private address', async () => {
    const privateResolver = async () => [{ address: '192.168.1.5', family: 4 }];
    const f = new WebsiteFetcher({
      lookup: privateResolver,
      fetchImpl: createMockFetch(() => htmlResponse(200, IDEAL_HTML)),
    });
    await expect(f.fetch('http://internal.example.com/')).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
  });

  it('rejects redirects to a private IP, re-validating every hop', async () => {
    let secondCall = false;
    const f = fetcher({
      fetchImpl: createMockFetch((req) => {
        if (req.url === 'https://example.com/') {
          return htmlResponse(301, '', { location: 'http://10.0.0.2/secret' });
        }
        secondCall = true;
        return htmlResponse(200, IDEAL_HTML);
      }),
    });
    await expect(f.fetch('https://example.com/')).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
    expect(secondCall).toBe(false);
  });

  it('follows safe redirects and reports the final URL', async () => {
    const calls: string[] = [];
    const f = fetcher({
      fetchImpl: createMockFetch((req) => {
        calls.push(req.url);
        if (req.url === 'https://example.com/') {
          return htmlResponse(302, '', { location: 'https://example.com/final' });
        }
        return htmlResponse(200, IDEAL_HTML, { 'content-encoding': 'br' });
      }),
    });
    const result = await f.fetch('https://example.com/');
    expect(calls).toHaveLength(2);
    expect(result.finalUrl).toBe('https://example.com/final');
    expect(result.redirectCount).toBe(1);
    expect(result.headers['content-encoding']).toBe('br');
  });

  it('rejects redirect loops beyond the redirect limit', async () => {
    const f = fetcher({
      maxRedirects: 3,
      fetchImpl: createMockFetch((req) => {
        const match = /\/hop(\d+)$/.exec(req.url);
        const hop = match !== null ? Number(match[1]) : 0;
        return htmlResponse(301, '', { location: `https://example.com/hop${hop + 1}` });
      }),
    });
    await expect(f.fetch('https://example.com/hop0')).rejects.toMatchObject({ code: 'REDIRECT_LIMIT_EXCEEDED' });
  });

  it('times out when the total budget is exceeded', async () => {
    const f = new WebsiteFetcher({
      lookup: publicLookup,
      totalTimeoutMs: 50,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    });
    await expect(f.fetch('https://example.com/')).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
  });

  it('rejects responses over the size limit', async () => {
    const f = new WebsiteFetcher({
      lookup: publicLookup,
      maxResponseSizeBytes: 1000,
      fetchImpl: createMockFetch(() => htmlResponse(200, 'x'.repeat(2000))),
    });
    await expect(f.fetch('https://example.com/')).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
  });

  it('rejects non-HTML content types', async () => {
    const f = fetcher({
      fetchImpl: createMockFetch(() => ({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: asyncIterableFromString('{}'),
      })),
    });
    await expect(f.fetch('https://example.com/')).rejects.toMatchObject({ code: 'INVALID_CONTENT_TYPE' });
  });

  it('returns non-2xx responses instead of throwing', async () => {
    const f = fetcher({
      fetchImpl: createMockFetch(() => htmlResponse(404, '<html><body>Not found</body></html>')),
    });
    const result = await f.fetch('https://example.com/missing');
    expect(result.statusCode).toBe(404);
    expect(result.html).toContain('Not found');
  });

  it('maps network errors to typed codes', async () => {
    const networkError = (code: string) => ({
      name: 'TypeError',
      message: 'fetch failed',
      cause: { code },
    });
    await expect(
      fetcher({ fetchImpl: async () => Promise.reject(networkError('ETIMEDOUT')) }).fetch('https://example.com/'),
    ).rejects.toMatchObject({ code: 'CONNECTION_TIMEOUT' });
    await expect(
      fetcher({ fetchImpl: async () => Promise.reject(networkError('ECONNREFUSED')) }).fetch('https://example.com/'),
    ).rejects.toMatchObject({ code: 'CONNECTION_REFUSED' });
    await expect(
      fetcher({ fetchImpl: async () => Promise.reject(networkError('ENOTFOUND')) }).fetch('https://example.com/'),
    ).rejects.toMatchObject({ code: 'DNS_RESOLUTION_FAILED' });
    await expect(
      fetcher({ fetchImpl: async () => Promise.reject(new Error('boom')) }).fetch('https://example.com/'),
    ).rejects.toMatchObject({ code: 'FETCH_FAILED' });
  });

  it('rejects URLs with credentials', async () => {
    const f = fetcher({ fetchImpl: createMockFetch(() => htmlResponse(200, IDEAL_HTML)) });
    await expect(f.fetch('https://user:pass@example.com/')).rejects.toMatchObject({ code: 'URL_CREDENTIALS' });
  });

  it('always throws typed FetcherError instances', async () => {
    const f = fetcher({ fetchImpl: createMockFetch(() => htmlResponse(200, IDEAL_HTML)) });
    try {
      await f.fetch('http://localhost/');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(FetcherError);
    }
  });
});