import { describe, expect, it } from 'vitest';
import { AnalysisEngine } from '../src/engine';
import { documentFromHtml, loadFixture } from './helpers';

const IDEAL_HEADERS = {
  'strict-transport-security': 'max-age=31536000',
  'content-security-policy': "default-src 'self'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'content-encoding': 'gzip',
  'cache-control': 'public, max-age=3600',
};

const engine = new AnalysisEngine();

function analyzeFixture(name: string, overrides: Parameters<typeof documentFromHtml>[1] = {}) {
  return engine.analyzeDocument(documentFromHtml(loadFixture(name), overrides));
}

describe('golden fixtures', () => {
  it('ideal-page.html produces zero findings and a perfect score', () => {
    const result = analyzeFixture('ideal-page.html', { headers: IDEAL_HEADERS });
    expect(result.status).toBe('completed');
    expect(result.findings).toEqual([]);
    expect(result.overallScore).toBe(100);
    expect(result.categoryScores).toEqual({
      seo: 100,
      technical: 100,
      content: 100,
      accessibility: 100,
      performance: 100,
    });
  });

  it('poor-seo.html triggers the expected SEO findings', () => {
    const result = analyzeFixture('poor-seo.html');
    const codes = result.findings.map((f) => f.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'SEO_TITLE_TOO_LONG',
        'SEO_META_DESCRIPTION_MISSING',
        'SEO_H1_MISSING',
        'SEO_CANONICAL_INVALID',
        'SEO_ROBOTS_MISSING',
        'SEO_LANG_MISSING',
        'SEO_OG_TITLE_MISSING',
        'SEO_OG_DESCRIPTION_MISSING',
        'SEO_OG_IMAGE_MISSING',
        'SEO_IMAGE_ALT_MISSING',
        'SEO_EMPTY_LINK',
      ]),
    );
    expect(codes).not.toContain('SEO_TITLE_MISSING');
    expect(codes).not.toContain('SEO_TITLE_EMPTY');
    expect(codes).not.toContain('SEO_ROBOTS_NOINDEX');
    expect(codes).not.toContain('SEO_CANONICAL_MISSING');
    expect(result.overallScore).not.toBeNull();
    expect(result.overallScore).toBeLessThan(80);
  });

  it('accessibility-issues.html triggers the expected accessibility findings', () => {
    const result = analyzeFixture('accessibility-issues.html');
    const codes = result.findings.map((f) => f.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'A11Y_IMAGE_ALT_MISSING',
        'A11Y_FORM_LABEL_MISSING',
        'A11Y_HTML_LANG_MISSING',
        'A11Y_HEADING_ORDER',
        'A11Y_BUTTON_NO_TEXT',
        'A11Y_LINK_NO_TEXT',
        'A11Y_VIEWPORT_MISSING',
        'A11Y_LANDMARK_MISSING',
        'A11Y_DUPLICATE_ID',
        'A11Y_ARIA_MISUSE',
      ]),
    );
  });

  it('technical-issues.html triggers the expected technical findings', () => {
    const result = analyzeFixture('technical-issues.html', {
      finalUrl: 'http://insecure.example/',
      statusCode: 500,
      headers: {},
    });
    const codes = result.findings.map((f) => f.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'TECH_HTTPS',
        'TECH_HTTP_STATUS',
        'TECH_VIEWPORT_MISSING',
        'TECH_CHARSET_MISSING',
        'TECH_DOCTYPE_MISSING',
        'TECH_SECURITY_HEADER_MISSING',
        'TECH_SITEMAP_REFERENCE_MISSING',
        'TECH_JAVASCRIPT_LINK',
      ]),
    );
  });

  it('content-issues.html triggers the expected content findings', () => {
    const result = analyzeFixture('content-issues.html');
    const codes = result.findings.map((f) => f.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'CONTENT_LOW_TEXT_LENGTH',
        'CONTENT_LOW_WORD_COUNT',
        'CONTENT_NO_HEADINGS',
        'CONTENT_LOW_TEXT_TO_MARKUP_RATIO',
        'CONTENT_DUPLICATE_TEXT',
      ]),
    );
  });

  it('large-page.html triggers the oversized HTML finding', () => {
    const result = analyzeFixture('large-page.html');
    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain('PERF_HTML_TOO_LARGE');
  });

  it('malformed-page.html normalizes and analyzes without crashing', () => {
    const result = analyzeFixture('malformed-page.html');
    expect(result.status).toBe('completed');
    expect(result.findings.length).toBeGreaterThan(0);
    const codes = result.findings.map((f) => f.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'TECH_DOCTYPE_MISSING',
        'TECH_CHARSET_MISSING',
        'SEO_CANONICAL_MISSING',
        'SEO_META_DESCRIPTION_MISSING',
        'A11Y_VIEWPORT_MISSING',
      ]),
    );
  });
});