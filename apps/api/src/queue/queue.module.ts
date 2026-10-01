import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { redisConnectionOptions } from '@analyzer/config';
import { ANALYSIS_QUEUE_NAME } from '@analyzer/contracts';
import { APP_CONFIG, type AppConfig } from '../config/config.constants';
import { ANALYSIS_QUEUE } from './queue.constants';

/**
 * Provides the analysis BullMQ queue to the API. Jobs carry only
 * (`analysisId`, `runId`) references; the database remains the source of
 * truth for analysis state.
 */
@Module({
  providers: [
    {
      provide: ANALYSIS_QUEUE,
      useFactory: (config: AppConfig): Queue =>
        new Queue(ANALYSIS_QUEUE_NAME, {
          connection: redisConnectionOptions(config.REDIS_URL, {
            maxRetriesPerRequest: null,
          }),
        }),
      inject: [APP_CONFIG],
    },
  ],
  exports: [ANALYSIS_QUEUE],
})
export class QueueModule implements OnModuleDestroy {
  constructor(@Inject(ANALYSIS_QUEUE) private readonly queue: Queue) {}

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}