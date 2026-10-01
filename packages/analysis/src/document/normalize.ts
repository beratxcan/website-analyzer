import * as cheerio from 'cheerio';
import type { FetchedWebsite, NormalizedWebsiteDocument } from './document';

function normalizeText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function byteLength(input: string): number {
  return Buffer.byteLength(input, 'utf8');
}

/**
 * Parses a fetched HTML response once and derives the shared document every
 * analyzer consumes. Analyzers must not re-parse HTML; anything they need
 * should be exposed here.
 */
export function normalizeHtmlDocument(fetched: FetchedWebsite): NormalizedWebsiteDocument {
  const $ = cheerio.load(fetched.html);

  const htmlSize = byteLength(fetched.html);
  const bodySize = byteLength($('body').html() ?? '');

  // --- head data ---
  const titleEl = $('title').first();
  const title = titleEl.length > 0 ? normalizeText(titleEl.text()) : null;

  const metaDescription = $('meta[name="description"]').first().attr('content') ?? null;
  const canonical = $('link[rel~="canonical"][href]').first().attr('href')?.trim() ?? null;
  const robotsMeta = $('meta[name="robots"]').first().attr('content') ?? null;
  const viewport = $('meta[name="viewport"]').first().attr('content') ?? null;

  let charset = $('meta[charset]').first().attr('charset') ?? null;
  if (charset === null) {
    const httpEquiv = $('meta[http-equiv="content-type"]').first().attr('content');
    const match = httpEquiv !== undefined ? /charset=([\w-]+)/i.exec(httpEquiv) : null;
    charset = match?.[1] ?? null;
  }
  charset = charset !== null ? charset.replace(/^["']|["']$/g, '').toLowerCase() : null;

  const doctype = /^\s*<!doctype\s+([a-z0-9]+)/i.exec(fetched.html)?.[1]?.toLowerCase() ?? null;
  const language = $('html').first().attr('lang')?.trim() || null;

  const openGraph: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const property = $(el).attr('property');
    const content = $(el).attr('content');
    if (property !== undefined && content !== undefined) {
      openGraph[property] = content;
    }
  });

  // --- body data ---
  const headings = $('h1, h2, h3, h4, h5, h6')
    .map((_, el) => {
      const tag = el.tagName;
      return { level: Number(tag[1]), text: normalizeText($(el).text()) };
    })
    .get();

  const links = $('a')
    .map((_, el) => {
      const $el = $(el);
      const href = $el.attr('href') ?? null;
      const rel = ($el.attr('rel') ?? '').split(/\s+/).filter(Boolean);
      const text = normalizeText($el.text());
      const hasImgAlt = $el.find('img[alt]').length > 0;
      return {
        href,
        text,
        rel,
        hasAccessibleName: text !== '' || !!$el.attr('aria-label') || !!$el.attr('title') || hasImgAlt,
      };
    })
    .get();

  const images = $('img')
    .map((_, el) => {
      const $el = $(el);
      const alt = $el.attr('alt');
      return {
        src: $el.attr('src') ?? null,
        alt: alt === undefined ? null : alt,
        width: $el.attr('width') ?? null,
        height: $el.attr('height') ?? null,
      };
    })
    .get();

  const scripts: { src: string | null; inlineSize: number }[] = [];
  let inlineScriptSize = 0;
  $('script').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src');
    if (src !== undefined) {
      scripts.push({ src, inlineSize: 0 });
    } else {
      const size = byteLength($el.text() ?? '');
      scripts.push({ src: null, inlineSize: size });
      inlineScriptSize += size;
    }
  });

  const stylesheets = $('link[rel~="stylesheet"][href]')
    .map((_, el) => ({ href: $(el).attr('href') as string }))
    .get();

  let inlineStyleSize = 0;
  $('style').each((_, el) => {
    inlineStyleSize += byteLength($(el).text() ?? '');
  });

  const formControls = collectFormControls($);
  const buttons = $('button')
    .map((_, el) => {
      const $el = $(el);
      const text = normalizeText($el.text());
      const hasImgAlt = $el.find('img[alt]').length > 0;
      return {
        type: $el.attr('type') ?? null,
        hasAccessibleName: text !== '' || !!$el.attr('aria-label') || !!$el.attr('title') || hasImgAlt,
      };
    })
    .get();

  const landmarks: string[] = [];
  $('header, nav, main, footer').each((_, el) => {
    landmarks.push(el.tagName);
  });
  $('[role="banner"], [role="navigation"], [role="main"], [role="contentinfo"]').each((_, el) => {
    landmarks.push(`role:${$(el).attr('role')}`);
  });

  const idCounts = new Map<string, number>();
  $('[id]').each((_, el) => {
    const id = $(el).attr('id');
    if (id !== undefined) {
      idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    }
  });
  const duplicateIds = [...idCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);

  let ariaMisuseCount = 0;
  $('[aria-hidden="true"], [role="presentation"], [role="none"]').each((_, el) => {
    const $el = $(el);
    const focusable = $el.is('a[href], button, input, select, textarea, summary, [tabindex]');
    if (focusable) {
      ariaMisuseCount += 1;
    }
  });

  const preloadHints = $(
    'link[rel~="preload"], link[rel~="preconnect"], link[rel~="dns-prefetch"]',
  ).length;
  const hasSitemapReference = $('link[rel~="sitemap"][href]').length > 0;

  // --- visible text (must run last; mutates the parse tree) ---
  $('script, style, noscript, template, svg, title, head, meta, link').remove();
  const paragraphs: string[] = [];
  $('p').each((_, el) => {
    const text = normalizeText($(el).text());
    if (text !== '') {
      paragraphs.push(text);
    }
  });
  const body = $('body');
  const rawText = body.length > 0 ? body.text() : $.root().text();
  const text = normalizeText(rawText);
  const wordCount = text === '' ? 0 : text.split(/\s+/).length;

  return {
    url: fetched.url,
    finalUrl: fetched.finalUrl,
    statusCode: fetched.statusCode,
    headers: fetched.headers,
    contentType: fetched.contentType,
    contentLength: fetched.contentLength,
    responseDurationMs: fetched.responseDurationMs,
    redirectCount: fetched.redirectCount,
    fetchTimestamp: fetched.fetchTimestamp,
    htmlSize,
    bodySize,
    title,
    metaDescription,
    canonical,
    robotsMeta,
    viewport,
    charset,
    doctype,
    language,
    openGraph,
    headings,
    links,
    images,
    scripts,
    stylesheets,
    inlineStyleSize,
    inlineScriptSize,
    text,
    textLength: text.length,
    wordCount,
    paragraphs,
    paragraphCount: paragraphs.length,
    formControls,
    buttons,
    landmarks,
    duplicateIds,
    ariaMisuseCount,
    hasSitemapReference,
    preloadHints,
  };
}

function collectFormControls($: cheerio.CheerioAPI): NormalizedWebsiteDocument['formControls'] {
  const labelFor = new Set(
    $('label[for]')
      .map((_, el) => $(el).attr('for'))
      .get(),
  );

  const controls: NormalizedWebsiteDocument['formControls'] = [];
  $('input, select, textarea').each((_, el) => {
    const $el = $(el);
    const tag = el.tagName;
    const type = $el.attr('type');
    if (tag === 'input' && type !== undefined && ['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) {
      return;
    }
    const id = $el.attr('id');
    const labeled =
      !!$el.attr('aria-label') ||
      !!$el.attr('aria-labelledby') ||
      $el.closest('label').length > 0 ||
      (id !== undefined && labelFor.has(id));
    controls.push({ tag, type: type ?? null, labeled });
  });
  return controls;
}