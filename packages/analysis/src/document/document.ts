/**
 * Shapes flowing through the analysis pipeline.
 *
 * `FetchedWebsite` is the output of the secure fetcher (raw response),
 * `NormalizedWebsiteDocument` is the single parsed representation that all
 * analyzers consume — analyzers never re-parse HTML themselves.
 */

export interface FetchedWebsite {
  /** The URL as requested. */
  url: string;
  /** The final URL after following redirects. */
  finalUrl: string;
  statusCode: number;
  /** Lowercased response header names. */
  headers: Record<string, string>;
  /** Media type of the final response (e.g. `text/html`), if declared. */
  contentType: string | null;
  /** Measured decompressed body size in bytes. */
  contentLength: number;
  /** Total time spent fetching including redirects, in milliseconds. */
  responseDurationMs: number;
  /** Decompressed HTML body. */
  html: string;
  redirectCount: number;
  fetchTimestamp: string;
}

export interface HeadingInfo {
  level: number;
  text: string;
}

export interface LinkInfo {
  /** `null` when the anchor has no href attribute. */
  href: string | null;
  text: string;
  rel: string[];
  /** True when the link exposes an accessible name (text, aria-label, title or image alt). */
  hasAccessibleName: boolean;
}

export interface ImageInfo {
  src: string | null;
  /** `null` when the alt attribute is missing; `''` when present but empty. */
  alt: string | null;
  width: string | null;
  height: string | null;
}

export interface ScriptInfo {
  src: string | null;
  /** Byte size of the inline script body (0 for external scripts). */
  inlineSize: number;
}

export interface FormControlInfo {
  tag: string;
  type: string | null;
  /** True when associated with a label (label[for], wrapping label, aria-label, aria-labelledby). */
  labeled: boolean;
}

export interface ButtonInfo {
  type: string | null;
  hasAccessibleName: boolean;
}

export interface NormalizedWebsiteDocument {
  // --- response metadata ---
  url: string;
  finalUrl: string;
  statusCode: number;
  headers: Record<string, string>;
  contentType: string | null;
  contentLength: number;
  responseDurationMs: number;
  redirectCount: number;
  fetchTimestamp: string;
  /** Full HTML byte size. */
  htmlSize: number;
  /** Body element HTML byte size. */
  bodySize: number;
  // --- extracted head data ---
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  viewport: string | null;
  charset: string | null;
  /** `<!doctype ...>` first token, lowercased, or null. */
  doctype: string | null;
  language: string | null;
  openGraph: Record<string, string>;
  // --- extracted body data ---
  headings: HeadingInfo[];
  links: LinkInfo[];
  images: ImageInfo[];
  scripts: ScriptInfo[];
  stylesheets: { href: string }[];
  inlineStyleSize: number;
  inlineScriptSize: number;
  /** Normalized visible text (scripts, styles, head and templates removed). */
  text: string;
  textLength: number;
  wordCount: number;
  /** Non-empty `<p>` texts, normalized. */
  paragraphs: string[];
  paragraphCount: number;
  /** Structural accessibility signals. */
  formControls: FormControlInfo[];
  buttons: ButtonInfo[];
  /** Landmark elements/roles found (header, nav, main, footer, banner, ...). */
  landmarks: string[];
  /** id attribute values that occur more than once (in document order). */
  duplicateIds: string[];
  /** Number of focusable elements hidden via aria-hidden or role=presentation. */
  ariaMisuseCount: number;
  /** True when the document references a sitemap (`link[rel="sitemap"]`). */
  hasSitemapReference: boolean;
  preloadHints: number;
}