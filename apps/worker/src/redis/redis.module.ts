import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { redisConnectionOptions } from '@analyzer/config';
import { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/config.constants';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: AppConfig): Redis => {
        const client = new Redis(
          redisConnectionOptions(config.REDIS_URL, {
            // BullMQ manages its own retry semantics; without this flag
            // ioredis rejects commands while the queue reconnects.
            maxRetriesPerRequest: null,
          }),
        );
        client.on('error', () => undefined);
        return client;
      },
      inject: [APP_CONFIG],
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}