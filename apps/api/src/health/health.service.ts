import { Inject, Injectable } from '@nestjs/common';
import type { HealthCheckResponse, HealthComponentCheck, LivenessResponse } from '@analyzer/contracts';
import { isRecord, withTimeout } from '@analyzer/shared';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { REDIS_CLIENT } from '../redis/redis.module';
import { APP_VERSION } from '../version';

const CHECK_TIMEOUT_MS = 3000;

function errorIdentifier(error: unknown): string {
  if (isRecord(error) && typeof error.code === 'string') {
    return error.code;
  }
  return error instanceof Error ? error.name : 'UnknownError';
}

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Liveness: the process is up and serving. Deliberately does not touch
   * PostgreSQL or Redis — a dependency outage must not fail liveness and
   * trigger a restart loop.
   */
  liveness(): LivenessResponse {
    return {
      status: 'ok',
      service: 'api',
      version: APP_VERSION,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Returns application liveness plus per-component connectivity. Always
   * responds (HTTP 200) so orchestration can distinguish "API down" from
   * "API up but a dependency is degraded"; the body carries the details.
   */
  async check(): Promise<HealthCheckResponse> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    return {
      status: database.status === 'up' && redis.status === 'up' ? 'ok' : 'degraded',
      service: 'api',
      version: APP_VERSION,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
      checks: { database, redis },
    };
  }

  private async checkDatabase(): Promise<HealthComponentCheck> {
    const startedAt = performance.now();
    try {
      await withTimeout(this.pool.query('SELECT 1'), CHECK_TIMEOUT_MS);
      return { status: 'up', latencyMs: Math.round(performance.now() - startedAt) };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Math.round(performance.now() - startedAt),
        error: errorIdentifier(error),
      };
    }
  }

  private async checkRedis(): Promise<HealthComponentCheck> {
    const startedAt = performance.now();
    try {
      await withTimeout(this.redis.ping(), CHECK_TIMEOUT_MS);
      return { status: 'up', latencyMs: Math.round(performance.now() - startedAt) };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Math.round(performance.now() - startedAt),
        error: errorIdentifier(error),
      };
    }
  }
}