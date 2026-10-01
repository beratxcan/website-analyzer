import { describe, expect, it } from 'vitest';
import { AIContextBuilder, EvidenceSelector, compactEvidence } from '../src/context';
import type { AnalysisSnapshot } from '../src/domain';

function snapshot(findings: AnalysisSnapshot['findings']): AnalysisSnapshot {
  return {
    website: { host: 'example.com', url: 'https://example.com' },
    runStatus: 'completed',
    overallScore: 87,
    categoryScores: { seo: 78, technical: 86, content: 84, accessibility: 96, performance: 96 },
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    findings,
  };
}

function finding(overrides: Partial<AnalysisSnapshot['findings'][number]> = {}): AnalysisSnapshot['findings'][number] {
  return {
    ruleCode: 'SEO_TITLE_TOO_LONG',
    category: 'seo',
    severity: 'low',
    title: 'Title is too long',
    description: 'The page title exceeds the recommended length and may be truncated in results.',
    scoreImpact: 3,
    evidence: [{ type: 'metric', metric: 'title_length', value: 65, unit: 'chars' }],
    ...overrides,
  };
}

describe('EvidenceSelector', () => {
  it('orders deterministically by severity, then score impact, then rule code', () => {
    const selector = new EvidenceSelector();
    const findings = [
      finding({ ruleCode: 'Z_CODE', severity: 'low', scoreImpact: 5 }),
      finding({ ruleCode: 'A_CODE', severity: 'high', scoreImpact: 10 }),
      finding({ ruleCode: 'B_CODE', severity: 'high', scoreImpact: 10 }),
      finding({ ruleCode: 'C_CODE', severity: 'high', scoreImpact: 20 }),
      finding({ ruleCode: 'M_CODE', severity: 'info', scoreImpact: 1 }),
      finding({ ruleCode: 'K_CODE', severity: 'critical', scoreImpact: 2 }),
    ];

    const selected = selector.select(findings).map((item) => item.ruleCode);
    expect(selected).toEqual(['K_CODE', 'C_CODE', 'A_CODE', 'B_CODE', 'Z_CODE', 'M_CODE']);
  });

  it('respects the maxFindings hard limit', () => {
    const selector = new EvidenceSelector({ maxFindings: 3 });
    const findings = Array.from({ length: 10 }, (_, index) =>
      finding({ ruleCode: `CODE_${index}`, severity: 'low', scoreImpact: index }),
    );

    const selected = selector.select(findings);
    expect(selected).toHaveLength(3);
    // Highest scoreImpact first among equal severities.
    expect(selected.map((item) => item.ruleCode)).toEqual(['CODE_9', 'CODE_8', 'CODE_7']);
  });

  it('is deterministic: identical input yields identical output', () => {
    const selector = new EvidenceSelector();
    const findings = Array.from({ length: 40 }, (_, index) =>
      finding({ ruleCode: `CODE_${index}`, severity: index % 2 === 0 ? 'medium' : 'low', scoreImpact: index % 7 }),
    );
    expect(selector.select(findings)).toEqual(selector.select(findings));
  });

  it('compacts evidence to a bounded number of short strings', () => {
    const selector = new EvidenceSelector({ maxEvidencePerFinding: 1, maxEvidenceLength: 20 });
    const selected = selector.select([
      finding({
        evidence: [
          { type: 'metric', metric: 'html_size', value: 245_812, unit: 'bytes' },
          { type: 'header', name: 'x-frame-options', source: 'response' },
        ],
      }),
    ]);
    expect(selected[0]?.compactEvidence).toEqual(['html_size=245812 bytes'.slice(0, 19) + '…']);
    expect(selected[0]?.compactEvidence[0]).toContain('html_size');
  });

  it('truncates long descriptions', () => {
    const selector = new EvidenceSelector({ maxDescriptionLength: 20 });
    const selected = selector.select([finding({ description: 'x'.repeat(100) })]);
    expect(selected[0]?.shortDescription.length).toBeLessThanOrEqual(20);
  });
});

describe('compactEvidence', () => {
  it('flattens the evidence union into short strings', () => {
    expect(compactEvidence({ type: 'html_attribute', selector: 'head > title', attribute: 'lang', value: 'en', source: 'document' })).toEqual([
      'head > title [lang=en]',
    ]);
    expect(compactEvidence({ type: 'html_missing', selector: 'head > title', source: 'document' })).toEqual([
      'missing head > title',
    ]);
    expect(compactEvidence({ type: 'metric', metric: 'html_size', value: 245_812, unit: 'bytes' })).toEqual([
      'html_size=245812 bytes',
    ]);
    expect(compactEvidence({ type: 'header', name: 'strict-transport-security', source: 'response' })).toEqual([
      'strict-transport-security: (present)',
    ]);
    expect(compactEvidence([{ type: 'text', text: 'hello' }, { type: 'text', text: 'world' }])).toEqual([
      'hello',
      'world',
    ]);
  });

  it('degrades gracefully for unknown shapes and non-objects', () => {
    expect(compactEvidence(null)).toEqual([]);
    expect(compactEvidence(undefined)).toEqual([]);
    expect(compactEvidence(42)).toEqual([]);
    expect(compactEvidence('plain string')).toEqual(['plain string']);
    expect(compactEvidence({ weird: 'shape' })).toHaveLength(1);
  });
});

describe('AIContextBuilder', () => {
  it('includes only the minimal, secret-free fields', () => {
    const builder = new AIContextBuilder();
    const context = builder.build(
      snapshot([
        finding({ ruleCode: 'SEO_TITLE_TOO_LONG', category: 'seo', severity: 'low', scoreImpact: 3 }),
      ]),
    );

    expect(context.website).toEqual({ host: 'example.com', url: 'https://example.com' });
    expect(context.analysis.overallScore).toBe(87);
    expect(context.analysis.categoryScores.seo).toBe(78);
    expect(context.analysis.engineVersion).toBe('1.0.0');
    expect(context.findings[0]).toMatchObject({
      ruleCode: 'SEO_TITLE_TOO_LONG',
      category: 'seo',
      severity: 'low',
      scoreImpact: 3,
    });

    const serialized = JSON.stringify(context);
    // No internal identity, timing or session material ever reaches the model.
    for (const forbidden of ['userId', 'projectId', 'websiteId', 'token', 'password', 'cookie', 'createdAt']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('reports failed categories from the snapshot', () => {
    const builder = new AIContextBuilder();
    const context = builder.build({
      ...snapshot([finding()]),
      failedCategories: ['performance'],
    });
    expect(context.analysis.failedCategories).toEqual(['performance']);
  });
});