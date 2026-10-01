import { describe, expect, it } from 'vitest';
import { ReportBuilder } from '../src/builder';
import { GENERATED_AT, makeComparison, makeSource } from './fixtures';

describe('ReportBuilder', () => {
  const builder = new ReportBuilder();

  it('builds a document with metadata pinned to the run and generatedAt', () => {
    const document = builder.build(makeSource(), { generatedAt: GENERATED_AT });

    expect(document.metadata).toMatchObject({
      title: 'Website Analysis Report',
      websiteName: 'Example Website',
      websiteHost: 'example.com',
      websiteUrl: 'https://example.com/',
      analysisDate: '2026-09-06T08:00:05.000Z',
      generatedAt: GENERATED_AT,
      analysisId: 'analysis-1',
      runId: 'run-1',
      runStatus: 'completed',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      aiStatus: 'completed',
    });
  });

  it('uses the AI summary and recommendations when available', () => {
    const document = builder.build(makeSource(), { generatedAt: GENERATED_AT });

    expect(document.executiveSummary.source).toBe('ai');
    expect(document.executiveSummary.headline).toBe('Solid foundation with quick SEO wins');
    expect(document.recommendations).toHaveLength(1);
    expect(document.recommendations[0]).toMatchObject({
      title: 'Add a meta description',
      priority: 'high',
      effort: 'low',
      relatedFindingCodes: ['SEO_META_DESCRIPTION_MISSING'],
    });
  });

  it('falls back to a deterministic summary when no AI result exists', () => {
    const document = builder.build(makeSource({ ai: null }), { generatedAt: GENERATED_AT });

    expect(document.executiveSummary.source).toBe('deterministic');
    expect(document.executiveSummary.headline).toBe('example.com scored 87/100');
    expect(document.executiveSummary.overview).toContain('overall score of 87 out of 100');
    expect(document.executiveSummary.overview).toContain('4 findings detected');
    expect(document.executiveSummary.overview).toContain('2 critical/high');
    expect(document.executiveSummary.strengths).toContain('accessibility: 96/100');
    expect(document.executiveSummary.weaknesses).toContain('seo: 78/100');
    expect(document.recommendations).toEqual([]);
    expect(document.metadata.aiStatus).toBeNull();
  });

  it('falls back deterministically when AI failed or was skipped', () => {
    for (const status of ['failed', 'skipped', 'pending', 'running'] as const) {
      const document = builder.build(
        makeSource({
          ai: { status, summary: null, recommendations: null },
        }),
        { generatedAt: GENERATED_AT },
      );
      expect(document.executiveSummary.source).toBe('deterministic');
      expect(document.recommendations).toEqual([]);
      expect(document.metadata.aiStatus).toBe(status);
    }
  });

  it('includes a partially completed note when analyzers failed', () => {
    const document = builder.build(makeSource({ runStatus: 'partially_completed', ai: null }), {
      generatedAt: GENERATED_AT,
    });
    expect(document.metadata.runStatus).toBe('partially_completed');
    expect(document.executiveSummary.overview).toContain('partially completed');
  });

  it('prioritizes critical/high findings and keeps medium separate', () => {
    const document = builder.build(makeSource(), { generatedAt: GENERATED_AT });

    expect(document.criticalFindings.map((finding) => finding.ruleCode)).toEqual([
      'SEO_META_DESCRIPTION_MISSING',
      'TECH_SECURITY_HEADER_MISSING',
    ]);
    expect(document.additionalFindings.map((finding) => finding.ruleCode)).toEqual([
      'CONTENT_LOW_TEXT_LENGTH',
    ]);
    // Low severity findings are intentionally omitted from the report.
    expect(
      [...document.criticalFindings, ...document.additionalFindings].some(
        (finding) => finding.severity === 'low',
      ),
    ).toBe(false);
  });

  it('orders findings by severity then score impact then rule code', () => {
    const document = builder.build(
      makeSource({
        findings: [
          { ruleCode: 'Z_LOW', category: 'seo', severity: 'high', title: 'Z', description: '', scoreImpact: 1, evidence: [] },
          { ruleCode: 'A_HIGH', category: 'seo', severity: 'high', title: 'A', description: '', scoreImpact: 9, evidence: [] },
          { ruleCode: 'B_HIGH', category: 'seo', severity: 'high', title: 'B', description: '', scoreImpact: 9, evidence: [] },
          { ruleCode: 'C_CRITICAL', category: 'seo', severity: 'critical', title: 'C', description: '', scoreImpact: 2, evidence: [] },
        ],
      }),
      { generatedAt: GENERATED_AT },
    );

    expect(document.criticalFindings.map((finding) => finding.ruleCode)).toEqual([
      'C_CRITICAL',
      'A_HIGH',
      'B_HIGH',
      'Z_LOW',
    ]);
  });

  it('renders compact evidence and drops unknown shapes safely', () => {
    const document = builder.build(
      makeSource({
        findings: [
          {
            ruleCode: 'MIXED',
            category: 'technical',
            severity: 'high',
            title: 'Mixed evidence',
            description: 'd',
            scoreImpact: 5,
            evidence: [
              { type: 'html_attribute', selector: 'img', attribute: 'alt', value: '', source: 'document' },
              { type: 'header', name: 'x-frame-options', source: 'response' },
              { type: 'metric', metric: 'size', value: 12, unit: 'kb' },
              { type: 'text', text: 'short note' },
              { unexpected: true },
              null,
            ],
          },
        ],
      }),
      { generatedAt: GENERATED_AT },
    );

    expect(document.criticalFindings[0]?.evidence).toEqual([
      'img [alt]',
      'x-frame-options: (present)',
      'size = 12 kb',
    ]);
  });

  it('returns an overall score plus ordered category scores', () => {
    const document = builder.build(
      makeSource({ ai: null, scores: [
        { category: 'performance', score: 96, weight: 0.15 },
        { category: 'seo', score: 78, weight: 0.25 },
        { category: 'overall', score: 87, weight: null },
        { category: 'custom', score: 50, weight: null },
      ] }),
      { generatedAt: GENERATED_AT },
    );

    expect(document.scoreSummary.overall).toBe(87);
    // Canonical categories keep their order; unknown categories come last, sorted.
    expect(document.scoreSummary.categories.map((score) => score.category)).toEqual([
      'seo',
      'performance',
      'custom',
    ]);
  });

  it('handles a run with no findings and no scores', () => {
    const document = builder.build(
      makeSource({ findings: [], scores: [], ai: null }),
      { generatedAt: GENERATED_AT },
    );

    expect(document.criticalFindings).toEqual([]);
    expect(document.additionalFindings).toEqual([]);
    expect(document.recommendations).toEqual([]);
    expect(document.scoreSummary.overall).toBeNull();
    expect(document.executiveSummary.headline).toContain('without a complete score');
    expect(document.executiveSummary.overview).toContain('no category scores were persisted');
  });

  it('maps the deterministic comparison into the report model', () => {
    const document = builder.build(makeSource({ comparison: makeComparison() }), {
      generatedAt: GENERATED_AT,
    });

    const comparison = document.comparison;
    expect(comparison).not.toBeNull();
    expect(comparison?.leftScore).toBe(72);
    expect(comparison?.rightScore).toBe(87);
    expect(comparison?.overallDelta).toBe(15);
    expect(comparison?.resolved.map((finding) => finding.ruleCode)).toEqual([
      'SEO_META_DESCRIPTION_MISSING',
    ]);
    expect(comparison?.new.map((finding) => finding.ruleCode)).toEqual(['A11Y_IMAGE_ALT_MISSING']);
    expect(comparison?.improved.map((finding) => finding.ruleCode)).toEqual(['PERF_HTML_TOO_LARGE']);
    expect(comparison?.regressed.map((finding) => finding.ruleCode)).toEqual([
      'CONTENT_LOW_TEXT_LENGTH',
    ]);
    expect(comparison?.summary.unchangedCount).toBe(2);
  });

  it('produces no comparison section for a plain analysis report', () => {
    const document = builder.build(makeSource(), { generatedAt: GENERATED_AT });
    expect(document.comparison).toBeNull();
  });

  it('sanitizes untrusted text and never interprets markup', () => {
    const document = builder.build(
      makeSource({
        website: { name: 'İçerik <script>alert(1)</script>', host: 'exämple.com', url: 'https://exämple.com/' },
        ai: null,
      }),
      { generatedAt: GENERATED_AT },
    );

    // Non-WinAnsi letters are transliterated, encodable ones are kept, and
    // markup stays literal text (it is never interpreted).
    expect(document.metadata.websiteName).toBe('Içerik <script>alert(1)</script>');
    expect(document.metadata.websiteHost).toBe('exämple.com');
  });

  it('collapses whitespace and strips control characters from text', () => {
    const document = builder.build(
      makeSource({
        ai: {
          status: 'completed',
          summary: {
            headline: 'Line one\u0000\n\n  Line two\t\tLine three',
            overview: 'ok',
            strengths: [],
            weaknesses: [],
          },
          recommendations: null,
        },
      }),
      { generatedAt: GENERATED_AT },
    );

    expect(document.executiveSummary.headline).toBe('Line one Line two Line three');
  });
});
