import { describe, expect, it } from 'vitest';
import { AIOrchestrator } from '../src/orchestrator';
import { AIProviderError, AIValidationError } from '../src/errors';
import { ANALYSIS_INSIGHTS } from '../src/prompts/analysis-insights';
import type { AnalysisSnapshot } from '../src/domain';
import { FakeProvider, generation } from './fake-provider';

function snapshot(): AnalysisSnapshot {
  return {
    website: { host: 'example.com', url: 'https://example.com' },
    runStatus: 'completed',
    overallScore: 87,
    categoryScores: { seo: 78, technical: 86, content: 84, accessibility: 96, performance: 96 },
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    findings: [
      {
        ruleCode: 'SEO_META_DESCRIPTION_MISSING',
        category: 'seo',
        severity: 'high',
        title: 'Meta description is missing',
        description: 'The page has no meta description.',
        scoreImpact: 10,
        evidence: [{ type: 'html_missing', selector: 'head > meta[name="description"]', source: 'document' }],
      },
      {
        ruleCode: 'TECH_SECURITY_HEADER_MISSING',
        category: 'technical',
        severity: 'medium',
        title: 'Security header missing',
        description: 'strict-transport-security is absent.',
        scoreImpact: 5,
        evidence: [{ type: 'header', name: 'strict-transport-security', source: 'response' }],
      },
    ],
  };
}

function validInsightsJson(): string {
  return JSON.stringify({
    summary: {
      headline: 'Solid foundation, room to improve SEO',
      overview: 'The site scores well overall.',
      strengths: ['Good technical baseline'],
      weaknesses: ['Missing meta description'],
    },
    recommendations: [
      {
        title: 'Add a meta description',
        description: 'Write a concise meta description.',
        priority: 'high',
        effort: 'low',
        impact: 'high',
        category: 'seo',
        relatedFindingCodes: ['SEO_META_DESCRIPTION_MISSING'],
      },
      {
        title: 'Add security headers',
        description: 'Serve strict-transport-security.',
        priority: 'medium',
        effort: 'medium',
        impact: 'medium',
        category: 'technical',
        relatedFindingCodes: ['TECH_SECURITY_HEADER_MISSING'],
      },
    ],
  });
}

describe('AIOrchestrator', () => {
  it('generates, validates and returns a grounded structured result', async () => {
    const provider = new FakeProvider();
    provider.enqueueResponse(generation(validInsightsJson()));
    const orchestrator = new AIOrchestrator({ provider, model: 'test-model', maxRepairs: 1 });

    const outcome = await orchestrator.generate(snapshot());

    expect(outcome.result.summary.headline).toContain('Solid');
    expect(outcome.result.recommendations).toHaveLength(2);
    expect(outcome.result.recommendations[0]?.relatedFindingCodes).toEqual([
      'SEO_META_DESCRIPTION_MISSING',
    ]);
    expect(outcome.repaired).toBe(false);
    expect(outcome.generationAttempts).toBe(1);
    expect(outcome.promptVersion).toBe(ANALYSIS_INSIGHTS.promptVersion);
    expect(outcome.schemaVersion).toBe(ANALYSIS_INSIGHTS.schemaVersion);
    expect(outcome.generation.totalTokens).toBe(300);
    expect(outcome.generation.model).toBe('fake-model');
    expect(provider.calls).toHaveLength(1);
  });

  it('repairs schema-invalid output once and succeeds', async () => {
    const provider = new FakeProvider();
    provider.enqueueResponse(generation('{ not valid json at all'));
    provider.enqueueResponse(generation(validInsightsJson()));
    const orchestrator = new AIOrchestrator({ provider, maxRepairs: 1 });

    const outcome = await orchestrator.generate(snapshot());

    expect(outcome.repaired).toBe(true);
    expect(outcome.generationAttempts).toBe(2);
    expect(provider.calls).toHaveLength(2);
    // The repair prompt carries the validation issues.
    expect(provider.calls[1]?.userPrompt).toContain('not valid JSON');
  });

  it('repairs domain-invalid output (unknown code) once and succeeds', async () => {
    const provider = new FakeProvider();
    const fabricated = JSON.parse(validInsightsJson()) as { recommendations: unknown[] };
    fabricated.recommendations = [
      {
        ...(fabricated.recommendations[0] as object),
        relatedFindingCodes: ['SEO_MADE_UP_CODE'],
      },
    ];
    provider.enqueueResponse(generation(JSON.stringify(fabricated)));
    provider.enqueueResponse(generation(validInsightsJson()));
    const orchestrator = new AIOrchestrator({ provider, maxRepairs: 1 });

    const outcome = await orchestrator.generate(snapshot());

    expect(outcome.repaired).toBe(true);
    expect(provider.calls[1]?.userPrompt).toContain('SEO_MADE_UP_CODE');
  });

  it('fails after the bounded repair attempts are exhausted', async () => {
    const provider = new FakeProvider();
    provider.enqueueResponse(generation('{ broken json'));
    provider.enqueueResponse(generation('{ still broken json'));
    const orchestrator = new AIOrchestrator({ provider, maxRepairs: 1 });

    await expect(orchestrator.generate(snapshot())).rejects.toBeInstanceOf(AIValidationError);
    expect(provider.calls).toHaveLength(2);
  });

  it('fails immediately when repairs are disabled', async () => {
    const provider = new FakeProvider();
    provider.enqueueResponse(generation('{ broken json'));
    const orchestrator = new AIOrchestrator({ provider, maxRepairs: 0 });

    await expect(orchestrator.generate(snapshot())).rejects.toBeInstanceOf(AIValidationError);
    expect(provider.calls).toHaveLength(1);
  });

  it('propagates provider errors untouched', async () => {
    const provider = new FakeProvider();
    provider.enqueueError(new AIProviderError('AI_RATE_LIMITED', 'rate limited', true, 429));
    const orchestrator = new AIOrchestrator({ provider });

    const error = await orchestrator.generate(snapshot()).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AIProviderError);
    expect((error as AIProviderError).retryable).toBe(true);
    expect((error as AIProviderError).code).toBe('AI_RATE_LIMITED');
  });

  it('survives model output wrapped in markdown fences via the JSON-extraction fallback', async () => {
    const provider = new FakeProvider();
    provider.enqueueResponse(generation(`Here is the result:\n\`\`\`json\n${validInsightsJson()}\n\`\`\``));
    const orchestrator = new AIOrchestrator({ provider });

    const outcome = await orchestrator.generate(snapshot());
    expect(outcome.result.summary.headline).toContain('Solid');
    expect(outcome.repaired).toBe(false);
  });

  it('extracts only the finding codes present in the context into the prompt', async () => {
    const provider = new FakeProvider();
    provider.enqueueResponse(generation(validInsightsJson()));
    const orchestrator = new AIOrchestrator({ provider });

    await orchestrator.generate(snapshot());

    const userPrompt = provider.calls[0]?.userPrompt ?? '';
    expect(userPrompt).toContain('SEO_META_DESCRIPTION_MISSING');
    expect(userPrompt).toContain('Overall score: 87/100');
    expect(userPrompt).not.toContain('websiteId');
    expect(userPrompt).not.toContain('userId');
  });
});