process.env.NODE_ENV = 'test';
// Unreachable endpoints: health must respond (degraded) without them.
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:59999/test';
process.env.REDIS_URL = 'redis://127.0.0.1:59998';
process.env.API_PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-change-me-please';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-change-me-please';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigModule } from '../config/config.module';
import { HealthModule } from './health.module';

describe('HealthController', () => {
  let app: INestApplication | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule, HealthModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health returns 200 with component checks', async () => {
    const response = await request(app!.getHttpServer()).get('/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'degraded',
      service: 'api',
      checks: {
        database: { status: 'down' },
        redis: { status: 'down' },
      },
    });
    expect(response.body.version).toEqual(expect.any(String));
    expect(response.body.timestamp).toEqual(expect.any(String));
    expect(response.body.uptimeSeconds).toEqual(expect.any(Number));
  });
});