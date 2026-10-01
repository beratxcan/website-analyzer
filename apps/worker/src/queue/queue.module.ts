import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { AnalysisEngine, WebsiteFetcher } from '@analyzer/analysis';
import { AIOrchestrator, OpenAICompatibleProvider } from '@analyzer/ai';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/config.constants';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { RedisModule } from '../redis/redis.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ANALYSIS_QUEUE, ANALYSIS_QUEUE_NAME, ANALYSIS_WORKER } from './analysis-queue.constants';
import { AI_QUEUE, AI_QUEUE_NAME, AI_WORKER } from './ai-queue.constants';
import { createAnalysisProcessor } from './analysis.processor';
import { createAIProcessor } from './ai.processor';
import { AnalysisExecutionService } from './analysis-execution.service';
import { AIExecutionService } from './ai-execution.service';
import { StaleRunRecoveryService } from './stale-run-recovery.service';

@Module({
  imports: [RedisModule, PrismaModule],
  providers: [
    StaleRunRecoveryService,
    {
      provide: AnalysisEngine,
      // Fetch limits are validated configuration, never hardcoded: the
      // SSRF-critical timeouts, redirect cap and response size all come from
      // the environment (see FETCH_* in @analyzer/config).
      useFactory: (config: AppConfig) =>
        new AnalysisEngine({
          fetcher: new WebsiteFetcher({
            connectionTimeoutMs: config.FETCH_CONNECTION_TIMEOUT_MS,
            totalTimeoutMs: config.FETCH_TOTAL_TIMEOUT_MS,
            maxRedirects: config.FETCH_MAX_REDIRECTS,
            maxResponseSizeBytes: config.FETCH_MAX_RESPONSE_BYTES,
          }),
        }),
      inject: [APP_CONFIG],
    },
    {
      provide: AIOrchestrator,
      useFactory: (config: AppConfig): AIOrchestrator =>
        new AIOrchestrator({
          provider: new OpenAICompatibleProvider({
            baseUrl: config.AI_BASE_URL,
            apiKey: config.AI_API_KEY ?? '',
            model: config.AI_MODEL,
            timeoutMs: config.AI_TIMEOUT_MS,
            maxOutputTokens: config.AI_MAX_OUTPUT_TOKENS,
          }),
          model: config.AI_MODEL,
          maxFindings: config.AI_MAX_FINDINGS,
          maxRecommendations: config.AI_MAX_RECOMMENDATIONS,
          maxRepairs: config.AI_MAX_REPAIRS,
        }),
      inject: [APP_CONFIG],
    },
    {
      provide: AnalysisExecutionService,
      useFactory: (config: AppConfig, prisma: PrismaService, engine: AnalysisEngine, aiQueue: Queue) =>
        new AnalysisExecutionService(prisma, engine, config, aiQueue),
      inject: [APP_CONFIG, PrismaService, AnalysisEngine, AI_QUEUE],
    },
    {
      provide: AIExecutionService,
      useFactory: (config: AppConfig, prisma: PrismaService, orchestrator: AIOrchestrator) =>
        new AIExecutionService(prisma, orchestrator, config),
      inject: [APP_CONFIG, PrismaService, AIOrchestrator],
    },
    {
      provide: ANALYSIS_QUEUE,
      useFactory: (redis: Redis): Queue => new Queue(ANALYSIS_QUEUE_NAME, { connection: redis }),
      inject: [REDIS_CLIENT],
    },
    {
      provide: AI_QUEUE,
      useFactory: (redis: Redis): Queue => new Queue(AI_QUEUE_NAME, { connection: redis }),
      inject: [REDIS_CLIENT],
    },
    {
      provide: ANALYSIS_WORKER,
      useFactory: (config: AppConfig, redis: Redis, execution: AnalysisExecutionService): Worker =>
        new Worker(ANALYSIS_QUEUE_NAME, createAnalysisProcessor(execution), {
          connection: redis,
          concurrency: config.WORKER_CONCURRENCY,
        }),
      inject: [APP_CONFIG, REDIS_CLIENT, AnalysisExecutionService],
    },
    {
      provide: AI_WORKER,
      useFactory: (config: AppConfig, redis: Redis, execution: AIExecutionService): Worker =>
        new Worker(AI_QUEUE_NAME, createAIProcessor(execution), {
          connection: redis,
          // AI jobs are I/O-bound (provider calls) and independent of the
          // CPU-bound analysis workers, so they scale separately.
          concurrency: config.AI_CONCURRENCY,
        }),
      inject: [APP_CONFIG, REDIS_CLIENT, AIExecutionService],
    },
  ],
  exports: [
    ANALYSIS_QUEUE,
    ANALYSIS_WORKER,
    AI_QUEUE,
    AI_WORKER,
    AnalysisExecutionService,
    AIExecutionService,
  ],
})
export class QueueModule implements OnModuleDestroy {
  constructor(
    @Inject(ANALYSIS_QUEUE) private readonly analysisQueue: Queue,
    @Inject(AI_QUEUE) private readonly aiQueue: Queue,
    @Inject(ANALYSIS_WORKER) private readonly analysisWorker: Worker,
    @Inject(AI_WORKER) private readonly aiWorker: Worker,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.aiWorker.close();
    await this.analysisWorker.close();
    await this.aiQueue.close();
    await this.analysisQueue.close();
  }
}