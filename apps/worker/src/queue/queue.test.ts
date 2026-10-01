import { describe, expect, it } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import { FetcherError } from '@analyzer/analysis';
import { ANALYSIS_QUEUE_NAME } from './analysis-queue.constants';
import { classifyError, isFinalRunStatus } from './analysis-errors';

describe('analysis queue foundation', () => {
  it('uses the shared queue contract name', () => {
    expect(ANALYSIS_QUEUE_NAME).toBe('analysis');
  });
});

describe('classifyError', () => {
  it('classifies transient fetcher failures as retryable', () => {
    for (const code of ['REQUEST_TIMEOUT', 'CONNECTION_TIMEOUT', 'CONNECTION_REFUSED', 'FETCH_FAILED', 'DNS_RESOLUTION_FAILED']) {
      expect(classifyError(new FetcherError(code as never, 'boom'))).toEqual({ retryable: true, code });
    }
  });

  it('classifies SSRF and target failures as non-retryable', () => {
    for (const code of ['PRIVATE_IP_BLOCKED', 'HOSTNAME_BLOCKED', 'INVALID_URL', 'UNSUPPORTED_PROTOCOL', 'URL_CREDENTIALS', 'RESPONSE_TOO_LARGE', 'INVALID_CONTENT_TYPE', 'REDIRECT_LIMIT_EXCEEDED']) {
      expect(classifyError(new FetcherError(code as never, 'boom'))).toEqual({ retryable: false, code });
    }
  });

  it('never retries UnrecoverableError', () => {
    expect(classifyError(new UnrecoverableError('permanent'))).toEqual({
      retryable: false,
      code: 'UNRECOVERABLE',
    });
  });

  it('treats unknown errors as retryable', () => {
    expect(classifyError(new Error('weird'))).toEqual({ retryable: true, code: 'UNKNOWN_ERROR' });
  });
});

describe('isFinalRunStatus', () => {
  it('detects terminal run states', () => {
    for (const status of ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED']) {
      expect(isFinalRunStatus(status)).toBe(true);
    }
    expect(isFinalRunStatus('QUEUED')).toBe(false);
    expect(isFinalRunStatus('RUNNING')).toBe(false);
  });
});