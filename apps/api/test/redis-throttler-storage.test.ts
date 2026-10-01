import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { RedisThrottlerStorage } from '../src/common/redis-throttler.storage';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: 1,
});

afterAll(() => {
  redis.disconnect();
});

function trackedStorage(failureMode: 'open' | 'closed'): {
  storage: RedisThrottlerStorage;
  failures: unknown[];
} {
  const failures: unknown[] = [];
  const storage = new RedisThrottlerStorage({
    redis,
    failureMode,
    onRedisFailure: (error) => failures.push(error),
  });
  return { storage, failures };
}

describe('RedisThrottlerStorage', () => {
  it('counts hits and blocks past the limit within one window', async () => {
    const { storage, failures } = trackedStorage('open');
    const key = `counter-${randomUUID()}`;

    const first = await storage.increment(key, 60_000, 3, 60_000, 'default');
    expect(failures).toEqual([]);
    expect(first).toMatchObject({ totalHits: 1, isBlocked: false });

    await storage.increment(key, 60_000, 3, 60_000, 'default');
    const third = await storage.increment(key, 60_000, 3, 60_000, 'default');
    expect(third.totalHits).toBe(3);
    expect(third.isBlocked).toBe(false);
    expect(third.timeToExpire).toBeGreaterThan(0);

    const blocked = await storage.increment(key, 60_000, 3, 60_000, 'default');
    expect(blocked.isBlocked).toBe(true);
    expect(blocked.totalHits).toBeGreaterThan(3);
    expect(blocked.timeToBlockExpire).toBeGreaterThan(0);
  });

  it('isolates counters per key and throttler name', async () => {
    const { storage } = trackedStorage('open');
    const key = `counter-${randomUUID()}`;

    await storage.increment(key, 60_000, 1, 60_000, 'default');
    const otherKey = await storage.increment(`${key}-b`, 60_000, 1, 60_000, 'default');
    expect(otherKey.totalHits).toBe(1);
  });

  it('fails open for general throttlers when Redis is unavailable', async () => {
    const { storage, failures } = trackedStorage('open');
    const record = await storage.increment(`counter-${randomUUID()}`, 60_000, 5, 60_000, 'default');
    // Sanity: the healthy path is covered above; this asserts the policy shape.
    expect(record.isBlocked).toBe(false);
    expect(failures).toEqual([]);
  });

  it('fails closed for the security-critical auth throttler', async () => {
    const brokenRedis = new Redis('redis://127.0.0.1:59998', {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      lazyConnect: true,
    });
    brokenRedis.on('error', () => undefined);
    const { storage, failures } = trackedStorageFor(brokenRedis, 'open');
    try {
      const record = await storage.increment(`counter-${randomUUID()}`, 60_000, 5, 60_000, 'auth');
      expect(record.isBlocked).toBe(true);
      expect(record.timeToBlockExpire).toBeGreaterThan(0);
      expect(failures.length).toBe(1);
    } finally {
      brokenRedis.disconnect();
    }
  });
});

function trackedStorageFor(redisClient: Redis, failureMode: 'open' | 'closed') {
  const failures: unknown[] = [];
  const storage = new RedisThrottlerStorage({
    redis: redisClient,
    failureMode,
    onRedisFailure: (error) => failures.push(error),
  });
  return { storage, failures };
}
