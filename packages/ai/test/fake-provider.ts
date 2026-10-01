import type { AIGenerationResponse, AIProvider, AIPromptRequest } from '../src/domain';

/** Queues responses (and/or errors) and records every call for assertions. */
export class FakeProvider implements AIProvider {
  readonly name = 'fake';
  calls: AIPromptRequest[] = [];
  private responses: AIGenerationResponse[] = [];
  private errors: Error[] = [];

  constructor(private readonly model = 'fake-model') {}

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
      throw new Error('FakeProvider exhausted: no queued response');
    }
    return response;
  }
}

export function generation(
  content: string,
  overrides: Partial<AIGenerationResponse> = {},
): AIGenerationResponse {
  return {
    content,
    model: 'fake-model',
    provider: 'fake',
    inputTokens: 100,
    outputTokens: 200,
    totalTokens: 300,
    finishReason: 'stop',
    latencyMs: 42,
    providerRequestId: 'req_fake',
    ...overrides,
  };
}