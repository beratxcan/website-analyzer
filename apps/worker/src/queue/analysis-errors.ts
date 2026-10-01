import { UnrecoverableError } from 'bullmq';
import { FetcherError } from '@analyzer/analysis';

/**
 * Transient failures worth retrying with backoff: network timeouts, refused
 * connections and temporary DNS problems.
 */
const RETRYABLE_FETCHER_CODES = new Set([
  'REQUEST_TIMEOUT',
  'CONNECTION_TIMEOUT',
  'CONNECTION_REFUSED',
  'FETCH_FAILED',
  'DNS_RESOLUTION_FAILED',
]);

/**
 * Permanent failures that retrying cannot fix: invalid targets, SSRF
 * blocks and content/format problems.
 */
const NON_RETRYABLE_FETCHER_CODES = new Set([
  'INVALID_URL',
  'UNSUPPORTED_PROTOCOL',
  'URL_CREDENTIALS',
  'HOSTNAME_BLOCKED',
  'PRIVATE_IP_BLOCKED',
  'RESPONSE_TOO_LARGE',
  'INVALID_CONTENT_TYPE',
  'REDIRECT_LIMIT_EXCEEDED',
]);

export interface ErrorClassification {
  retryable: boolean;
  code: string;
}

export function classifyError(error: unknown): ErrorClassification {
  if (error instanceof UnrecoverableError) {
    return { retryable: false, code: 'UNRECOVERABLE' };
  }
  if (error instanceof FetcherError) {
    if (NON_RETRYABLE_FETCHER_CODES.has(error.code)) {
      return { retryable: false, code: error.code };
    }
    if (RETRYABLE_FETCHER_CODES.has(error.code)) {
      return { retryable: true, code: error.code };
    }
  }
  // Unknown failures are assumed transient; bounded attempts still cap them.
  return { retryable: true, code: 'UNKNOWN_ERROR' };
}

/** Run states that must never be executed again. */
export function isFinalRunStatus(status: string): boolean {
  return status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED' || status === 'FAILED' || status === 'CANCELLED';
}