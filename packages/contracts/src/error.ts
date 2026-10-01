/**
 * Error details returned by the API for non-2xx responses.
 *
 * `code` is a stable machine-readable identifier (e.g. `VALIDATION_ERROR`);
 * `message` is a human-readable description that may change freely.
 */
export interface ApiErrorBody {
  code: string;
  message: string;
  /** Correlation identifier for tracing the failing request. */
  requestId?: string;
  /** Optional structured details, e.g. field-level validation errors. */
  details?: Record<string, unknown>;
}

/** Standard envelope: every error response is `{ error: ApiErrorBody }`. */
export interface ApiErrorEnvelope {
  error: ApiErrorBody;
}