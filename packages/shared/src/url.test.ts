import { describe, expect, it } from 'vitest';
import { normalizeWebsiteUrl, WebsiteUrlError } from './url';

describe('normalizeWebsiteUrl', () => {
  it('normalizes host, scheme, trailing slash and default port', () => {
    expect(normalizeWebsiteUrl('HTTPS://Example.COM:443/')).toEqual({
      url: 'HTTPS://Example.COM:443/',
      normalizedUrl: 'https://example.com',
      host: 'example.com',
    });
  });

  it('keeps non-default ports and paths', () => {
    expect(normalizeWebsiteUrl('https://example.com:8443/docs//')).toEqual({
      url: 'https://example.com:8443/docs//',
      normalizedUrl: 'https://example.com:8443/docs',
      host: 'example.com',
    });
  });

  it('removes query strings and fragments from the canonical form', () => {
    const result = normalizeWebsiteUrl('https://example.com/page?utm_source=x#section');
    expect(result.normalizedUrl).toBe('https://example.com/page');
    expect(result.host).toBe('example.com');
  });

  it('rejects unsupported protocols', () => {
    expect(() => normalizeWebsiteUrl('ftp://example.com')).toThrow(WebsiteUrlError);
    expect(() => normalizeWebsiteUrl('javascript:alert(1)')).toThrow(WebsiteUrlError);
  });

  it('rejects relative URLs', () => {
    expect(() => normalizeWebsiteUrl('example.com')).toThrow(WebsiteUrlError);
  });

  it('rejects URLs containing credentials', () => {
    expect(() => normalizeWebsiteUrl('https://user:pass@example.com')).toThrow(/credentials/);
  });

  it('rejects malformed URLs', () => {
    expect(() => normalizeWebsiteUrl('https://exa mple.com')).toThrow(WebsiteUrlError);
  });
});