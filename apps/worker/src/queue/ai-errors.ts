import { UnrecoverableError } from 'bullmq';
import { AIProviderError, AIValidationError } from '@analyzer/ai';
import type { ErrorClassification } from './analysis-errors';

/**
 * Classifies AI failures for retry policy:
 * - retryable: timeouts, connection failures, rate limits, provider 5xx
 * - non-retryable: config/auth errors, validation failures (after bounded
 *   repair), unrecoverable signals from BullMQ
 */
export function classifyAIError(error: unknown): ErrorClassification {
  if (error instanceof UnrecoverableError) {
    return { retryable: false, code: 'AI_UNRECOVERABLE' };
  }
  if (error instanceof AIValidationError) {
    return { retryable: false, code: 'AI_VALIDATION_FAILED' };
  }
  if (error instanceof AIProviderError) {
    return { retryable: error.retryable, code: error.code };
  }
  // Unknown AI failures are assumed transient; bounded attempts cap them.
  return { retryable: true, code: 'AI_UNKNOWN_ERROR' };
}

/** AI result states that must never be enriched again. */
export function isFinalAIStatus(status: string): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'SKIPPED';
}