import type { RedisOptions } from 'ioredis';

/**
 * Parses a `redis://` or `rediss://` URL into ioredis connection options.
 * Throws when the URL is malformed or uses an unsupported protocol.
 */
export function parseRedisUrl(url: string): RedisOptions {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid REDIS_URL: "${url}"`);
  }

  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error(`Unsupported REDIS_URL protocol: "${parsed.protocol}" (expected redis: or rediss:)`);
  }

  const port = parsed.port === '' ? Number.NaN : Number(parsed.port);
  const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined;
  if (parsed.pathname.length > 1 && (Number.isNaN(db) || !Number.isInteger(db) || (db ?? 0) < 0)) {
    throw new Error(`Invalid Redis database index in REDIS_URL: "${parsed.pathname}"`);
  }

  return {
    host: parsed.hostname,
    port: Number.isNaN(port) ? 6379 : port,
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(db !== undefined ? { db } : {}),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

/**
 * Builds ioredis connection options from a REDIS_URL, merged with any
 * application-specific overrides (e.g. `enableOfflineQueue` or
 * `maxRetriesPerRequest`).
 */
export function redisConnectionOptions(url: string, overrides: RedisOptions = {}): RedisOptions {
  return { ...parseRedisUrl(url), ...overrides };
}