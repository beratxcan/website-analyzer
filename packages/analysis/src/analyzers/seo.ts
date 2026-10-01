import { RuleCode } from '../rules/codes';
import { defineRule, type Rule } from '../rules/rule';
import { evidence, limitExamples } from '../evidence';
import { RuleBasedAnalyzer } from './analyzer';
import { findHeadingOrderViolations } from './heading-order';

const TITLE_MAX_LENGTH = 60;
const DESCRIPTION_MAX_LENGTH = 160;

function isCanonicalUsable(canonical: string): boolean {
  try {
    const parsed = new URL(canonical);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const seoRules: readonly Rule[] = [
  defineRule({
    code: RuleCode.SEO_TITLE_MISSING,
    category: 'seo',
    severity: 'high',
    title: 'Missing page title',
    description: 'The document has no <title> element.',
    points: 15,
    evaluate: (doc) => (doc.title === null ? { evidence: [evidence.missing('head > title')] } : null),
  }),
  defineRule({
    code: RuleCode.SEO_TITLE_EMPTY,
    category: 'seo',
    severity: 'high',
    title: 'Empty page title',
    description: 'The <title> element exists but contains no text.',
    points: 10,
    evaluate: (doc) =>
      doc.title === '' ? { evidence: [evidence.attribute('head > title', undefined, '')] } : null,
  }),
  defineRule({
    code: RuleCode.SEO_TITLE_TOO_LONG,
    category: 'seo',
    severity: 'low',
    title: 'Page title is excessively long',
    description: `The page title exceeds ${TITLE_MAX_LENGTH} characters and may be truncated in search results.`,
    points: 3,
    evaluate: (doc) => {
      if (doc.title === null || doc.title === '' || doc.title.length <= TITLE_MAX_LENGTH) return null;
      return {
        evidence: [
          evidence.metric('title_length', doc.title.length, 'chars'),
          evidence.attribute('head > title'),
        ],
      };
    },
  }),
  defineRule({
    code: RuleCode.SEO_META_DESCRIPTION_MISSING,
    category: 'seo',
    severity: 'medium',
    title: 'Missing meta description',
    description: 'No meta description is defined.',
    points: 8,
    evaluate: (doc) =>
      doc.metaDescription === null ? { evidence: [evidence.missing('meta[name="description"]')] } : null,
  }),
  defineRule({
    code: RuleCode.SEO_META_DESCRIPTION_EMPTY,
    category: 'seo',
    severity: 'medium',
    title: 'Empty meta description',
    description: 'The meta description is present but empty.',
    points: 5,
    evaluate: (doc) =>
      doc.metaDescription === ''
        ? { evidence: [evidence.attribute('meta[name="description"]', 'content', '')] }
        : null,
  }),
  defineRule({
    code: RuleCode.SEO_META_DESCRIPTION_TOO_LONG,
    category: 'seo',
    severity: 'low',
    title: 'Meta description is excessively long',
    description: `The meta description exceeds ${DESCRIPTION_MAX_LENGTH} characters and may be truncated in search results.`,
    points: 2,
    evaluate: (doc) => {
      if (doc.metaDescription === null || doc.metaDescription === '' || doc.metaDescription.length <= DESCRIPTION_MAX_LENGTH) {
        return null;
      }
      return {
        evidence: [
          evidence.metric('meta_description_length', doc.metaDescription.length, 'chars'),
          evidence.attribute('meta[name="description"]', 'content', doc.metaDescription),
        ],
      };
    },
  }),
  defineRule({
    code: RuleCode.SEO_H1_MISSING,
    category: 'seo',
    severity: 'high',
    title: 'Missing H1 heading',
    description: 'The document has no H1 heading.',
    points: 12,
    evaluate: (doc) => {
      const h1 = doc.headings.filter((h) => h.level === 1);
      return h1.length === 0 ? { evidence: [evidence.missing('h1')] } : null;
    },
  }),
  defineRule({
    code: RuleCode.SEO_MULTIPLE_H1,
    category: 'seo',
    severity: 'low',
    title: 'Multiple H1 headings',
    description: 'The document contains more than one H1 heading.',
    points: 3,
    evaluate: (doc) => {
      const h1 = doc.headings.filter((h) => h.level === 1);
      if (h1.length <= 1) return null;
      const first = h1[0];
      return {
        evidence: [
          evidence.metric('h1_count', h1.length),
          ...(first !== undefined ? [evidence.text(first.text)] : []),
        ],
      };
    },
  }),
  defineRule({
    code: RuleCode.SEO_HEADING_HIERARCHY,
    category: 'seo',
    severity: 'low',
    title: 'Heading hierarchy problems',
    description: 'Headings skip levels or do not start at H1.',
    points: 2,
    evaluate: (doc) => {
      const { violations, example } = findHeadingOrderViolations(doc.headings);
      if (violations === 0) return null;
      return {
        evidence: [
          evidence.metric('heading_hierarchy_violations', violations),
          ...(example !== undefined ? [evidence.text(example)] : []),
        ],
      };
    },
  }),
  defineRule({
    code: RuleCode.SEO_CANONICAL_MISSING,
    category: 'seo',
    severity: 'medium',
    title: 'Missing canonical URL',
    description: 'No rel="canonical" link is defined.',
    points: 6,
    evaluate: (doc) =>
      doc.canonical === null ? { evidence: [evidence.missing('link[rel="canonical"]')] } : null,
  }),
  defineRule({
    code: RuleCode.SEO_CANONICAL_INVALID,
    category: 'seo',
    severity: 'medium',
    title: 'Invalid canonical URL',
    description: 'The canonical URL is not a valid absolute HTTP(S) URL.',
    points: 6,
    evaluate: (doc) => {
      if (doc.canonical === null || isCanonicalUsable(doc.canonical)) return null;
      return {
        evidence: [evidence.attribute('link[rel="canonical"]', 'href', doc.canonical)],
      };
    },
  }),
  defineRule({
    code: RuleCode.SEO_ROBOTS_MISSING,
    category: 'seo',
    severity: 'info',
    title: 'Missing robots meta tag',
    description: 'No robots meta tag is defined; crawler behavior relies on defaults.',
    points: 0,
    evaluate: (doc) =>
      doc.robotsMeta === null ? { evidence: [evidence.missing('meta[name="robots"]')] } : null,
  }),
  defineRule({
    code: RuleCode.SEO_ROBOTS_NOINDEX,
    category: 'seo',
    severity: 'info',
    title: 'Page excluded from indexing',
    description: 'The robots meta tag contains noindex; the page will not appear in search results.',
    points: 0,
    evaluate: (doc) => {
      if (doc.robotsMeta === null || !doc.robotsMeta.toLowerCase().includes('noindex')) return null;
      return {
        evidence: [evidence.attribute('meta[name="robots"]', 'content', doc.robotsMeta)],
      };
    },
  }),
  defineRule({
    code: RuleCode.SEO_LANG_MISSING,
    category: 'seo',
    severity: 'medium',
    title: 'Missing language attribute',
    description: 'The <html> element has no lang attribute.',
    points: 4,
    evaluate: (doc) => (doc.language === null ? { evidence: [evidence.missing('html[lang]')] } : null),
  }),
  defineRule({
    code: RuleCode.SEO_OG_TITLE_MISSING,
    category: 'seo',
    severity: 'low',
    title: 'Missing Open Graph title',
    description: 'No og:title meta tag is defined.',
    points: 3,
    evaluate: (doc) =>
      doc.openGraph['og:title'] === undefined
        ? { evidence: [evidence.missing('meta[property="og:title"]')] }
        : null,
  }),
  defineRule({
    code: RuleCode.SEO_OG_DESCRIPTION_MISSING,
    category: 'seo',
    severity: 'low',
    title: 'Missing Open Graph description',
    description: 'No og:description meta tag is defined.',
    points: 2,
    evaluate: (doc) =>
      doc.openGraph['og:description'] === undefined
        ? { evidence: [evidence.missing('meta[property="og:description"]')] }
        : null,
  }),
  defineRule({
    code: RuleCode.SEO_OG_IMAGE_MISSING,
    category: 'seo',
    severity: 'low',
    title: 'Missing Open Graph image',
    description: 'No og:image meta tag is defined.',
    points: 3,
    evaluate: (doc) =>
      doc.openGraph['og:image'] === undefined && doc.openGraph['og:image:secure_url'] === undefined
        ? { evidence: [evidence.missing('meta[property="og:image"]')] }
        : null,
  }),
  defineRule({
    code: RuleCode.SEO_IMAGE_ALT_MISSING,
    category: 'seo',
    severity: 'medium',
    title: 'Images missing alt text',
    description: 'Some images have no alt attribute, hurting image SEO and accessibility.',
    points: 5,
    evaluate: (doc) => {
      const withoutAlt = doc.images.filter((img) => img.alt === null);
      if (withoutAlt.length === 0) return null;
      return {
        evidence: [
          evidence.metric('images_without_alt', withoutAlt.length),
          ...limitExamples(withoutAlt).map((img) => evidence.attribute('img', 'src', img.src ?? undefined)),
        ],
      };
    },
  }),
  defineRule({
    code: RuleCode.SEO_EMPTY_LINK,
    category: 'seo',
    severity: 'low',
    title: 'Empty links',
    description: 'Some anchors have no usable href (missing, empty or "#").',
    points: 2,
    evaluate: (doc) => {
      const empty = doc.links.filter((link) => link.href === null || link.href === '' || link.href === '#');
      if (empty.length === 0) return null;
      return {
        evidence: [
          evidence.metric('empty_links', empty.length),
          ...limitExamples(empty).map((link) => evidence.attribute('a', 'href', link.href ?? '')),
        ],
      };
    },
  }),
];

export class SeoAnalyzer extends RuleBasedAnalyzer {
  readonly id = 'seo';
  readonly category = 'seo' as const;
  readonly version = '1.0.0';
  protected readonly rules = seoRules;
}