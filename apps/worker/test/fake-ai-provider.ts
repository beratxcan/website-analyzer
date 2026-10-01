import { AIOrchestrator, type AIProvider, type AIGenerationResponse, type AIPromptRequest } from '@analyzer/ai';

/** Queues responses and errors; records every call for assertions. */
export class FakeAIProvider implements AIProvider {
  readonly name = 'fake';
  calls: AIPromptRequest[] = [];
  private responses: AIGenerationResponse[] = [];
  private errors: Error[] = [];

  enqueueResponse(response: AIGenerationResponse): void {
    this.responses.push(response);
  }

  enqueueError(error: Error): void {
    this.errors.push(error);
  }

  async generateStructured(request: AIPromptRequest): Promise<AIGenerationResponse> {
    this.calls.push(request);
    const error = this.errors.shift();
    if (error) throw error;
    const response = this.responses.shift();
    if (!response) {
      throw new Error('FakeAIProvider exhausted: no queued response');
    }
    return response;
  }
}

export function aiGeneration(
  content: string,
  overrides: Partial<AIGenerationResponse> = {},
): AIGenerationResponse {
  return {
    content,
    model: 'fake-model',
    provider: 'fake',
    inputTokens: 120,
    outputTokens: 240,
    totalTokens: 360,
    finishReason: 'stop',
    latencyMs: 55,
    providerRequestId: 'req_test',
    ...overrides,
  };
}

/** A grounded, schema-valid insights payload for the worker fixture findings. */
export function validInsightsContent(): string {
  return JSON.stringify({
    summary: {
      headline: 'Worker fixture insights',
      overview: 'The page has deterministic issues worth addressing.',
      strengths: ['Fast deterministic pipeline'],
      weaknesses: ['Missing meta description'],
    },
    recommendations: [
      {
        title: 'Add a meta description',
        description: 'Write a concise meta description for the fixture page.',
        priority: 'high',
        effort: 'low',
        impact: 'high',
        category: 'seo',
        relatedFindingCodes: ['SEO_META_DESCRIPTION_MISSING'],
      },
    ],
  });
}

export function orchestratorWith(provider: AIProvider): AIOrchestrator {
  return new AIOrchestrator({ provider, model: 'fake-model', maxRepairs: 1 });
}