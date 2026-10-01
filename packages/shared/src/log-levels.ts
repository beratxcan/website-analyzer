/**
 * Log-level filtering shared by the API and worker bootstraps.
 *
 * Levels are ordered by increasing severity; asking for `warn` keeps `warn`
 * and `error` and drops `log`/`debug`. The returned names match Nest's
 * `LogLevel` values without importing Nest into a framework-independent
 * package.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** The log-level names Nest's logger accepts. */
export type NestLogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

const LEVELS_BY_SEVERITY: Record<LogLevel, readonly NestLogLevel[]> = {
  debug: ['log', 'error', 'warn', 'debug', 'verbose'],
  info: ['log', 'error', 'warn'],
  warn: ['error', 'warn'],
  error: ['error'],
};

/** Nest logger levels enabled for a configured log level. */
export function logLevelsFor(level: LogLevel): NestLogLevel[] {
  return [...LEVELS_BY_SEVERITY[level]];
}
