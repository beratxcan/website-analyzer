export type FetcherErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'URL_CREDENTIALS'
  | 'HOSTNAME_BLOCKED'
  | 'PRIVATE_IP_BLOCKED'
  | 'DNS_RESOLUTION_FAILED'
  | 'REDIRECT_LIMIT_EXCEEDED'
  | 'REQUEST_TIMEOUT'
  | 'CONNECTION_TIMEOUT'
  | 'CONNECTION_REFUSED'
  | 'RESPONSE_TOO_LARGE'
  | 'INVALID_CONTENT_TYPE'
  | 'FETCH_FAILED';

export class FetcherError extends Error {
  readonly code: FetcherErrorCode;

  constructor(code: FetcherErrorCode, message: string) {
    super(message);
    this.name = 'FetcherError';
    this.code = code;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}