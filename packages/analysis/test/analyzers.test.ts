import { describe, expect, it } from 'vitest';
import { SeoAnalyzer } from '../src/analyzers/seo';
import { TechnicalAnalyzer } from '../src/analyzers/technical';
import { ContentAnalyzer } from '../src/analyzers/content';
import { AccessibilityAnalyzer } from '../src/analyzers/accessibility';
import { PerformanceAnalyzer } from '../src/analyzers/performance';
import { analyzeHtml, findingCodes } from './helpers';

const seo = new SeoAnalyzer();
const technical = new TechnicalAnalyzer();
const content = new ContentAnalyzer();
const accessibility = new AccessibilityAnalyzer();
const performance = new PerformanceAnalyzer();

const LONG_TEXT = Array.from({ length: 40 }, (_, i) => `Paragraph number ${i + 1} with enough words to comfortably exceed the minimum thresholds used by the content analyzer.`).join(' ');

describe('SeoAnalyzer', () => {
  it('passes a complete document', () => {
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Perfect Page</title>
      <meta name="description" content="Short description"><meta name="robots" content="index, follow">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta property="og:title" content="T"><meta property="og:description" content="D"><meta property="og:image" content="https://example.com/i.png">
      <link rel="canonical" href="https://example.com/"><link rel="stylesheet" href="/s.css">
      <script src="/a.js"></script></head>
      <body><h1>Main</h1><h2>Sub</h2><p>${LONG_TEXT}</p>
      <img src="/a.png" alt="A"><a href="/x">Link</a></body></html>`;
    expect(findingCodes(analyzeHtml(seo, html))).toEqual([]);
  });

  it.each([
    ['missing title', '<html><body>x</body></html>', 'SEO_TITLE_MISSING'],
    ['empty title', '<html><head><title>  </title></head><body>x</body></html>', 'SEO_TITLE_EMPTY'],
    [
      'title too long',
      `<html><head><title>${'x'.repeat(65)}</title></head><body>x</body></html>`,
      'SEO_TITLE_TOO_LONG',
    ],
    ['missing meta description', '<html><head><title>T</title></head><body>x</body></html>', 'SEO_META_DESCRIPTION_MISSING'],
    ['empty meta description', '<html><head><meta name="description" content=""></head><body>x</body></html>', 'SEO_META_DESCRIPTION_EMPTY'],
    ['meta description too long', `<html><head><meta name="description" content="${'y'.repeat(161)}"></head><body>x</body></html>`, 'SEO_META_DESCRIPTION_TOO_LONG'],
    ['missing h1', '<html><body><h2>Sub</h2></body></html>', 'SEO_H1_MISSING'],
    ['multiple h1', '<html><body><h1>A</h1><h1>B</h1></body></html>', 'SEO_MULTIPLE_H1'],
    ['heading hierarchy', '<html><body><h1>A</h1><h3>Jump</h3></body></html>', 'SEO_HEADING_HIERARCHY'],
    ['missing canonical', '<html><head><title>T</title></head><body>x</body></html>', 'SEO_CANONICAL_MISSING'],
    ['relative canonical', '<html><head><link rel="canonical" href="/page"></head><body>x</body></html>', 'SEO_CANONICAL_INVALID'],
    ['missing robots', '<html><head><title>T</title></head><body>x</body></html>', 'SEO_ROBOTS_MISSING'],
    ['robots noindex', '<html><head><meta name="robots" content="noindex"></head><body>x</body></html>', 'SEO_ROBOTS_NOINDEX'],
    ['missing lang', '<html><body>x</body></html>', 'SEO_LANG_MISSING'],
    ['missing og:title', '<html><head><title>T</title></head><body>x</body></html>', 'SEO_OG_TITLE_MISSING'],
    ['missing og:description', '<html><head><title>T</title></head><body>x</body></html>', 'SEO_OG_DESCRIPTION_MISSING'],
    ['missing og:image', '<html><head><title>T</title></head><body>x</body></html>', 'SEO_OG_IMAGE_MISSING'],
    ['image without alt', '<html><body><img src="/a.png"></body></html>', 'SEO_IMAGE_ALT_MISSING'],
    ['empty link', '<html><body><a>No href</a></body></html>', 'SEO_EMPTY_LINK'],
  ])('reports %s', (_name, html, expectedCode) => {
    expect(findingCodes(analyzeHtml(seo, html))).toContain(expectedCode);
  });

  it('does not report noindex when robots meta is absent', () => {
    const findings = analyzeHtml(seo, '<html><body>x</body></html>');
    expect(findingCodes(findings)).not.toContain('SEO_ROBOTS_NOINDEX');
  });
});

describe('TechnicalAnalyzer', () => {
  const secureHeaders = {
    'strict-transport-security': 'max-age=31536000',
    'content-security-policy': "default-src 'self'",
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
  };

  it('passes a fully secured document', () => {
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="canonical" href="https://example.com/"><link rel="sitemap" href="/sitemap.xml">
      <script src="/a.js"></script><link rel="stylesheet" href="/s.css"></head>
      <body><h1>Main</h1><p>${LONG_TEXT}</p></body></html>`;
    const findings = analyzeHtml(technical, html, {
      headers: { ...secureHeaders, 'content-encoding': 'gzip' },
    });
    expect(findingCodes(findings)).toEqual([]);
  });

  it.each([
    ['plain http', '<html><body>x</body></html>', 'TECH_HTTPS', { finalUrl: 'http://example.com/' }],
    ['bad status', '<html><body>x</body></html>', 'TECH_HTTP_STATUS', { statusCode: 500 }],
    ['missing viewport', '<html><head><meta charset="utf-8"></head><body>x</body></html>', 'TECH_VIEWPORT_MISSING', {}],
    ['missing charset', '<html><head></head><body>x</body></html>', 'TECH_CHARSET_MISSING', {}],
    ['missing doctype', '<html><head><meta charset="utf-8"></head><body>x</body></html>', 'TECH_DOCTYPE_MISSING', {}],
    ['missing sitemap reference', '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>x</body></html>', 'TECH_SITEMAP_REFERENCE_MISSING', {}],
    ['javascript link', '<html><body><a href="javascript:void(0)">x</a></body></html>', 'TECH_JAVASCRIPT_LINK', {}],
  ])('reports %s', (_name, html, expectedCode, overrides) => {
    expect(findingCodes(analyzeHtml(technical, html, overrides))).toContain(expectedCode);
  });

  it('reports missing security headers with names in evidence', () => {
    const findings = analyzeHtml(technical, '<html><body>x</body></html>', { headers: {} });
    const finding = findings.find((f) => f.code === 'TECH_SECURITY_HEADER_MISSING');
    expect(finding).toBeDefined();
    const names = finding?.evidence.filter((e) => e.type === 'header').map((e) => (e as { name: string }).name);
    expect(names).toContain('strict-transport-security');
    expect(names).toContain('content-security-policy');
  });

  it('reports mixed content when an HTTPS page loads HTTP resources', () => {
    const findings = analyzeHtml(
      technical,
      '<html><head><script src="http://cdn.example.com/x.js"></script></head><body><img src="http://cdn.example.com/i.png"></body></html>',
    );
    expect(findingCodes(findings)).toContain('TECH_MIXED_CONTENT');
  });

  it('reports canonical mismatch against the final URL', () => {
    const findings = analyzeHtml(
      technical,
      '<html><head><link rel="canonical" href="https://other.example.com/"></head><body>x</body></html>',
    );
    expect(findingCodes(findings)).toContain('TECH_CANONICAL');
  });

  it('passes when canonical matches the final URL', () => {
    const findings = analyzeHtml(
      technical,
      '<html><head><link rel="canonical" href="https://example.com/"></head><body>x</body></html>',
    );
    expect(findingCodes(findings)).not.toContain('TECH_CANONICAL');
  });
});

