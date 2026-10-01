import { Inject, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { redisConnectionOptions } from '@analyzer/config';
import { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/config.constants';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** How long startup waits for Redis before accepting traffic anyway. */
const READY_TIMEOUT_MS = 3_000;

@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: AppConfig): Redis => {
        const client = new Redis(
          redisConnectionOptions(config.REDIS_URL, {
            // Health checks and rate-limit counters must not queue commands
            // while disconnected, or a PING would silently wait for a reconnect.
            enableOfflineQueue: false,
            connectTimeout: 2000,
          }),
        );
        client.on('error', () => undefined);
        return client;
      },
      inject: [APP_CONFIG],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Redis');

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  /**
   * ioredis connects asynchronously. Without this wait the first requests could
   * reach the rate limiter before the connection is usable — turning the
   * security-critical limiter into a fail-closed 429 and the general limiter
   * into a no-op. Startup therefore waits (bounded) for `ready`; a Redis that
   * never comes up degrades readiness instead of hanging the process.
   */
  async onModuleInit(): Promise<void> {
    if (this.client.status === 'ready') {
      return;
    }
    const ready = await this.waitForReady();
    if (!ready) {
      this.logger.warn(
        `Redis not ready after ${READY_TIMEOUT_MS}ms (status=${this.client.status}); readiness will report degraded`,
      );
    }
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }

  private waitForReady(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const onReady = (): void => {
        clearTimeout(timer);
        this.client.off('ready', onReady);
        resolve(true);
      };
      const timer = setTimeout(() => {
        this.client.off('ready', onReady);
        resolve(false);
      }, READY_TIMEOUT_MS);
      this.client.once('ready', onReady);
    });
  }
}
