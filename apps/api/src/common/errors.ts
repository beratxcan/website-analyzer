import { HttpException, HttpStatus } from '@nestjs/common';

/** Stable machine-readable error codes returned in the API error envelope. */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  CSRF_ORIGIN_REJECTED: 'CSRF_ORIGIN_REJECTED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  WEBSITE_NOT_FOUND: 'WEBSITE_NOT_FOUND',
  INVALID_TARGET_URL: 'INVALID_TARGET_URL',
  WEBSITE_ALREADY_EXISTS: 'WEBSITE_ALREADY_EXISTS',
  ANALYSIS_NOT_FOUND: 'ANALYSIS_NOT_FOUND',
  ANALYSIS_NOT_CANCELLABLE: 'ANALYSIS_NOT_CANCELLABLE',
  COMPARISON_SAME_RUN: 'COMPARISON_SAME_RUN',
  COMPARISON_DIFFERENT_WEBSITE: 'COMPARISON_DIFFERENT_WEBSITE',
  RUN_NOT_COMPARABLE: 'RUN_NOT_COMPARABLE',
  REPORT_UNAVAILABLE: 'REPORT_UNAVAILABLE',
  QUEUE_UNAVAILABLE: 'QUEUE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Business exception carrying a stable error code for the API envelope. */
export class ApiException extends HttpException {
  readonly code: ErrorCode;

  constructor(
    status: HttpStatus,
    code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message, status);
    this.code = code;
  }
}