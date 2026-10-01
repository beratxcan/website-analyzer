import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadEnvFile, loadWorkerConfig } from '@analyzer/config';
import { logLevelsFor } from '@analyzer/shared';
import { AppModule } from './app.module';
import { ANALYSIS_QUEUE_NAME } from './queue/analysis-queue.constants';
import { RedisService } from './redis/redis.service';
import { PrismaService } from './prisma/prisma.service';
import { StaleRunRecoveryService } from './queue/stale-run-recovery.service';

const logger = new Logger('Worker');

async function bootstrap(): Promise<void> {
  loadEnvFile();
  const config = loadWorkerConfig();

  // Application context only — the worker exposes no HTTP endpoints; health
  // is reported through logs (liveness) and the DB/Redis connectivity checks
  // that gate startup (readiness).
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: logLevelsFor(config.LOG_LEVEL),
  });
  app.enableShutdownHooks();

  // Fail fast when Redis or PostgreSQL is unreachable.
  await app.get(RedisService).ping();
  await app.get(PrismaService).$executeRaw`SELECT 1`;

  // Recover runs stuck in `running` from previous crashes before consuming.
  await app.get(StaleRunRecoveryService).recover();

  logger.log(
    `Ready — listening on queues "${ANALYSIS_QUEUE_NAME}" and "ai" with concurrency ${config.WORKER_CONCURRENCY}.`,
  );
  logger.log(
    `Analysis jobs will be executed with up to ${config.WORKER_CONCURRENCY} worker(s); stale runs recover after ${config.WORKER_STALE_RUN_THRESHOLD_MS}ms.`,
  );
  logger.log(
    `AI jobs will be executed with up to ${config.AI_CONCURRENCY} worker(s); fetch limits: connect=${config.FETCH_CONNECTION_TIMEOUT_MS}ms total=${config.FETCH_TOTAL_TIMEOUT_MS}ms redirects=${config.FETCH_MAX_REDIRECTS} maxBytes=${config.FETCH_MAX_RESPONSE_BYTES}.`,
  );
  logger.log(
    `AI enrichment ${config.AI_ENABLED ? 'enabled' : 'disabled'} — provider=${config.AI_PROVIDER} model=${config.AI_MODEL}` +
      (config.AI_API_KEY ? '' : ' (no API key configured; AI jobs will fail fast as AI_CONFIG_INVALID)'),
  );
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : String(error), undefined, 'Worker');
  process.exit(1);
});