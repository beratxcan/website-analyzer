import { z } from 'zod';

const nodeEnvSchema = z.enum(['development', 'test', 'production']).default('development');
const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']).default('info');

/** Secrets that must never keep their development defaults in production. */
const DEV_SECRET_DEFAULTS = new Set([
  'dev-access-secret-change-me-please',
  'dev-refresh-secret-change-me-please',
  'ci-access-secret-change-me-please',
  'ci-refresh-secret-change-me-please',
]);

const PRODUCTION_SECRET_MIN_LENGTH = 32;

/**
 * Environment required by the API application.
 *
 * Grouped by concern: app/runtime, database, redis, auth, security
 * (CORS/rate limiting), analysis job policy and logging.
 */
export const apiEnvSchema = z
  .object({
    // ── App ────────────────────────────────────────────────────────────────
    NODE_ENV: nodeEnvSchema,
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    WEB_URL: z.url().default('http://localhost:3000'),

    // ── Database / Redis ──────────────────────────────────────────────────
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),

    // ── Auth ──────────────────────────────────────────────────────────────
    // JWT secrets are required — never rely on code defaults for secrets.
    JWT_ACCESS_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
    ACCESS_TOKEN_TTL: z.string().min(1).default('15m'),
    REFRESH_TOKEN_TTL: z.string().min(1).default('30d'),
    // Local development seed credentials (never use in production).
    SEED_EMAIL: z.email().default('demo@analyzer.dev'),
    SEED_PASSWORD: z.string().min(8).default('demo-password-123'),

    // ── Security ──────────────────────────────────────────────────────────
    // Extra browser origins allowed to call the API (comma-separated).
    // Falls back to WEB_URL when unset; wildcards are never used.
    CORS_ALLOWED_ORIGINS: z.string().optional(),
    // Trusted proxy hops for client-IP resolution (rate limiting). 0 = none.
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    // Emit Strict-Transport-Security; enable only behind TLS termination.
    HSTS_ENABLED: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === 'true')),
    // Interactive API docs. Defaults to disabled in production.
    SWAGGER_ENABLED: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === 'true')),
    // Rate limiting is per-IP, sliding window, Redis-backed.
    THROTTLE_TTL: z.coerce.number().int().min(1).default(60_000),
    THROTTLE_LIMIT: z.coerce.number().int().min(1).default(600),
    THROTTLE_AUTH_TTL: z.coerce.number().int().min(1).default(60_000),
    THROTTLE_AUTH_LIMIT: z.coerce.number().int().min(1).default(10),
    THROTTLE_ANALYSIS_TTL: z.coerce.number().int().min(1).default(300_000),
    THROTTLE_ANALYSIS_LIMIT: z.coerce.number().int().min(1).default(20),
    // Behavior when Redis cannot serve the rate-limit counter. Authentication
    // endpoints always fail closed regardless of this setting.
    RATE_LIMIT_REDIS_FAILURE: z.enum(['open', 'closed']).default('open'),
    // Namespace for rate-limit counters — lets environments share one Redis.
    RATE_LIMIT_KEY_PREFIX: z.string().min(1).default('rl:'),

    // ── Analysis job policy (API → queue) ─────────────────────────────────
    ANALYSIS_JOB_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    ANALYSIS_JOB_BACKOFF_DELAY_MS: z.coerce.number().int().min(1).default(2_000),

    // ── Logging ───────────────────────────────────────────────────────────
    LOG_LEVEL: logLevelSchema,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') {
      return;
    }
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      const value = env[key];
      if (DEV_SECRET_DEFAULTS.has(value) || value.length < PRODUCTION_SECRET_MIN_LENGTH) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} must be a unique secret of at least ${PRODUCTION_SECRET_MIN_LENGTH} characters in production`,
        });
      }
    }
  });

/** Environment required by the worker application. */
export const workerEnvSchema = z
  .object({
    // ── App ────────────────────────────────────────────────────────────────
    NODE_ENV: nodeEnvSchema,
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),

    // ── Queue ─────────────────────────────────────────────────────────────
    WORKER_QUEUE_NAME: z.string().min(1).default('analysis'),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(1),
    AI_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(1),
    // Runs stuck in `running` longer than this are recovered as stale.
    WORKER_STALE_RUN_THRESHOLD_MS: z.coerce.number().int().min(1).default(10 * 60_000),
    WORKER_STALE_CHECK_INTERVAL_MS: z.coerce.number().int().min(1).default(60_000),

    // ── Analysis fetch limits (validated configuration, not hardcoded) ────
    FETCH_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1).default(10_000),
    FETCH_TOTAL_TIMEOUT_MS: z.coerce.number().int().min(1).default(30_000),
    FETCH_MAX_REDIRECTS: z.coerce.number().int().min(0).max(20).default(5),
    FETCH_MAX_RESPONSE_BYTES: z.coerce.number().int().min(1_024).default(5_000_000),

    // ── AI orchestration (worker-side) ────────────────────────────────────
    // Provider selection is config-driven; credentials come from the
    // environment only, never from source code.
    AI_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    AI_PROVIDER: z.enum(['openai-compatible']).default('openai-compatible'),
    AI_BASE_URL: z.url().default('https://api.openai.com/v1'),
    // Optional in development: absent keys make AI jobs fail fast
    // (AI_CONFIG_INVALID) without retrying — the deterministic run is never
    // affected. Required in production when AI is enabled.
    AI_API_KEY: z.string().min(1).optional(),
    AI_MODEL: z.string().min(1).default('gpt-4o-mini'),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1).default(30_000),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1).default(1_500),
    AI_MAX_FINDINGS: z.coerce.number().int().min(1).max(200).default(30),
    AI_MAX_RECOMMENDATIONS: z.coerce.number().int().min(1).max(20).default(8),
    AI_MAX_REPAIRS: z.coerce.number().int().min(0).max(3).default(1),
    AI_JOB_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    AI_JOB_BACKOFF_DELAY_MS: z.coerce.number().int().min(1).default(2_000),

    // ── Logging ───────────────────────────────────────────────────────────
    LOG_LEVEL: logLevelSchema,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') {
      return;
    }
    if (env.AI_ENABLED && env.AI_API_KEY === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['AI_API_KEY'],
        message: 'AI_API_KEY is required in production when AI_ENABLED is true',
      });
    }
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

/** Shared typed view of the API environment. */
export type ApiConfig = ApiEnv;

/** Shared typed view of the worker environment. */
export type WorkerConfig = WorkerEnv;

/** Comma-separated origins → trimmed, de-duplicated list. */
export function parseOrigins(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  const origins = value
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);
  return [...new Set(origins)];
}

/**
 * Full set of browser origins allowed to call the API with credentials.
 * Always explicit — never a wildcard.
 */
export function allowedCorsOrigins(config: Pick<ApiConfig, 'WEB_URL' | 'CORS_ALLOWED_ORIGINS'>): string[] {
  const configured = parseOrigins(config.CORS_ALLOWED_ORIGINS);
  const fallback = config.WEB_URL.replace(/\/+$/, '');
  return configured.length > 0 ? configured : [fallback];
}
