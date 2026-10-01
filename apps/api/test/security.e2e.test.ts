import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { extractCookie, makeUser, registerAgent, type TestAgent } from './helpers/auth';
import { resetDatabase } from './helpers/db';

/**
 * Deletes every rate-limit counter so each suite starts from a clean budget.
 * The low-limit app below uses its own key namespace, so exhausting its budget
 * can never bleed into other suites sharing the same Redis.
 */
async function flushRateLimitKeys(prefix = 'rl:'): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
  });
  try {
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } finally {
    redis.disconnect();
  }
}

describe('security hardening (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userA: TestAgent;
  let accessCookie: string;
  let websiteId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    await flushRateLimitKeys();
    ({ agent: userA } = await registerAgent(app, makeUser(0)));
    // Raw session cookie, reused against the second (rate-limited) app below.
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(makeUser(0))
      .expect(200);
    accessCookie = extractCookie(login.headers['set-cookie'] as unknown as string[], 'access_token');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('security headers', () => {
    it('hardens responses and never advertises the framework', async () => {
      const res = await request(app.getHttpServer()).get('/health/live').expect(200);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['permissions-policy']).toContain('geolocation=()');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-request-id']).toEqual(expect.any(String));
    });

    it('does not advertise HSTS outside production', async () => {
      const res = await request(app.getHttpServer()).get('/health/live').expect(200);
      expect(res.headers['strict-transport-security']).toBeUndefined();
    });
  });

  describe('liveness and readiness', () => {
    it('reports liveness without touching dependencies', async () => {
      const res = await request(app.getHttpServer()).get('/health/live').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', service: 'api' });
      expect(res.body.checks).toBeUndefined();
    });

    it('reports readiness with dependency state', async () => {
      const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.checks.database.status).toBe('up');
      expect(res.body.checks.redis.status).toBe('up');
    });
  });

  describe('CSRF origin check', () => {
    it('rejects state-changing requests from a foreign origin', async () => {
      const res = await userA
        .post('/api/v1/projects')
        .set('Origin', 'https://evil.example')
        .send({ name: 'Blocked' })
        .expect(403);
      expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('rejects the opaque "null" origin', async () => {
      const res = await userA
        .post('/api/v1/projects')
        .set('Origin', 'null')
        .send({ name: 'Blocked' })
        .expect(403);
      expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('accepts state-changing requests from the configured web origin', async () => {
      const res = await userA
        .post('/api/v1/projects')
        .set('Origin', 'http://localhost:3000')
        .send({ name: 'Allowed Origin' })
        .expect(201);
      expect(res.body.name).toBe('Allowed Origin');
    });

    it('falls back to Referer and rejects a foreign one', async () => {
      const res = await userA
        .post('/api/v1/projects')
        .set('Referer', 'https://evil.example/attack')
        .send({ name: 'Blocked Referer' })
        .expect(403);
      expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('does not restrict safe methods', async () => {
      await userA.get('/api/v1/projects').set('Origin', 'https://evil.example').expect(200);
    });
  });

  describe('input validation', () => {
    it('rejects unknown properties with a deterministic envelope', async () => {
      const res = await userA
        .post('/api/v1/projects')
        .send({ name: 'Sneaky', unexpected: true })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.requestId).toEqual(expect.any(String));
      expect(Array.isArray(res.body.error.details.fields)).toBe(true);
    });

    it('rejects unsupported query parameters on the findings explorer', async () => {
      const project = await userA.post('/api/v1/projects').send({ name: 'Validation' }).expect(201);
      const website = await userA
        .post(`/api/v1/projects/${project.body.id}/websites`)
        .send({ name: 'Example', url: 'https://example.com' })
        .expect(201);
      websiteId = website.body.id as string;
      const analysis = await userA
        .post('/api/v1/analyses')
        .send({ websiteId })
        .expect(201);

      const res = await userA
        .get(`/api/v1/analyses/${analysis.body.analysis.id}/findings`)
        .query({ page: '1', limit: '20', notAThing: 'x' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('rate limiting', () => {
    let limitedApp: INestApplication;
    let previous: Record<string, string | undefined>;

    beforeAll(async () => {
      previous = {
        THROTTLE_LIMIT: process.env.THROTTLE_LIMIT,
        THROTTLE_TTL: process.env.THROTTLE_TTL,
        THROTTLE_AUTH_LIMIT: process.env.THROTTLE_AUTH_LIMIT,
        THROTTLE_AUTH_TTL: process.env.THROTTLE_AUTH_TTL,
        THROTTLE_ANALYSIS_LIMIT: process.env.THROTTLE_ANALYSIS_LIMIT,
        THROTTLE_ANALYSIS_TTL: process.env.THROTTLE_ANALYSIS_TTL,
        RATE_LIMIT_KEY_PREFIX: process.env.RATE_LIMIT_KEY_PREFIX,
      };
      // Isolated namespace: the tiny budgets below must not leak into the
      // other suites that share this Redis instance.
      process.env.RATE_LIMIT_KEY_PREFIX = 'rl-security-test:';
      process.env.THROTTLE_LIMIT = '3';
      process.env.THROTTLE_TTL = '60000';
      process.env.THROTTLE_AUTH_LIMIT = '2';
      process.env.THROTTLE_AUTH_TTL = '60000';
      process.env.THROTTLE_ANALYSIS_LIMIT = '1';
      process.env.THROTTLE_ANALYSIS_TTL = '60000';
      await flushRateLimitKeys('rl-security-test:');
      limitedApp = await createTestApp();
    });

    afterAll(async () => {
      await limitedApp.close();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      await flushRateLimitKeys('rl-security-test:');
    });

    it('returns 429 with Retry-After once the general budget is spent', async () => {
      const server = limitedApp.getHttpServer();
      const call = (): request.Test =>
        request(server).get('/api/v1/projects').set('Cookie', `access_token=${accessCookie}`);

      await call().expect(200);
      await call().expect(200);
      const last = await call().expect(200);
      expect(Number(last.headers['x-ratelimit-limit'])).toBe(3);
      expect(Number(last.headers['x-ratelimit-remaining'])).toBe(0);

      // The budget is shared per category (not per route), so the next call is
      // refused even though this route was not the one that exhausted it.
      const blocked = await call().expect(429);
      expect(blocked.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('shares one strict budget across the authentication endpoints', async () => {
      const server = limitedApp.getHttpServer();
      const fresh = { email: 'throttle@example.com', password: 'correct-horse-battery-staple' };

      await request(server).post('/api/v1/auth/register').send(fresh).expect(201);
      await request(server).post('/api/v1/auth/login').send(fresh).expect(200);

      const blocked = await request(server).post('/api/v1/auth/login').send(fresh).expect(429);
      expect(blocked.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('caps analysis creation on its own dedicated budget (AI cost abuse)', async () => {
      const server = limitedApp.getHttpServer();
      const create = (): request.Test =>
        request(server)
          .post('/api/v1/analyses')
          .set('Cookie', `access_token=${accessCookie}`)
          .send({ websiteId });

      // The general budget (limit 3) is already spent in this app, so a first
      // successful creation proves the dedicated analysis budget applies.
      await create().expect(201);

      const blocked = await create().expect(429);
      expect(blocked.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('never throttles health probes', async () => {
      const server = limitedApp.getHttpServer();
      for (let i = 0; i < 5; i += 1) {
        await request(server).get('/health/live').expect(200);
      }
    });
  });
});
