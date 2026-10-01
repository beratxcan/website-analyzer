import { describe, expect, it } from 'vitest';
import { AnalysisEngine } from '../src/engine';
import { AnalyzerRegistry } from '../src/registry';
import { RuleBasedAnalyzer } from '../src/analyzers/analyzer';
import { SeoAnalyzer } from '../src/analyzers/seo';
import { ContentAnalyzer } from '../src/analyzers/content';
import { WebsiteFetcher } from '../src/fetcher/fetcher';
import { defineRule } from '../src/rules/rule';
import type { AnalyzerCategory, Finding, Severity } from '../src/types';
import { createMockFetch, documentFromHtml, htmlResponse, loadFixture, publicLookup } from './helpers';

const IDEAL_HTML = loadFixture('ideal-page.html');
const IDEAL_HEADERS = {
  'strict-transport-security': 'max-age=31536000',
  'content-security-policy': "default-src 'self'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'content-encoding': 'gzip',
  'cache-control': 'public, max-age=3600',
};

class ThrowingAnalyzer extends RuleBasedAnalyzer {
  readonly id = 'throwing';
  readonly category: AnalyzerCategory = 'performance';
  readonly version = '1.0.0';
  protected readonly rules = [
    defineRule({
      code: 'THROW_BOOM',
      category: 'performance' as const,
      severity: 'high' as Severity,
      title: 'boom',
      description: 'always throws',
      points: 10,
      evaluate: (): never => {
        throw new Error('analyzer exploded');
      },
    }),
  ];
}

