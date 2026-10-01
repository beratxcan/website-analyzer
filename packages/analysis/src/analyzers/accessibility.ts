import { RuleCode } from '../rules/codes';
import { defineRule, type Rule } from '../rules/rule';
import { evidence, limitExamples } from '../evidence';
import { RuleBasedAnalyzer } from './analyzer';
import { findHeadingOrderViolations } from './heading-order';

function isUsableHref(href: string | null): href is string {
  return href !== null && href !== '' && href !== '#' && !href.toLowerCase().startsWith('javascript:');
}

const accessibilityRules: readonly Rule[] = [
  defineRule({
    code: RuleCode.A11Y_IMAGE_ALT_MISSING,
    category: 'accessibility',
    severity: 'high',
    title: 'Images missing alt text',
    description: 'Some images have no alt attribute; screen readers cannot describe them.',
    points: 10,
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
    code: RuleCode.A11Y_FORM_LABEL_MISSING,
    category: 'accessibility',
    severity: 'high',
    title: 'Form controls without labels',
    description: 'Some form controls have no associated label or accessible name.',
    points: 10,
    evaluate: (doc) => {
      const unlabeled = doc.formControls.filter((control) => !control.labeled);
      if (unlabeled.length === 0) return null;
      return {
        evidence: [
          evidence.metric('unlabeled_form_controls', unlabeled.length),
          ...limitExamples(unlabeled).map((control) =>
            evidence.attribute(control.tag, 'type', control.type ?? undefined),
          ),
        ],
      };
    },
  }),
  defineRule({
    code: RuleCode.A11Y_HTML_LANG_MISSING,
    category: 'accessibility',
    severity: 'high',
    title: 'Missing language attribute',
    description: 'The <html> element has no lang attribute; screen readers cannot select a pronunciation.',
    points: 8,
    evaluate: (doc) => (doc.language === null ? { evidence: [evidence.missing('html[lang]')] } : null),
  }),
  defineRule({
    code: RuleCode.A11Y_HEADING_ORDER,
    category: 'accessibility',
    severity: 'low',
    title: 'Heading order problems',
    description: 'Headings skip levels, confusing screen reader navigation.',
    points: 3,
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
    code: RuleCode.A11Y_BUTTON_NO_TEXT,
    category: 'accessibility',
    severity: 'medium',
    title: 'Buttons without accessible names',
    description: 'Some buttons expose no text, aria-label or title.',
    points: 6,
    evaluate: (doc) => {
      const unnamed = doc.buttons.filter((button) => !button.hasAccessibleName);
      if (unnamed.length === 0) return null;
      return {
        evidence: [
          evidence.metric('unnamed_buttons', unnamed.length),
          ...limitExamples(unnamed).map((button) =>
            evidence.attribute('button', 'type', button.type ?? undefined),
          ),
        ],
      };
    },
  }),
  defineRule({
    code: RuleCode.A11Y_LINK_NO_TEXT,
    category: 'accessibility',
    severity: 'medium',
    title: 'Links without accessible names',
    description: 'Some links expose no text, aria-label or title.',
    points: 6,
    evaluate: (doc) => {
      const unnamed = doc.links.filter((link) => isUsableHref(link.href) && !link.hasAccessibleName);
      if (unnamed.length === 0) return null;
      return {
        evidence: [
          evidence.metric('unnamed_links', unnamed.length),
          ...limitExamples(unnamed).map((link) => evidence.attribute('a', 'href', link.href ?? undefined)),
        ],
      };
    },
  }),
  defineRule({
    code: RuleCode.A11Y_VIEWPORT_MISSING,
    category: 'accessibility',
    severity: 'medium',
    title: 'Missing viewport meta tag',
    description: 'No viewport meta tag is defined; text may not scale on mobile.',
    points: 5,
    evaluate: (doc) =>
      doc.viewport === null ? { evidence: [evidence.missing('meta[name="viewport"]')] } : null,
  }),
  defineRule({
    code: RuleCode.A11Y_LANDMARK_MISSING,
    category: 'accessibility',
    severity: 'low',
    title: 'No page landmarks',
    description: 'The page defines no landmarks (header, nav, main, footer or roles).',
    points: 4,
    evaluate: (doc) =>
      doc.landmarks.length > 0
        ? null
        : { evidence: [evidence.missing('header, nav, main, footer, [role="banner|navigation|main|contentinfo"]')] },
  }),
  defineRule({
    code: RuleCode.A11Y_DUPLICATE_ID,
    category: 'accessibility',
    severity: 'medium',
    title: 'Duplicate element IDs',
    description: 'Duplicate id attributes break label and anchor associations.',
    points: 6,
    evaluate: (doc) => {
      if (doc.duplicateIds.length === 0) return null;
      return {
        evidence: [
          evidence.metric('duplicate_ids', doc.duplicateIds.length),
          ...limitExamples(doc.duplicateIds).map((id) => evidence.attribute('[id]', 'id', id)),
        ],
      };
    },
  }),
  defineRule({
    code: RuleCode.A11Y_ARIA_MISUSE,
    category: 'accessibility',
    severity: 'low',
    title: 'ARIA misuse on focusable elements',
    description: 'Focusable elements are hidden with aria-hidden or role="presentation".',
    points: 3,
    evaluate: (doc) =>
      doc.ariaMisuseCount > 0
        ? { evidence: [evidence.metric('aria_misuse_count', doc.ariaMisuseCount)] }
        : null,
  }),
];

export class AccessibilityAnalyzer extends RuleBasedAnalyzer {
  readonly id = 'accessibility';
  readonly category = 'accessibility' as const;
  readonly version = '1.0.0';
  protected readonly rules = accessibilityRules;
}