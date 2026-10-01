import { Inject, Injectable } from '@nestjs/common';
import { withTimeout } from '@analyzer/shared';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  /** Verifies Redis connectivity with a bounded PING round-trip. */
  async ping(timeoutMs = 3000): Promise<void> {
    const reply = await withTimeout(this.client.ping(), timeoutMs, 'Redis PING timed out');
    if (reply !== 'PONG') {
      throw new Error(`Unexpected Redis PING reply: ${String(reply)}`);
    }
  }
}