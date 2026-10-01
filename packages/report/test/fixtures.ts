import { compareRuns, type ComparableRun } from '@analyzer/analysis';
import type { ReportSource } from '../src';

export const GENERATED_AT = '2026-09-11T09:30:00.000Z';

export function makeSource(overrides: Partial<ReportSource> = {}): ReportSource {
  return {
    analysisId: 'analysis-1',
    runId: 'run-1',
    runStatus: 'completed',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    runCreatedAt: '2026-09-06T08:00:00.000Z',
    runCompletedAt: '2026-09-06T08:00:05.000Z',
    website: {
      name: 'Example Website',
      host: 'example.com',
      url: 'https://example.com/',
    },
    scores: [
      { category: 'overall', score: 87, weight: null },
      { category: 'seo', score: 78, weight: 0.25 },
      { category: 'technical', score: 86, weight: 0.25 },
      { category: 'content', score: 84, weight: 0.2 },
      { category: 'accessibility', score: 96, weight: 0.15 },
      { category: 'performance', score: 96, weight: 0.15 },
    ],
    findings: [
      {
        ruleCode: 'SEO_META_DESCRIPTION_MISSING',
        category: 'seo',
        severity: 'high',
        title: 'Meta description is missing',
        description: 'Search engines cannot build a compelling snippet without a meta description.',
        scoreImpact: 10,
        evidence: [
          { type: 'html_missing', selector: 'meta[name="description"]', source: 'document' },
        ],
      },
      {
        ruleCode: 'TECH_SECURITY_HEADER_MISSING',
        category: 'technical',
        severity: 'high',
        title: 'Security headers are missing',
        description: 'Response is missing recommended security headers.',
        scoreImpact: 10,
        evidence: [{ type: 'header', name: 'content-security-policy', source: 'response' }],
      },
      {
        ruleCode: 'CONTENT_LOW_TEXT_LENGTH',
        category: 'content',
        severity: 'medium',
        title: 'Low content length',
        description: 'The page has little unique text.',
        scoreImpact: 8,
        evidence: [{ type: 'metric', metric: 'word_count', value: 120, unit: 'words' }],
      },
      {
        ruleCode: 'PERF_HTML_TOO_LARGE',
        category: 'performance',
        severity: 'low',
        title: 'HTML payload is large',
        description: 'The HTML document is larger than recommended.',
        scoreImpact: 4,
        evidence: [{ type: 'metric', metric: 'html_bytes', value: 420_000, unit: 'bytes' }],
      },
    ],
    ai: {
      status: 'completed',
      summary: {
        headline: 'Solid foundation with quick SEO wins',
        overview: 'The site is technically healthy but misses basic metadata.',
        strengths: ['Accessibility is excellent'],
        weaknesses: ['Missing meta description'],
      },
      recommendations: [
        {
          title: 'Add a meta description',
          description: 'Write a unique 150–160 character description for the homepage.',
          priority: 'high',
          impact: 'high',
          effort: 'low',
          category: 'seo',
          relatedFindingCodes: ['SEO_META_DESCRIPTION_MISSING'],
        },
      ],
    },
    ...overrides,
  };
}

function comparableRun(
  id: string,
  overall: number,
  findings: ComparableRun['findings'],
): ComparableRun {
  return {
    runId: `run-${id}`,
    analysisId: `analysis-${id}`,
    websiteId: 'website-1',
    status: 'completed',
    createdAt: `2026-09-0${id}T08:00:00.000Z`,
    scores: { overall, seo: overall - 9, technical: overall - 1, content: overall - 3, accessibility: 96, performance: 96 },
    findings,
  };
}

/** A real comparison produced by the deterministic engine. */
export function makeComparison() {
  return compareRuns(
    comparableRun('5', 72, [
      {
        ruleCode: 'SEO_META_DESCRIPTION_MISSING',
        category: 'seo',
        severity: 'high',
        title: 'Meta description is missing',
        scoreImpact: 10,
      },
      {
        ruleCode: 'PERF_HTML_TOO_LARGE',
        category: 'performance',
        severity: 'medium',
        title: 'HTML payload is large',
        scoreImpact: 4,
      },
      {
        ruleCode: 'CONTENT_LOW_TEXT_LENGTH',
        category: 'content',
        severity: 'low',
        title: 'Low content length',
        scoreImpact: 8,
      },
    ]),
    comparableRun('6', 87, [
      {
        ruleCode: 'PERF_HTML_TOO_LARGE',
        category: 'performance',
        severity: 'low',
        title: 'HTML payload is large',
        scoreImpact: 4,
      },
      {
        ruleCode: 'CONTENT_LOW_TEXT_LENGTH',
        category: 'content',
        severity: 'medium',
        title: 'Low content length',
        scoreImpact: 8,
      },
      {
        ruleCode: 'A11Y_IMAGE_ALT_MISSING',
        category: 'accessibility',
        severity: 'medium',
        title: 'Images are missing alt text',
        scoreImpact: 6,
      },
    ]),
  );
}
