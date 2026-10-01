import { RuleCode } from '../rules/codes';
import { defineRule, type Rule } from '../rules/rule';
import { evidence, limitExamples } from '../evidence';
import { RuleBasedAnalyzer } from './analyzer';

const REQUIRED_SECURITY_HEADERS = [
  'strict-transport-security',
  'content-security-policy',
  'x-content-type-options',
  'x-frame-options',
] as const;

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function originAndPath(urlValue: string): string | null {
  try {
    const parsed = new URL(urlValue);
    return stripTrailingSlash(`${parsed.hostname}:${parsed.port || (parsed.protocol === 'https:' ? '443' : '80')}${parsed.pathname}`);
  } catch {
    return null;
  }
}

const technicalRules: readonly Rule[] = [
  defineRule({
    code: RuleCode.TECH_HTTPS,
    category: 'technical',
    severity: 'high',
    title: 'Site is not served over HTTPS',
    description: 'The final URL uses plain HTTP; all traffic is unencrypted.',
    points: 15,
    evaluate: (doc) =>
      doc.finalUrl.startsWith('https:') ? null : { evidence: [evidence.text(doc.finalUrl)] },
  }),
  defineRule({
    code: RuleCode.TECH_HTTP_STATUS,
    category: 'technical',
    severity: 'high',
    title: 'Unexpected HTTP status code',
    description: 'The server responded with a status outside the 2xx range.',
    points: 12,
    evaluate: (doc) =>
      doc.statusCode >= 200 && doc.statusCode < 400
        ? null
        : { evidence: [evidence.metric('status_code', doc.statusCode)] },
  }),
  defineRule({
    code: RuleCode.TECH_CANONICAL,
    category: 'technical',
    severity: 'medium',
    title: 'Canonical URL does not match the final URL',
    description: 'The canonical link points to a different origin or path than the fetched page.',
    points: 5,
    evaluate: (doc) => {
      if (doc.canonical === null) return null;
      const canonicalTarget = originAndPath(doc.canonical);
      const actualTarget = originAndPath(doc.finalUrl);
      if (canonicalTarget === null || actualTarget === null || canonicalTarget === actualTarget) {
        return null;
      }
      return {
        evidence: [
          evidence.attribute('link[rel="canonical"]', 'href', doc.canonical),
          evidence.text(doc.finalUrl),
        ],
      };
    },
  }),
  defineRule({
    code: RuleCode.TECH_VIEWPORT_MISSING,
    category: 'technical',
    severity: 'medium',
    title: 'Missing viewport meta tag',
    description: 'No viewport meta tag is defined; the page is not optimized for mobile.',
    points: 5,
    evaluate: (doc) =>
      doc.viewport === null ? { evidence: [evidence.missing('meta[name="viewport"]')] } : null,
  }),
  defineRule({
    code: RuleCode.TECH_CHARSET_MISSING,
    category: 'technical',
    severity: 'medium',
    title: 'Missing character set declaration',
    description: 'No charset is declared via meta tag.',
    points: 4,
    evaluate: (doc) => (doc.charset === null ? { evidence: [evidence.missing('meta[charset]')] } : null),
  }),
  defineRule({
    code: RuleCode.TECH_DOCTYPE_MISSING,
    category: 'technical',
    severity: 'low',
    title: 'Missing doctype declaration',
    description: 'The document has no <!doctype html> declaration.',
    points: 3,
    evaluate: (doc) => (doc.doctype === null ? { evidence: [evidence.missing('<!doctype html>')] } : null),
  }),
  defineRule({
    code: RuleCode.TECH_SECURITY_HEADER_MISSING,
    category: 'technical',
    severity: 'high',
    title: 'Security response headers missing',
    description: 'One or more recommended security headers are absent from the response.',
    points: 10,
    evaluate: (doc) => {
      const missing = REQUIRED_SECURITY_HEADERS.filter((name) => doc.headers[name] === undefined);
      if (missing.length === 0) return null;
      return {
        description: `Missing security headers: ${missing.join(', ')}.`,
        evidence: [
          evidence.metric('missing_security_headers', missing.length),
          ...missing.map((name) => evidence.header(name)),
        ],
      };
    },
  }),
  defineRule({
    code: RuleCode.TECH_SITEMAP_REFERENCE_MISSING,
    category: 'technical',
    severity: 'info',
    title: 'No sitemap reference in HTML',
    description: 'The document does not reference a sitemap via link rel="sitemap".',
    points: 0,
    evaluate: (doc) =>
      doc.hasSitemapReference ? null : { evidence: [evidence.missing('link[rel="sitemap"]')] },
  }),
  defineRule({
    code: RuleCode.TECH_MIXED_CONTENT,
    category: 'technical',
    severity: 'medium',
    title: 'Mixed content detected',
    description: 'An HTTPS page loads resources over insecure HTTP.',
    points: 6,
    evaluate: (doc) => {
      if (!doc.finalUrl.startsWith('https:')) return null;
      const insecure = [
        ...doc.scripts.filter((s) => s.src !== null && s.src.startsWith('http://')).map((s) => s.src as string),
        ...doc.stylesheets.filter((s) => s.href.startsWith('http://')).map((s) => s.href),
        ...doc.images.filter((i) => i.src !== null && i.src.startsWith('http://')).map((i) => i.src as string),
      ];
      if (insecure.length === 0) return null;
      return {
        evidence: [
          evidence.metric('insecure_resources', insecure.length),
          ...limitExamples(insecure).map((url) => evidence.text(url)),
        ],
      };
    },
  }),
  defineRule({
    code: RuleCode.TECH_JAVASCRIPT_LINK,
    category: 'technical',
    severity: 'low',
    title: 'javascript: links detected',
    description: 'Some anchors use javascript: URLs, which break link semantics and are unsafe.',
    points: 2,
    evaluate: (doc) => {
      const jsLinks = doc.links.filter((link) => link.href?.toLowerCase().startsWith('javascript:'));
      if (jsLinks.length === 0) return null;
      return {
        evidence: [
          evidence.metric('javascript_links', jsLinks.length),
          ...limitExamples(jsLinks).map((link) => evidence.attribute('a', 'href', link.href ?? '')),
        ],
      };
    },
  }),
];

export class TechnicalAnalyzer extends RuleBasedAnalyzer {
  readonly id = 'technical';
  readonly category = 'technical' as const;
  readonly version = '1.0.0';
  protected readonly rules = technicalRules;
}