describe('ContentAnalyzer', () => {
  it('passes a document with substantial unique text', () => {
    const html = `<html lang="en"><head><title>T</title></head><body>
      <h1>Main</h1><p>${LONG_TEXT}</p><p>Second paragraph with enough words to count as real content for the analyzer.</p>
      </body></html>`;
    expect(findingCodes(analyzeHtml(content, html))).toEqual([]);
  });

  it('reports thin content', () => {
    const html = '<html><body><p>hi</p></body></html>';
    const codes = findingCodes(analyzeHtml(content, html));
    expect(codes).toContain('CONTENT_LOW_TEXT_LENGTH');
    expect(codes).toContain('CONTENT_LOW_WORD_COUNT');
    expect(codes).toContain('CONTENT_LOW_PARAGRAPH_COUNT');
  });

  it('reports missing headings', () => {
    const html = `<html><body><p>${LONG_TEXT}</p></body></html>`;
    expect(findingCodes(analyzeHtml(content, html))).toContain('CONTENT_NO_HEADINGS');
  });

  it('reports a low text-to-markup ratio', () => {
    const html = `<html><body><style>${'/* ' + 'x'.repeat(3000) + ' */'}</style><p>tiny text</p></body></html>`;
    expect(findingCodes(analyzeHtml(content, html))).toContain('CONTENT_LOW_TEXT_TO_MARKUP_RATIO');
  });

  it('reports repeated paragraph text', () => {
    const repeated = '<p>This exact sentence is repeated many times across the page layout boilerplate.</p>';
    const html = `<html><body>${repeated}${repeated}${repeated}${repeated}</body></html>`;
    expect(findingCodes(analyzeHtml(content, html))).toContain('CONTENT_DUPLICATE_TEXT');
  });
});

