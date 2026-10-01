import { describe, expect, it } from 'vitest';
import {
  allowedCorsOrigins,
  loadApiConfig,
  loadWorkerConfig,
  parseOrigins,
  parseRedisUrl,
  redisConnectionOptions,
} from './index';

const validApiEnv = {
  NODE_ENV: 'development',
  API_PORT: '4000',
  WEB_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://analyzer:analyzer@localhost:5432/analyzer',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'dev-access-secret-change-me-please',
  JWT_REFRESH_SECRET: 'dev-refresh-secret-change-me-please',
};


describe('loadApiConfig', () => {
  it('parses and coerces a valid environment', () => {
    const config = loadApiConfig(validApiEnv);
    expect(config.API_PORT).toBe(4000);
    expect(config.WEB_URL).toBe('http://localhost:3000');
    expect(config.DATABASE_URL).toContain('localhost:5432');
    expect(config.NODE_ENV).toBe('development');
  });

  it('applies defaults for optional fields', () => {
    const config = loadApiConfig({ ...validApiEnv, API_PORT: undefined });
    expect(config.API_PORT).toBe(4000);
    expect(config.WEB_URL).toBe('http://localhost:3000');
  });

  it('fails fast when a required variable is missing', () => {
    const missing: Record<string, string> = { ...validApiEnv };
    delete missing.DATABASE_URL;
    expect(() => loadApiConfig(missing)).toThrow(/DATABASE_URL/);
  });

  it('fails fast when JWT secrets are missing or too short', () => {
    const missing: Record<string, string> = { ...validApiEnv };
    delete missing.JWT_ACCESS_SECRET;
    expect(() => loadApiConfig(missing)).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => loadApiConfig({ ...validApiEnv, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('fails fast on invalid values', () => {
    expect(() => loadApiConfig({ ...validApiEnv, API_PORT: 'not-a-port' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('applies the security and rate-limit defaults', () => {
    const config = loadApiConfig(validApiEnv);
    expect(config.THROTTLE_LIMIT).toBe(600);
    expect(config.THROTTLE_AUTH_LIMIT).toBe(10);
    expect(config.THROTTLE_ANALYSIS_LIMIT).toBe(20);
    expect(config.RATE_LIMIT_REDIS_FAILURE).toBe('open');
    expect(config.TRUST_PROXY).toBe(0);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.ANALYSIS_JOB_ATTEMPTS).toBe(3);
    // Optional flags stay undefined so callers can apply environment defaults.
    expect(config.SWAGGER_ENABLED).toBeUndefined();
    expect(config.HSTS_ENABLED).toBeUndefined();
  });

  it('rejects development secrets in production', () => {
    const production = { ...validApiEnv, NODE_ENV: 'production' };
    expect(() => loadApiConfig(production)).toThrow(/JWT_ACCESS_SECRET/);
    expect(() =>
      loadApiConfig({ ...production, JWT_ACCESS_SECRET: 'short', JWT_REFRESH_SECRET: 'a'.repeat(40) }),
    ).toThrow(/JWT_ACCESS_SECRET/);
    expect(() =>
      loadApiConfig({
        ...production,
        JWT_ACCESS_SECRET: 'a'.repeat(40),
        JWT_REFRESH_SECRET: 'dev-refresh-secret-change-me-please',
      }),
    ).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('accepts unique, long secrets in production', () => {
    const config = loadApiConfig({
      ...validApiEnv,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a'.repeat(40),
      JWT_REFRESH_SECRET: 'b'.repeat(40),
    });
    expect(config.NODE_ENV).toBe('production');
  });
});

describe('allowedCorsOrigins', () => {
  it('falls back to WEB_URL when no explicit origins are configured', () => {
    expect(allowedCorsOrigins({ WEB_URL: 'http://localhost:3000', CORS_ALLOWED_ORIGINS: undefined })).toEqual([
      'http://localhost:3000',
    ]);
  });

  it('parses, normalizes and de-duplicates an explicit list', () => {
    expect(parseOrigins('https://app.example.com/, https://admin.example.com ,https://app.example.com')).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('prefers the explicit list over the fallback', () => {
    expect(
      allowedCorsOrigins({
        WEB_URL: 'http://localhost:3000',
        CORS_ALLOWED_ORIGINS: 'https://app.example.com',
      }),
    ).toEqual(['https://app.example.com']);
  });
});

describe('loadWorkerConfig', () => {
  const validWorkerEnv = {
    DATABASE_URL: 'postgres://analyzer:analyzer@localhost:5432/analyzer',
    REDIS_URL: 'redis://localhost:6379',
  };

  it('applies worker defaults', () => {
    const config = loadWorkerConfig(validWorkerEnv);
    expect(config.WORKER_QUEUE_NAME).toBe('analysis');
    expect(config.WORKER_CONCURRENCY).toBe(1);
    expect(config.WORKER_STALE_RUN_THRESHOLD_MS).toBe(10 * 60_000);
    expect(config.AI_ENABLED).toBe(true);
    expect(config.AI_PROVIDER).toBe('openai-compatible');
    expect(config.AI_MODEL).toBe('gpt-4o-mini');
    expect(config.AI_API_KEY).toBeUndefined();
    expect(config.AI_JOB_ATTEMPTS).toBe(3);
    expect(config.AI_CONCURRENCY).toBe(1);
    expect(config.FETCH_MAX_REDIRECTS).toBe(5);
    expect(config.FETCH_MAX_RESPONSE_BYTES).toBe(5_000_000);
    expect(config.LOG_LEVEL).toBe('info');
  });

  it('requires an AI key in production when AI is enabled', () => {
    const production = { ...validWorkerEnv, NODE_ENV: 'production' };
    expect(() => loadWorkerConfig(production)).toThrow(/AI_API_KEY/);
    expect(() => loadWorkerConfig({ ...production, AI_API_KEY: 'sk-live' })).not.toThrow();
    expect(() =>
      loadWorkerConfig({ ...production, AI_ENABLED: 'false' }),
    ).not.toThrow();
  });

  it('parses explicit worker settings', () => {
    const config = loadWorkerConfig({
      ...validWorkerEnv,
      WORKER_QUEUE_NAME: 'seo',
      WORKER_CONCURRENCY: '3',
      WORKER_STALE_RUN_THRESHOLD_MS: '30000',
    });
    expect(config.WORKER_QUEUE_NAME).toBe('seo');
    expect(config.WORKER_CONCURRENCY).toBe(3);
    expect(config.WORKER_STALE_RUN_THRESHOLD_MS).toBe(30_000);
  });

  it('parses AI settings and the AI_ENABLED flag correctly', () => {
    const config = loadWorkerConfig({
      ...validWorkerEnv,
      AI_ENABLED: 'false',
      AI_PROVIDER: 'openai-compatible',
      AI_BASE_URL: 'http://localhost:9999/v1',
      AI_API_KEY: 'sk-local-test',
      AI_MODEL: 'gpt-4.1-mini',
      AI_MAX_FINDINGS: '10',
      AI_MAX_REPAIRS: '0',
    });
    expect(config.AI_ENABLED).toBe(false);
    expect(config.AI_BASE_URL).toBe('http://localhost:9999/v1');
    expect(config.AI_API_KEY).toBe('sk-local-test');
    expect(config.AI_MODEL).toBe('gpt-4.1-mini');
    expect(config.AI_MAX_FINDINGS).toBe(10);
    expect(config.AI_MAX_REPAIRS).toBe(0);
  });

  it('accepts the default provider without an API key', () => {
    expect(() => loadWorkerConfig(validWorkerEnv)).not.toThrow();
  });

  it('fails fast when DATABASE_URL is missing', () => {
    const missing: Record<string, string> = { ...validWorkerEnv };
    delete missing.DATABASE_URL;
    expect(() => loadWorkerConfig(missing)).toThrow(/DATABASE_URL/);
  });
});

describe('parseRedisUrl', () => {
  it('parses host, port and database', () => {
    expect(parseRedisUrl('redis://cache.internal:6380/2')).toEqual({
      host: 'cache.internal',
      port: 6380,
      db: 2,
    });
  });

  it('defaults the port when omitted', () => {
    expect(parseRedisUrl('redis://localhost')).toMatchObject({ host: 'localhost', port: 6379 });
  });

  it('extracts credentials and enables TLS for rediss', () => {
    const options = parseRedisUrl('rediss://user:secret@redis.example.com/0');
    expect(options.username).toBe('user');
    expect(options.password).toBe('secret');
    expect(options.tls).toEqual({});
  });

  it('rejects unsupported protocols', () => {
    expect(() => parseRedisUrl('http://localhost:6379')).toThrow(/Unsupported REDIS_URL protocol/);
  });
});

describe('redisConnectionOptions', () => {
  it('merges overrides with parsed values', () => {
    const options = redisConnectionOptions('redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    expect(options.host).toBe('localhost');
    expect(options.maxRetriesPerRequest).toBeNull();
  });
});