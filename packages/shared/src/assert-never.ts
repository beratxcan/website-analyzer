/**
 * Asserts that a value is unreachable. Useful for exhaustive switch statements.
 * The `never` parameter guarantees compile-time exhaustiveness checking.
 */
export function assertNever(value: never, message = 'Unexpected value'): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}