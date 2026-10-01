import { RuleCode } from '../rules/codes';
import { defineRule, type Rule } from '../rules/rule';
import { evidence } from '../evidence';
import { RuleBasedAnalyzer } from './analyzer';

const MIN_TEXT_LENGTH = 400;
const MIN_WORD_COUNT = 150;
const MIN_PARAGRAPH_COUNT = 2;
const MIN_TEXT_TO_MARKUP_RATIO = 0.05;
const DUPLICATE_THRESHOLD = 3;
const MIN_PARAGRAPH_LENGTH_FOR_DUPLICATE = 20;

/**
 * Deterministic, measurable content observations. The analyzer deliberately
 * does not answer "is this content good?" — it only reports measurable facts
 * that a later AI layer may interpret.
 */
const contentRules: readonly Rule[] = [
  defineRule({
    code: RuleCode.CONTENT_LOW_TEXT_LENGTH,
    category: 'content',
    severity: 'medium',
    title: 'Low visible text length',
    description: `The visible text is shorter than ${MIN_TEXT_LENGTH} characters.`,
    points: 8,
    evaluate: (doc) =>
      doc.textLength >= MIN_TEXT_LENGTH
        ? null
        : { evidence: [evidence.metric('text_length', doc.textLength, 'chars')] },
  }),
  defineRule({
    code: RuleCode.CONTENT_LOW_WORD_COUNT,
    category: 'content',
    severity: 'medium',
    title: 'Low word count',
    description: `The visible text contains fewer than ${MIN_WORD_COUNT} words.`,
    points: 8,
    evaluate: (doc) =>
      doc.wordCount >= MIN_WORD_COUNT
        ? null
        : { evidence: [evidence.metric('word_count', doc.wordCount, 'words')] },
  }),
  defineRule({
    code: RuleCode.CONTENT_LOW_PARAGRAPH_COUNT,
    category: 'content',
    severity: 'low',
    title: 'Low paragraph count',
    description: `The document has fewer than ${MIN_PARAGRAPH_COUNT} non-empty paragraphs.`,
    points: 3,
    evaluate: (doc) =>
      doc.paragraphCount >= MIN_PARAGRAPH_COUNT
        ? null
        : { evidence: [evidence.metric('paragraph_count', doc.paragraphCount)] },
  }),
  defineRule({
    code: RuleCode.CONTENT_NO_HEADINGS,
    category: 'content',
    severity: 'medium',
    title: 'No headings',
    description: 'The document has no headings at all.',
    points: 6,
    evaluate: (doc) =>
      doc.headings.length > 0 ? null : { evidence: [evidence.missing('h1, h2, h3, h4, h5, h6')] },
  }),
  defineRule({
    code: RuleCode.CONTENT_LOW_TEXT_TO_MARKUP_RATIO,
    category: 'content',
    severity: 'low',
    title: 'Low text-to-markup ratio',
    description: 'The page carries a large amount of markup relative to its visible text.',
    points: 4,
    evaluate: (doc) => {
      if (doc.htmlSize === 0) return null;
      const ratio = Buffer.byteLength(doc.text, 'utf8') / doc.htmlSize;
      if (ratio >= MIN_TEXT_TO_MARKUP_RATIO) return null;
      return {
        evidence: [
          evidence.metric('text_to_markup_ratio', Math.round(ratio * 1000) / 1000, 'ratio'),
          evidence.metric('html_size', doc.htmlSize, 'bytes'),
        ],
      };
    },
  }),
  defineRule({
    code: RuleCode.CONTENT_DUPLICATE_TEXT,
    category: 'content',
    severity: 'low',
    title: 'Repeated paragraph text',
    description: `Identical paragraph text appears ${DUPLICATE_THRESHOLD} or more times, a possible duplicate-content or boilerplate signal.`,
    points: 4,
    evaluate: (doc) => {
      const counts = new Map<string, number>();
      for (const paragraph of doc.paragraphs) {
        if (paragraph.length >= MIN_PARAGRAPH_LENGTH_FOR_DUPLICATE) {
          counts.set(paragraph, (counts.get(paragraph) ?? 0) + 1);
        }
      }
      const duplicated = [...counts.entries()].filter(([, count]) => count >= DUPLICATE_THRESHOLD);
      if (duplicated.length === 0) return null;
      const duplicatedTotal = duplicated.reduce((sum, [, count]) => sum + count, 0);
      const first = duplicated[0];
      return {
        evidence: [
          evidence.metric('duplicated_paragraphs', duplicatedTotal),
          ...(first !== undefined ? [evidence.text(first[0])] : []),
        ],
      };
    },
  }),
];

export class ContentAnalyzer extends RuleBasedAnalyzer {
  readonly id = 'content';
  readonly category = 'content' as const;
  readonly version = '1.0.0';
  protected readonly rules = contentRules;
}