describe('AccessibilityAnalyzer', () => {
  it('passes an accessible document', () => {
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body><header><nav><a href="/">Home</a></nav></header><main>
      <h1>Main</h1><h2>Sub</h2>
      <label for="name">Name</label><input id="name">
      <button type="button">Save</button>
      <img src="/a.png" alt="A">
      </main><footer><p>${LONG_TEXT}</p></footer></body></html>`;
    expect(findingCodes(analyzeHtml(accessibility, html))).toEqual([]);
  });

  it.each([
    ['image without alt', '<html lang="en"><body><img src="/a.png"></body></html>', 'A11Y_IMAGE_ALT_MISSING'],
    ['unlabeled input', '<html lang="en"><body><input></body></html>', 'A11Y_FORM_LABEL_MISSING'],
    ['missing lang', '<html><body>x</body></html>', 'A11Y_HTML_LANG_MISSING'],
    ['heading order', '<html lang="en"><body><h1>A</h1><h3>C</h3></body></html>', 'A11Y_HEADING_ORDER'],
    ['empty button', '<html lang="en"><body><button></button></body></html>', 'A11Y_BUTTON_NO_TEXT'],
    ['empty link', '<html lang="en"><body><a href="/x"></a></body></html>', 'A11Y_LINK_NO_TEXT'],
    ['missing viewport', '<html lang="en"><body>x</body></html>', 'A11Y_VIEWPORT_MISSING'],
    ['no landmarks', '<html lang="en"><body><div>content</div></body></html>', 'A11Y_LANDMARK_MISSING'],
    ['duplicate ids', '<html lang="en"><body><div id="x"></div><div id="x"></div></body></html>', 'A11Y_DUPLICATE_ID'],
    ['aria-hidden button', '<html lang="en"><body><button aria-hidden="true">x</button></body></html>', 'A11Y_ARIA_MISUSE'],
  ])('reports %s', (_name, html, expectedCode) => {
    expect(findingCodes(analyzeHtml(accessibility, html))).toContain(expectedCode);
  });

  it('treats empty alt as decorative (allowed)', () => {
    const findings = analyzeHtml(accessibility, '<html lang="en"><body><img src="/a.png" alt=""></body></html>');
    expect(findingCodes(findings)).not.toContain('A11Y_IMAGE_ALT_MISSING');
  });

  it('treats label[for] association as labeled', () => {
    const findings = analyzeHtml(
      accessibility,
      '<html lang="en"><body><label for="email">Email</label><input id="email"></body></html>',
    );
    expect(findingCodes(findings)).not.toContain('A11Y_FORM_LABEL_MISSING');
  });
});

describe('PerformanceAnalyzer', () => {
  it('passes a lean document', () => {
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
      <link rel="preconnect" href="https://fonts.example.com"></head>
      <body><h1>Main</h1><img src="/a.png" width="100" height="100" alt="A"><p>${LONG_TEXT}</p></body></html>`;
    const findings = analyzeHtml(performance, html, { headers: { 'content-encoding': 'gzip', 'cache-control': 'max-age=3600' } });
    expect(findingCodes(findings)).toEqual([]);
  });

  it('reports an oversized HTML document', () => {
    const html = `<html><body>${'x'.repeat(600 * 1024)}</body></html>`;
    expect(findingCodes(analyzeHtml(performance, html))).toContain('PERF_HTML_TOO_LARGE');
  });

  it('reports too many scripts', () => {
    const scripts = Array.from({ length: 16 }, (_, i) => `<script src="/s${i}.js"></script>`).join('');
    expect(findingCodes(analyzeHtml(performance, `<html><head>${scripts}</head><body>x</body></html>`))).toContain('PERF_SCRIPT_COUNT');
  });

  it('reports too many stylesheets', () => {
    const sheets = Array.from({ length: 6 }, (_, i) => `<link rel="stylesheet" href="/c${i}.css">`).join('');
    expect(findingCodes(analyzeHtml(performance, `<html><head>${sheets}</head><body>x</body></html>`))).toContain('PERF_STYLESHEET_COUNT');
  });

  it('reports too many images', () => {
    const images = Array.from({ length: 31 }, (_, i) => `<img src="/i${i}.png" width="10" height="10">`).join('');
    expect(findingCodes(analyzeHtml(performance, `<html><body>${images}</body></html>`))).toContain('PERF_IMAGE_COUNT');
  });

  it('reports external resources', () => {
    const scripts = Array.from({ length: 21 }, (_, i) => `<script src="https://cdn.example.com/s${i}.js"></script>`).join('');
    expect(findingCodes(analyzeHtml(performance, `<html><head>${scripts}</head><body>x</body></html>`))).toContain('PERF_EXTERNAL_RESOURCES');
  });

  it('reports large inline scripts and styles', () => {
    const html = `<html><head><script>${'x'.repeat(60 * 1024)}</script><style>${'y'.repeat(40 * 1024)}</style></head><body>x</body></html>`;
    const codes = findingCodes(analyzeHtml(performance, html));
    expect(codes).toContain('PERF_INLINE_SCRIPT_LARGE');
    expect(codes).toContain('PERF_INLINE_STYLE_LARGE');
  });

  it('reports images missing dimensions', () => {
    const images = Array.from({ length: 5 }, () => '<img src="/i.png" alt="a">').join('');
    expect(findingCodes(analyzeHtml(performance, `<html><body>${images}</body></html>`))).toContain('PERF_IMAGE_MISSING_DIMENSIONS');
  });

  it('reports missing preload hints', () => {
    expect(findingCodes(analyzeHtml(performance, '<html><body>x</body></html>'))).toContain('PERF_NO_PRELOAD_HINTS');
  });

  it('reports missing compression and cache headers', () => {
    const codes = findingCodes(analyzeHtml(performance, '<html><body>x</body></html>', { headers: {} }));
    expect(codes).toContain('PERF_NO_COMPRESSION');
    expect(codes).toContain('PERF_NO_CACHE_HEADERS');
  });
});