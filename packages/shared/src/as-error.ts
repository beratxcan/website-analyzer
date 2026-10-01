/**
 * Normalizes an unknown caught value into an Error so callers can rely on a
 * stable shape when logging or classifying failures.
 */
export function asError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error);
  }
  return new Error(`Unknown error: ${JSON.stringify(error)}`);
}