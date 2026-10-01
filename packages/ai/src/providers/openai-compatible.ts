/**
 * OpenAI-compatible provider adapter.
 *
 * Talks to any `POST /chat/completions` endpoint (OpenAI, OpenRouter, Groq,
 * local vLLM/Ollama-compatible gateways) over plain HTTP with the global
 * fetch API — no provider SDK. Response format is JSON mode; structured
 * validation happens downstream so the adapter stays endpoint-agnostic.
 */
import type {
  AIGenerationResponse,
  AIProvider,
  AIPromptRequest,
} from '../domain';
import { AIProviderError, type AIProviderErrorCode } from '../errors';

export interface OpenAICompatibleProviderOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens?: number;
  temperature?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

function classifyHttpStatus(status: number): { code: AIProviderErrorCode; retryable: boolean } {
  if (status === 401 || status === 403) {
    return { code: 'AI_AUTH_FAILED', retryable: false };
  }
  if (status === 429) {
    return { code: 'AI_RATE_LIMITED', retryable: true };
  }
  if (status >= 500) {
    return { code: 'AI_PROVIDER_UNAVAILABLE', retryable: true };
  }
  if (status === 404 || status === 400) {
    return { code: 'AI_CONFIG_INVALID', retryable: false };
  }
  return { code: 'AI_UNSUPPORTED', retryable: false };
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly name = 'openai-compatible';

  constructor(private readonly options: OpenAICompatibleProviderOptions) {}

  async generateStructured(request: AIPromptRequest): Promise<AIGenerationResponse> {
    const timeoutMs = request.timeoutMs ?? this.options.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new AIProviderError('AI_TIMEOUT', `Provider request exceeded ${timeoutMs}ms`, true));
    }, timeoutMs);
    const startedAt = Date.now();
    const baseUrl = this.options.baseUrl.replace(/\/+$/, '');

    try {
      const response = await (this.options.fetchImpl ?? fetch)(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          temperature: request.temperature ?? this.options.temperature ?? 0.2,
          max_tokens: request.maxOutputTokens ?? this.options.maxOutputTokens,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const classification = classifyHttpStatus(response.status);
        throw new AIProviderError(
          classification.code,
          `Provider returned HTTP ${response.status}`,
          classification.retryable,
          response.status,
        );
      }

      const data = (await response.json()) as {
        id?: unknown;
        model?: unknown;
        choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>;
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length === 0) {
        throw new AIProviderError('AI_INVALID_RESPONSE', 'Provider response is missing message content', false);
      }

      return {
        content,
        model: typeof data.model === 'string' ? data.model : request.model,
        provider: this.name,
        inputTokens: toNonNegativeInt(data.usage?.prompt_tokens),
        outputTokens: toNonNegativeInt(data.usage?.completion_tokens),
        totalTokens: toNonNegativeInt(data.usage?.total_tokens),
        finishReason: typeof data.choices?.[0]?.finish_reason === 'string' ? data.choices[0].finish_reason : null,
        latencyMs: Date.now() - startedAt,
        providerRequestId: typeof data.id === 'string' ? data.id : null,
      };
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }
      if (isAbortError(error)) {
        throw new AIProviderError('AI_TIMEOUT', `Provider request exceeded ${timeoutMs}ms`, true);
      }
      throw new AIProviderError(
        'AI_CONNECTION_FAILED',
        error instanceof Error ? error.message : String(error),
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

function toNonNegativeInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}