/**
 * Provider-layer error model. Errors carry a stable code and a retryability
 * flag so the worker can apply bounded, classified retries without knowing
 * any provider SDK.
 */

export type AIProviderErrorCode =
  | 'AI_TIMEOUT'
  | 'AI_CONNECTION_FAILED'
  | 'AI_RATE_LIMITED'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_CONFIG_INVALID'
  | 'AI_AUTH_FAILED'
  | 'AI_INVALID_RESPONSE'
  | 'AI_UNSUPPORTED';

export class AIProviderError extends Error {
  constructor(
    readonly code: AIProviderErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

/**
 * Raised when the model output fails schema or domain validation after all
 * bounded repair attempts. Always non-retryable: another generation with the
 * same context cannot be expected to fix a fabrication.
 */
export class AIValidationError extends Error {
  constructor(
    readonly stage: 'schema' | 'domain',
    readonly issues: string[],
  ) {
    super(`AI output failed ${stage} validation: ${issues.join('; ')}`);
    this.name = 'AIValidationError';
  }
}

export function isRetryableProviderError(error: unknown): boolean {
  return error instanceof AIProviderError && error.retryable;
}