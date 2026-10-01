import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Queue, Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { redisConnectionOptions } from '@analyzer/config';
import { AI_JOB_NAME, ANALYSIS_JOB_NAME } from '@analyzer/contracts';
import { AnalysisExecutionService } from '../src/queue/analysis-execution.service';
import { AIExecutionService } from '../src/queue/ai-execution.service';
import { createAnalysisProcessor } from '../src/queue/analysis.processor';
import { createAIProcessor } from '../src/queue/ai.processor';
import { engineWithFixture, resetDatabase, seedAnalysisRun, seedWebsite, waitFor } from './helpers';
import { FakeAIProvider, aiGeneration, orchestratorWith, validInsightsContent } from './fake-ai-provider';

const TEST_QUEUE = 'analysis-worker-test';
const TEST_AI_QUEUE = 'ai-worker-test';

let aiQueue: Queue;
let aiWorker: Worker | undefined;

/**
 * End-to-end BullMQ round trip against real Redis: enqueue a job (as the API
 * does), let the worker processor consume it, and verify the persisted result.
 */
describe('BullMQ round trip', () => {
  let prisma: PrismaClient;
  let queue: Queue;
  let worker: Worker | undefined;

  beforeEach(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
    const connection = redisConnectionOptions(process.env.REDIS_URL as string, {
      maxRetriesPerRequest: null,
    });
    queue = new Queue(TEST_QUEUE, { connection });
    await queue.obliterate({ force: true });
    aiQueue = new Queue(TEST_AI_QUEUE, { connection });
    await aiQueue.obliterate({ force: true });
  });

  afterEach(async () => {
    await worker?.close();
    await aiWorker?.close();
    await aiQueue.close();
    await queue.close();
    await prisma.$disconnect();
  });

  it('processes a job through Redis with real BullMQ machinery', async () => {
    const { websiteId } = await seedWebsite(prisma);
    const { analysisId, runId } = await seedAnalysisRun(prisma, websiteId);

    const service = new AnalysisExecutionService(prisma, engineWithFixture());
    worker = new Worker(TEST_QUEUE, createAnalysisProcessor(service), {
      connection: redisConnectionOptions(process.env.REDIS_URL as string, {
        maxRetriesPerRequest: null,
      }),
      concurrency: 1,
    });

    await queue.add(ANALYSIS_JOB_NAME, { analysisId, runId }, { jobId: runId });

    await waitFor(async () => {
      const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
      return run?.status === 'COMPLETED';
    });

    const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('COMPLETED');
    expect(await prisma.analysisFinding.count({ where: { analysisRunId: runId } })).toBeGreaterThan(0);
    expect(await prisma.analysisScore.count({ where: { analysisRunId: runId } })).toBe(6);
  });

  it('re-delivering the same job id does not create a second job', async () => {
    const { websiteId } = await seedWebsite(prisma);
    const { analysisId, runId } = await seedAnalysisRun(prisma, websiteId);

    await queue.add(ANALYSIS_JOB_NAME, { analysisId, runId }, { jobId: runId });
    // Same deterministic jobId → BullMQ deduplicates.
    await queue.add(ANALYSIS_JOB_NAME, { analysisId, runId }, { jobId: runId });

    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed');
    expect(counts.waiting + counts.active + counts.completed + counts.failed).toBe(1);
  });

  it('runs the full pipeline through Redis: analysis → ai.enrich → persisted AI result', async () => {
    const { websiteId } = await seedWebsite(prisma);
    const { analysisId, runId } = await seedAnalysisRun(prisma, websiteId);

    const AI_CONFIG = {
      AI_ENABLED: true,
      AI_API_KEY: 'test-key',
      AI_JOB_ATTEMPTS: 3,
      AI_JOB_BACKOFF_DELAY_MS: 100,
    } as never;
    const provider = new FakeAIProvider();
    provider.enqueueResponse(aiGeneration(validInsightsContent()));

    const connection = redisConnectionOptions(process.env.REDIS_URL as string, {
      maxRetriesPerRequest: null,
    });
    const analysisService = new AnalysisExecutionService(
      prisma,
      engineWithFixture(),
      AI_CONFIG,
      aiQueue,
    );
    const aiService = new AIExecutionService(prisma, orchestratorWith(provider), AI_CONFIG);
    worker = new Worker(TEST_QUEUE, createAnalysisProcessor(analysisService), {
      connection,
      concurrency: 1,
    });
    aiWorker = new Worker(TEST_AI_QUEUE, createAIProcessor(aiService), {
      connection,
      concurrency: 1,
    });

    await queue.add(ANALYSIS_JOB_NAME, { analysisId, runId }, { jobId: runId });

    await waitFor(async () => {
      const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
      return run?.status === 'COMPLETED';
    });
    await waitFor(async () => {
      const aiResult = await prisma.aiAnalysisResult.findUnique({ where: { analysisRunId: runId } });
      return aiResult?.status === 'COMPLETED';
    });

    const aiResult = await prisma.aiAnalysisResult.findUnique({ where: { analysisRunId: runId } });
    expect(aiResult?.status).toBe('COMPLETED');
    expect(aiResult?.totalTokens).toBe(360);
    expect(aiResult?.model).toBe('fake-model');
    expect((aiResult?.summary as { headline: string })?.headline).toBe('Worker fixture insights');

    // The AI job carried only identity references.
    const aiJob = await aiQueue.getJob(aiResult?.id as string);
    expect(aiJob?.name).toBe(AI_JOB_NAME);
    expect(aiJob?.data).toEqual({
      analysisId,
      runId,
      aiResultId: aiResult?.id,
    });
  });
});