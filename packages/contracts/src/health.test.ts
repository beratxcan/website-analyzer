import { describe, expect, it } from 'vitest';
import type { HealthCheckResponse } from './health';

describe('health contract', () => {
  it('describes the response shape returned by GET /health', () => {
    const response: HealthCheckResponse = {
      status: 'ok',
      service: 'api',
      version: '0.1.0',
      uptimeSeconds: 42,
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: 'up', latencyMs: 4 },
        redis: { status: 'up', latencyMs: 2 },
      },
    };

    expect(Object.keys(response)).toEqual([
      'status',
      'service',
      'version',
      'uptimeSeconds',
      'timestamp',
      'checks',
    ]);
    expect(response.status).toBe('ok');
    expect(response.checks.database?.status).toBe('up');
  });
});