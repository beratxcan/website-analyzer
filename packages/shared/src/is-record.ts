/**
 * Type guard for plain objects (including class instances), excluding
 * `null` and arrays.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}