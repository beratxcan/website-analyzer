import { describe, expect, it } from 'vitest';
import { documentFromHtml } from './helpers';

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>  Test   Title  </title>
  <meta name="description" content="A meta description">
  <meta name="robots" content="noindex, nofollow">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta property="og:title" content="OG Title">
  <meta property="og:image" content="https://example.com/og.png">
  <link rel="canonical" href="https://example.com/page">
  <link rel="stylesheet" href="/style.css">
  <link rel="preconnect" href="https://fonts.example.com">
  <link rel="sitemap" href="/sitemap.xml">
  <script src="/app.js"></script>
  <script>const x = 1;</script>
  <style>body { color: red; }</style>
</head>
<body>
  <h1>Heading One</h1>
  <h2>Sub Heading</h2>
  <img src="/a.png" alt="A">
  <img src="/b.png">
  <a href="/about">About</a>
  <a href="#">Empty</a>
  <p>First paragraph text.</p>
  <p>Second paragraph text.</p>
  <button type="submit">Save</button>
  <input id="email" aria-label="Email">
  <main>Visible content here</main>
</body></html>`;

describe('normalizeHtmlDocument', () => {
  const doc = documentFromHtml(SAMPLE_HTML, {
    headers: { 'content-encoding': 'gzip' },
  });

  it('normalizes the title', () => {
    expect(doc.title).toBe('Test Title');
  });

  it('extracts head metadata', () => {
    expect(doc.metaDescription).toBe('A meta description');
    expect(doc.canonical).toBe('https://example.com/page');
    expect(doc.robotsMeta).toBe('noindex, nofollow');
    expect(doc.viewport).toBe('width=device-width, initial-scale=1');
    expect(doc.charset).toBe('utf-8');
    expect(doc.doctype).toBe('html');
    expect(doc.language).toBe('en');
  });

  it('extracts Open Graph tags', () => {
    expect(doc.openGraph['og:title']).toBe('OG Title');
    expect(doc.openGraph['og:image']).toBe('https://example.com/og.png');
  });

  it('counts headings with levels', () => {
    expect(doc.headings).toEqual([
      { level: 1, text: 'Heading One' },
      { level: 2, text: 'Sub Heading' },
    ]);
  });

  it('extracts links with href, text and rel', () => {
    expect(doc.links).toHaveLength(2);
    expect(doc.links[0]).toMatchObject({ href: '/about', text: 'About', hasAccessibleName: true });
    expect(doc.links[1]).toMatchObject({ href: '#', text: 'Empty' });
  });

  it('distinguishes missing from empty alt attributes', () => {
    expect(doc.images).toHaveLength(2);
    expect(doc.images[0]).toMatchObject({ src: '/a.png', alt: 'A' });
    expect(doc.images[1]).toMatchObject({ src: '/b.png', alt: null });
  });

  it('separates external and inline scripts', () => {
    expect(doc.scripts).toHaveLength(2);
    expect(doc.scripts[0]).toMatchObject({ src: '/app.js', inlineSize: 0 });
    expect(doc.scripts[1]).toMatchObject({ src: null });
    expect(doc.scripts[1]?.inlineSize).toBeGreaterThan(0);
    expect(doc.inlineScriptSize).toBeGreaterThan(0);
  });

  it('counts stylesheets and inline styles', () => {
    expect(doc.stylesheets).toEqual([{ href: '/style.css' }]);
    expect(doc.inlineStyleSize).toBeGreaterThan(0);
  });

  it('extracts visible text without script or style content', () => {
    expect(doc.text).toContain('Heading One');
    expect(doc.text).toContain('Visible content here');
    expect(doc.text).not.toContain('const x = 1;');
    expect(doc.text).not.toContain('body { color: red; }');
    expect(doc.textLength).toBeGreaterThan(0);
    expect(doc.wordCount).toBeGreaterThan(0);
  });

  it('extracts paragraphs and counts them', () => {
    expect(doc.paragraphs).toEqual(['First paragraph text.', 'Second paragraph text.']);
    expect(doc.paragraphCount).toBe(2);
  });

  it('reports sizes', () => {
    expect(doc.htmlSize).toBe(Buffer.byteLength(SAMPLE_HTML, 'utf8'));
    expect(doc.bodySize).toBeGreaterThan(0);
  });

  it('collects structural accessibility signals', () => {
    expect(doc.formControls).toEqual([{ tag: 'input', type: null, labeled: true }]);
    expect(doc.buttons).toEqual([{ type: 'submit', hasAccessibleName: true }]);
    expect(doc.landmarks).toContain('main');
    expect(doc.duplicateIds).toEqual([]);
    expect(doc.ariaMisuseCount).toBe(0);
    expect(doc.hasSitemapReference).toBe(true);
    expect(doc.preloadHints).toBe(1);
  });

  it('propagates response metadata', () => {
    expect(doc.statusCode).toBe(200);
    expect(doc.headers['content-encoding']).toBe('gzip');
    expect(doc.finalUrl).toBe('https://example.com/');
  });

  it('detects duplicate ids', () => {
    const docWithDuplicates = documentFromHtml(
      '<html><body><div id="a"></div><div id="b"></div><div id="a"></div></body></html>',
    );
    expect(docWithDuplicates.duplicateIds).toEqual(['a']);
  });

  it('handles malformed HTML without throwing', () => {
    const malformed = documentFromHtml(
      '<div><span>unclosed <p>more text<div>nested<b>bold',
    );
    expect(malformed.text).toContain('unclosed');
    expect(malformed.htmlSize).toBeGreaterThan(0);
  });

  it('handles documents without a body element', () => {
    const headless = documentFromHtml('<html><head><title>T</title></head><p>text only</p></html>');
    expect(headless.text).toContain('text only');
  });

  it('reads charset from http-equiv when meta[charset] is absent', () => {
    const equiv = documentFromHtml(
      '<html><head><meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1"></head><body>x</body></html>',
    );
    expect(equiv.charset).toBe('iso-8859-1');
  });

  it('does not report a doctype when missing', () => {
    const noDoctype = documentFromHtml('<html><head><title>T</title></head><body>x</body></html>');
    expect(noDoctype.doctype).toBeNull();
  });
});