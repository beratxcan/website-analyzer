import { RuleCode } from '../rules/codes';
import { defineRule, type Rule } from '../rules/rule';
import { evidence, limitExamples } from '../evidence';
import { RuleBasedAnalyzer } from './analyzer';

const MAX_HTML_SIZE = 512 * 1024;
const MAX_SCRIPTS = 15;
const MAX_STYLESHEETS = 5;
const MAX_IMAGES = 30;
const MAX_EXTERNAL_RESOURCES = 20;
const MAX_INLINE_SCRIPT_SIZE = 50 * 1024;
const MAX_INLINE_STYLE_SIZE = 30 * 1024;
const MIN_DIMENSIONED_IMAGES = 5;

/**
 * Static, browser-free document metrics. Real rendering metrics (LCP, CLS,
 * INP, FCP) are a browser-based Phase V2 feature and are intentionally absent.
 */
const performanceRules: readonly Rule[] = [
  defineRule({
    code: RuleCode.PERF_HTML_TOO_LARGE,
    category: 'performance',
    severity: 'medium',
    title: 'HTML document is excessively large',
    description: `The HTML document exceeds ${Math.round(MAX_HTML_SIZE / 1024)} KB.`,
    points: 6,
    evaluate: (doc) =>
      doc.htmlSize <= MAX_HTML_SIZE
        ? null
        : { evidence: [evidence.metric('html_size', doc.htmlSize, 'bytes')] },
  }),
  defineRule({
    code: RuleCode.PERF_SCRIPT_COUNT,
    category: 'performance',
    severity: 'low',
    title: 'High script count',
    description: `The page loads more than ${MAX_SCRIPTS} external scripts.`,
    points: 3,
    evaluate: (doc) => {
      const count = doc.scripts.filter((script) => script.src !== null).length;
      return count > MAX_SCRIPTS
        ? { evidence: [evidence.metric('script_count', count)] }
        : null;
    },
  }),
  defineRule({
    code: RuleCode.PERF_STYLESHEET_COUNT,
    category: 'performance',
    severity: 'low',
    title: 'High stylesheet count',
    description: `The page loads more than ${MAX_STYLESHEETS} stylesheets.`,
    points: 3,
    evaluate: (doc) =>
      doc.stylesheets.length > MAX_STYLESHEETS
        ? { evidence: [evidence.metric('stylesheet_count', doc.stylesheets.length)] }
        : null,
  }),
  defineRule({
    code: RuleCode.PERF_IMAGE_COUNT,
    category: 'performance',
    severity: 'low',
    title: 'High image count',
    description: `The page contains more than ${MAX_IMAGES} images.`,
    points: 2,
    evaluate: (doc) => {
      const count = doc.images.filter((image) => image.src !== null).length;
      return count > MAX_IMAGES ? { evidence: [evidence.metric('image_count', count)] } : null;
    },
  }),
  defineRule({
    code: RuleCode.PERF_EXTERNAL_RESOURCES,
    category: 'performance',
    severity: 'low',
    title: 'Many external resources',
    description: `The page loads more than ${MAX_EXTERNAL_RESOURCES} resources from third-party origins.`,
    points: 3,
    evaluate: (doc) => {
      const baseOrigin = safeOrigin(doc.finalUrl);
      const resources = [
        ...doc.scripts.map((s) => s.src),
        ...doc.stylesheets.map((s) => s.href),
        ...doc.images.map((i) => i.src),
      ];
      const external = resources.filter((resource): resource is string => {
        if (resource === null) return false;
        const origin = safeOrigin(resource);
        return origin !== null && origin !== baseOrigin;
      });
      return external.length > MAX_EXTERNAL_RESOURCES
        ? {
            evidence: [
              evidence.metric('external_resource_count', external.length),
              ...limitExamples(external).map((url) => evidence.text(url)),
            ],
          }
        : null;
    },
  }),
  defineRule({
    code: RuleCode.PERF_INLINE_SCRIPT_LARGE,
    category: 'performance',
    severity: 'low',
    title: 'Large inline scripts',
    description: `Inline scripts total more than ${Math.round(MAX_INLINE_SCRIPT_SIZE / 1024)} KB.`,
    points: 3,
    evaluate: (doc) =>
      doc.inlineScriptSize > MAX_INLINE_SCRIPT_SIZE
        ? { evidence: [evidence.metric('inline_script_size', doc.inlineScriptSize, 'bytes')] }
        : null,
  }),
  defineRule({
    code: RuleCode.PERF_INLINE_STYLE_LARGE,
    category: 'performance',
    severity: 'low',
    title: 'Large inline styles',
    description: `Inline styles total more than ${Math.round(MAX_INLINE_STYLE_SIZE / 1024)} KB.`,
    points: 2,
    evaluate: (doc) =>
      doc.inlineStyleSize > MAX_INLINE_STYLE_SIZE
        ? { evidence: [evidence.metric('inline_style_size', doc.inlineStyleSize, 'bytes')] }
        : null,
  }),
  defineRule({
    code: RuleCode.PERF_IMAGE_MISSING_DIMENSIONS,
    category: 'performance',
    severity: 'medium',
    title: 'Images missing dimensions',
    description: `At least ${MIN_DIMENSIONED_IMAGES} images lack width/height attributes, causing layout shift.`,
    points: 5,
    evaluate: (doc) => {
      const missing = doc.images.filter((image) => image.src !== null && (image.width === null || image.height === null));
      if (missing.length < MIN_DIMENSIONED_IMAGES) return null;
      return {
        evidence: [
          evidence.metric('images_missing_dimensions', missing.length),
          ...limitExamples(missing).map((image) => evidence.attribute('img', 'src', image.src ?? undefined)),
        ],
      };
    },
  }),
  defineRule({
    code: RuleCode.PERF_NO_PRELOAD_HINTS,
    category: 'performance',
    severity: 'info',
    title: 'No preload hints',
    description: 'The page defines no preload, preconnect or dns-prefetch hints.',
    points: 0,
    evaluate: (doc) =>
      doc.preloadHints > 0
        ? null
        : { evidence: [evidence.missing('link[rel~="preload|preconnect|dns-prefetch"]')] },
  }),
  defineRule({
    code: RuleCode.PERF_NO_COMPRESSION,
    category: 'performance',
    severity: 'medium',
    title: 'Response not compressed',
    description: 'The response has no content-encoding, so HTML is transferred uncompressed.',
    points: 5,
    evaluate: (doc) => {
      const encoding = doc.headers['content-encoding'];
      if (encoding !== undefined && encoding.toLowerCase() !== 'identity') return null;
      return { evidence: [evidence.header('content-encoding', encoding)] };
    },
  }),
  defineRule({
    code: RuleCode.PERF_NO_CACHE_HEADERS,
    category: 'performance',
    severity: 'low',
    title: 'No cache headers',
    description: 'The response declares no cache-control or expires header.',
    points: 4,
    evaluate: (doc) => {
      if (doc.headers['cache-control'] !== undefined || doc.headers['expires'] !== undefined) {
        return null;
      }
      return {
        evidence: [
          evidence.header('cache-control'),
          evidence.header('expires'),
        ],
      };
    },
  }),
];

function safeOrigin(urlValue: string): string | null {
  try {
    return new URL(urlValue).origin;
  } catch {
    return null;
  }
}

export class PerformanceAnalyzer extends RuleBasedAnalyzer {
  readonly id = 'performance';
  readonly category = 'performance' as const;
  readonly version = '1.0.0';
  protected readonly rules = performanceRules;
}