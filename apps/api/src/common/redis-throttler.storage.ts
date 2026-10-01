import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { FAIL_CLOSED_THROTTLERS } from './rate-limit.constants';

/** Shape of `ThrottlerStorageRecord` (not re-exported by the package root). */
interface ThrottlerRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Fixed-window counter with an explicit block window, executed atomically in
 * Redis so multiple API instances share one budget.
 *
 * State lives in two keys per counter:
 * - `<prefix><key>`  — the hit counter for the current window (TTL = window)
 * - `<prefix><key>:b` — the block marker set once the limit is exceeded
 *
 * Failure semantics are explicit: security-critical throttlers fail closed
 * (reject), everything else fails open (allow) so a Redis outage cannot take
 * the whole API down. Both paths log, and Redis itself is used with
 * `enableOfflineQueue: false` so a down Redis fails fast instead of hanging.
 */
const INCREMENT_SCRIPT = `
local counterKey = KEYS[1]
local blockKey = KEYS[2]
local windowMs = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockMs = tonumber(ARGV[3])

local blockTtl = redis.call('PTTL', blockKey)
if blockTtl > 0 then
  local blockSeconds = math.ceil(blockTtl / 1000)
  return { limit + 1, blockSeconds, 1, blockSeconds }
end

local hits = redis.call('INCR', counterKey)
if hits == 1 then
  redis.call('PEXPIRE', counterKey, windowMs)
end

local windowTtl = redis.call('PTTL', counterKey)
if windowTtl < 0 then
  redis.call('PEXPIRE', counterKey, windowMs)
  windowTtl = windowMs
end

if hits > limit then
  redis.call('SET', blockKey, '1', 'PX', blockMs)
  local blockSeconds = math.ceil(blockMs / 1000)
  return { hits, blockSeconds, 1, blockSeconds }
end

return { hits, math.ceil(windowTtl / 1000), 0, 0 }
`;

/** Keys are hashed by the guard; this only namespaces inside Redis. */
const KEY_PREFIX = 'rl:';
/** Upper bound on a single Redis round-trip before the failure policy applies. */
const REDIS_TIMEOUT_MS = 1_000;

export interface RedisThrottlerStorageOptions {
  redis: Redis;
  keyPrefix?: string;
  /** Behavior for non-security-critical throttlers when Redis is unavailable. */
  failureMode: 'open' | 'closed';
  /**
   * Logs a single line the first time Redis fails, then stays quiet until a
   * successful call resets the flag — a Redis outage must not flood the logs.
   */
  onRedisFailure?: (error: unknown, failClosed: boolean) => void;
}

export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly redis: Redis;
  private readonly keyPrefix: string;
  private readonly failureMode: 'open' | 'closed';
  private readonly onRedisFailure: ((error: unknown, failClosed: boolean) => void) | undefined;
  private reportedFailure = false;

  constructor(options: RedisThrottlerStorageOptions) {
    this.redis = options.redis;
    this.keyPrefix = options.keyPrefix ?? KEY_PREFIX;
    this.failureMode = options.failureMode;
    this.onRedisFailure = options.onRedisFailure;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerRecord> {
    const failClosed = FAIL_CLOSED_THROTTLERS.has(throttlerName) || this.failureMode === 'closed';
    try {
      const raw = (await this.withTimeout(
        this.redis.eval(
          INCREMENT_SCRIPT,
          2,
          `${this.keyPrefix}${key}`,
          `${this.keyPrefix}${key}:block`,
          ttl,
          limit,
          blockDuration,
        ),
      )) as [number, number, number, number];

      this.reportedFailure = false;
      const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] = raw;
      return {
        totalHits: Number(totalHits),
        timeToExpire: Number(timeToExpire),
        isBlocked: Number(isBlocked) === 1,
        timeToBlockExpire: Number(timeToBlockExpire),
      };
    } catch (error) {
      if (!this.reportedFailure) {
        this.reportedFailure = true;
        this.onRedisFailure?.(error, failClosed);
      }
      return this.failureRecord(ttl, limit, blockDuration, failClosed);
    }
  }

  private withTimeout<T>(operation: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Redis rate-limit operation exceeded ${REDIS_TIMEOUT_MS}ms`)),
        REDIS_TIMEOUT_MS,
      );
      operation.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }

  private failureRecord(
    ttl: number,
    limit: number,
    blockDuration: number,
    failClosed: boolean,
  ): ThrottlerRecord {
    const windowSeconds = Math.max(1, Math.ceil(ttl / 1000));
    const blockSeconds = Math.max(1, Math.ceil(blockDuration / 1000));
    if (failClosed) {
      return {
        totalHits: limit + 1,
        timeToExpire: windowSeconds,
        isBlocked: true,
        timeToBlockExpire: blockSeconds,
      };
    }
    // Fail open: report the request as the first hit of a fresh window.
    return { totalHits: 1, timeToExpire: windowSeconds, isBlocked: false, timeToBlockExpire: 0 };
  }
}