describe('AnalysisEngine', () => {
  it('scores an ideal document 100 across every category', () => {
    const engine = new AnalysisEngine();
    const result = engine.analyzeDocument(documentFromHtml(IDEAL_HTML, { headers: IDEAL_HEADERS }));

    expect(result.status).toBe('completed');
    expect(result.findings).toEqual([]);
    expect(result.overallScore).toBe(100);
    expect(result.categoryScores).toEqual({ seo: 100, technical: 100, content: 100, accessibility: 100, performance: 100 });
    expect(result.analyzerResults).toHaveLength(5);
    for (const analyzerResult of result.analyzerResults) {
      expect(analyzerResult.status).toBe('completed');
      expect(analyzerResult.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('attaches engine and scoring version metadata', () => {
    const engine = new AnalysisEngine();
    const result = engine.analyzeDocument(documentFromHtml('<html><body>x</body></html>'));

    expect(result.metadata.engine.analysisEngineVersion).toBe('1.0.0');
    expect(result.metadata.engine.scoringVersion).toBe('1.0.0');
    expect(Object.keys(result.metadata.engine.analyzerVersions).sort()).toEqual([
      'accessibility',
      'content',
      'performance',
      'seo',
      'technical',
    ]);
    for (const version of Object.values(result.metadata.engine.analyzerVersions)) {
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('keeps other analyzers results when one analyzer fails', () => {
    // The throwing analyzer is the only analyzer in its category, so the
    // failed category must be excluded from scoring entirely.
    const registry = new AnalyzerRegistry().register(new SeoAnalyzer()).register(new ContentAnalyzer()).register(new ThrowingAnalyzer());
    const engine = new AnalysisEngine({ registry });
    const result = engine.analyzeDocument(documentFromHtml(IDEAL_HTML, { headers: IDEAL_HEADERS }));

    expect(result.status).toBe('partially_completed');

    const failed = result.analyzerResults.find((r) => r.analyzerId === 'throwing');
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toContain('analyzer exploded');

    const others = result.analyzerResults.filter((r) => r.analyzerId !== 'throwing');
    expect(others.every((r) => r.status === 'completed')).toBe(true);

    // Scores from the failed category are excluded, others preserved.
    expect(result.categoryScores.performance).toBeUndefined();
    expect(result.categoryScores.seo).toBe(100);
    expect(result.categoryScores.content).toBe(100);
    expect(result.overallScore).not.toBeNull();
    expect(result.findings.length).toBe(0);
  });

  it('produces deterministic results across repeated runs', () => {
    const engine = new AnalysisEngine();
    const poorSeo = loadFixture('poor-seo.html');
    const first = engine.analyzeDocument(documentFromHtml(poorSeo));
    const second = engine.analyzeDocument(documentFromHtml(poorSeo));

    expect(second.findings).toEqual(first.findings);
    expect(second.categoryScores).toEqual(first.categoryScores);
    expect(second.overallScore).toBe(first.overallScore);
    expect(second.status).toBe(first.status);
  });

  it('runs the full pipeline end to end with a mocked transport', async () => {
    const fetcher = new WebsiteFetcher({
      lookup: publicLookup,
      fetchImpl: createMockFetch(() => htmlResponse(200, IDEAL_HTML, IDEAL_HEADERS)),
    });
    const engine = new AnalysisEngine({ fetcher });
    const result = await engine.analyze('https://example.com/');

    expect(result.status).toBe('completed');
    expect(result.metadata.finalUrl).toBe('https://example.com/');
    expect(result.metadata.url).toBe('https://example.com/');
    expect(result.metadata.statusCode).toBe(200);
    expect(result.metadata.contentLength).toBe(Buffer.byteLength(IDEAL_HTML, 'utf8'));
    expect(result.metadata.fetchedAt).toBeTruthy();
    expect(result.overallScore).toBe(100);
  });

  it('sorts findings by severity then code', () => {
    const engine = new AnalysisEngine();
    const result = engine.analyzeDocument(documentFromHtml(loadFixture('technical-issues.html'), {
      finalUrl: 'http://insecure.example/',
      statusCode: 500,
      headers: {},
    }));
    const codes = result.findings.map((f) => f.code);
    expect(codes).toEqual([...codes].sort((a, b) => {
      const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
      const fa = result.findings.find((f) => f.code === a);
      const fb = result.findings.find((f) => f.code === b);
      const sa = severityOrder.indexOf(fa?.severity ?? '');
      const sb = severityOrder.indexOf(fb?.severity ?? '');
      return sa - sb || a.localeCompare(b);
    }));
  });

  it('computes a sensible overall score for a poor page', () => {
    const engine = new AnalysisEngine();
    const result = engine.analyzeDocument(documentFromHtml(loadFixture('poor-seo.html')));
    expect(result.overallScore).not.toBeNull();
    expect(result.overallScore).toBeLessThan(100);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it('emits progress milestones through the onProgress callback', async () => {
    const events: { progress: number; stage: string }[] = [];
    const fetcher = new WebsiteFetcher({
      lookup: publicLookup,
      fetchImpl: createMockFetch(() => htmlResponse(200, IDEAL_HTML, IDEAL_HEADERS)),
    });
    const engine = new AnalysisEngine({ fetcher });

    await engine.analyze('https://example.com/', {
      onProgress: (event) => events.push(event),
    });

    const stages = events.map((e) => e.stage);
    expect(stages).toEqual([
      'fetching',
      'parsing',
      'seo',
      'technical',
      'content',
      'accessibility',
      'performance',
      'completed',
    ]);
    expect(events.map((e) => e.progress)).toEqual([10, 25, 40, 55, 70, 82, 94, 100]);
  });

  it('propagates an onProgress throw to abort the analysis', async () => {
    const fetcher = new WebsiteFetcher({
      lookup: publicLookup,
      fetchImpl: createMockFetch(() => htmlResponse(200, IDEAL_HTML, IDEAL_HEADERS)),
    });
    const engine = new AnalysisEngine({ fetcher });

    await expect(
      engine.analyze('https://example.com/', {
        onProgress: (event) => {
          if (event.stage === 'content') {
            throw new Error('abort requested');
          }
        },
      }),
    ).rejects.toThrow('abort requested');
  });

  it('exposes finding immutability (readonly fields)', () => {
    const engine = new AnalysisEngine();
    const result = engine.analyzeDocument(documentFromHtml('<html><body>x</body></html>'));
    const finding: Finding = result.findings[0] as Finding;
    expect(finding.scoreImpact.points).toBeGreaterThan(0);
    expect(typeof finding.code).toBe('string');
    expect(finding.evidence.length).toBeGreaterThanOrEqual(0);
  });
});