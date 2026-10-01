import { describe, expect, it } from 'vitest';
import { validateAIInsightOutput } from '../src/validation/schema';
import { DomainValidator } from '../src/validation/domain';
import { AIValidationError } from '../src/errors';
import type { AIAnalysisContext, AIInsightResult } from '../src/domain';

const context: AIAnalysisContext = {
  website: { host: 'example.com', url: 'https://example.com' },
  analysis: {
    runStatus: 'completed',
    overallScore: 87,
    categoryScores: { seo: 78, technical: 86, content: 84, accessibility: 96, performance: 96 },
    failedCategories: [],
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
  },
  findings: [
    {
      ruleCode: 'SEO_META_DESCRIPTION_MISSING',
      category: 'seo',
      severity: 'high',
      title: 'Meta description is missing',
      shortDescription: 'The page has no meta description.',
      compactEvidence: ['missing head > meta[name="description"]'],
      scoreImpact: 10,
    },
    {
      ruleCode: 'TECH_SECURITY_HEADER_MISSING',
      category: 'technical',
      severity: 'medium',
      title: 'Security header missing',
      shortDescription: 'strict-transport-security is absent.',
      compactEvidence: ['strict-transport-security: (present)'],
      scoreImpact: 5,
    },
    {
      ruleCode: 'A11Y_IMAGE_ALT_MISSING',
      category: 'accessibility',
      severity: 'medium',
      title: 'Image without alt text',
      shortDescription: 'An image has no alt attribute.',
      compactEvidence: ['img.hero [alt]'],
      scoreImpact: 5,
    },
  ],
};

function validResult(): AIInsightResult {
  return {
    summary: {
      headline: 'Solid foundation with room to improve SEO',
      overview: 'The site scores well overall.',
      strengths: ['Strong accessibility'],
      weaknesses: ['Missing meta description'],
    },
    recommendations: [
      {
        title: 'Add a meta description',
        description: 'Write a concise meta description for this page.',
        priority: 'high',
        effort: 'low',
        impact: 'high',
        category: 'seo',
        relatedFindingCodes: ['SEO_META_DESCRIPTION_MISSING'],
      },
    ],
  };
}

describe('schema validation', () => {
  it('accepts a well-formed structured output', () => {
    expect(validateAIInsightOutput(validResult())).toEqual([]);
  });

  it('rejects invalid enums', () => {
    const invalid = {
      ...validResult(),
      recommendations: [
        { ...validResult().recommendations[0], priority: 'urgent' },
      ],
    };
    const issues = validateAIInsightOutput(invalid);
    expect(issues.some((issue) => issue.includes('priority'))).toBe(true);
  });

  it('rejects missing required fields', () => {
    const { summary, ...rest } = validResult();
    void summary;
    expect(validateAIInsightOutput(rest)).not.toEqual([]);
  });

  it('rejects recommendations without any related finding code', () => {
    const invalid = {
      ...validResult(),
      recommendations: [
        { ...validResult().recommendations[0], relatedFindingCodes: [] },
      ],
    };
    expect(validateAIInsightOutput(invalid)).not.toEqual([]);
  });

  it('rejects an unknown category', () => {
    const invalid = {
      ...validResult(),
      recommendations: [
        { ...validResult().recommendations[0], category: 'marketing' },
      ],
    };
    expect(validateAIInsightOutput(invalid)).not.toEqual([]);
  });

  it('rejects more than 10 recommendations', () => {
    const recommendation = validResult().recommendations[0];
    const invalid = {
      ...validResult(),
      recommendations: Array.from({ length: 11 }, (_, index) => ({
        ...recommendation,
        title: `Recommendation ${index}`,
      })),
    };
    expect(validateAIInsightOutput(invalid)).not.toEqual([]);
  });
});

describe('domain validation', () => {
  const validator = new DomainValidator({ maxRecommendations: 8, maxRecommendationsPerFinding: 3 });

  it('accepts recommendations grounded in real finding codes with matching categories', () => {
    expect(() => validator.validate(validResult(), context)).not.toThrow();
  });

  it('rejects unknown finding codes (fabricated evidence)', () => {
    const fabricated = {
      ...validResult(),
      recommendations: [
        {
          ...validResult().recommendations[0],
          relatedFindingCodes: ['SEO_FAKE_CODE'],
        },
      ],
    };
    expect(() => validator.validate(fabricated, context)).toThrow(/SEO_FAKE_CODE/);
  });

  it('rejects codes that exist nowhere in the context', () => {
    const wrongContext: AIAnalysisContext = { ...context, findings: [] };
    expect(() => validator.validate(validResult(), wrongContext)).toThrow(
      /unknown finding code/,
    );
  });

  it('rejects a recommendation whose category does not match its findings', () => {
    const mismatched = {
      ...validResult(),
      recommendations: [
        {
          ...validResult().recommendations[0],
          category: 'technical',
        },
      ],
    };
    expect(() => validator.validate(mismatched, context)).toThrow(/does not match/);
  });

  it('rejects duplicate recommendations', () => {
    const duplicates = {
      ...validResult(),
      recommendations: [
        validResult().recommendations[0],
        validResult().recommendations[0],
      ],
    };
    expect(() => validator.validate(duplicates, context)).toThrow(/duplicate/);
  });

  it('rejects empty titles and descriptions', () => {
    const empty = {
      ...validResult(),
      recommendations: [
        { ...validResult().recommendations[0], title: '   ' },
      ],
    };
    expect(() => validator.validate(empty, context)).toThrow(/empty title/);
  });

  it('rejects over-referencing the same finding', () => {
    const recommendation = {
      ...validResult().recommendations[0],
      relatedFindingCodes: ['SEO_META_DESCRIPTION_MISSING'],
    };
    const overReferenced = {
      ...validResult(),
      recommendations: [
        { ...recommendation, title: 'Add meta description A' },
        { ...recommendation, title: 'Add meta description B' },
        { ...recommendation, title: 'Add meta description C' },
        { ...recommendation, title: 'Add meta description D' },
      ],
    };
    expect(() => validator.validate(overReferenced, context)).toThrow(/drives too many/);
  });

  it('rejects too many recommendations', () => {
    const strict = new DomainValidator({ maxRecommendations: 1 });
    const tooMany = {
      ...validResult(),
      recommendations: [
        validResult().recommendations[0],
        {
          ...validResult().recommendations[0],
          title: 'Another recommendation',
          relatedFindingCodes: ['TECH_SECURITY_HEADER_MISSING'],
          category: 'technical',
        },
      ],
    };
    expect(() => strict.validate(tooMany, context)).toThrow(/too many recommendations/);
  });

  it('throws an AIValidationError with the domain stage', () => {
    const fabricated = {
      ...validResult(),
      recommendations: [
        {
          ...validResult().recommendations[0],
          relatedFindingCodes: ['NOPE'],
        },
      ],
    };
    try {
      validator.validate(fabricated, context);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AIValidationError);
      expect((error as AIValidationError).stage).toBe('domain');
    }
  });
});