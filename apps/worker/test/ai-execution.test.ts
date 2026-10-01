import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { AIProviderError } from '@analyzer/ai';
import { AI_JOB_NAME, type AIJobPayload } from '@analyzer/contracts';
import { AIExecutionService } from '../src/queue/ai-execution.service';
import { AnalysisExecutionService } from '../src/queue/analysis-execution.service';
import { engineWithFixture, makeJob, resetDatabase, seedAnalysisRun, seedWebsite } from './helpers';
import {
  FakeAIProvider,
  aiGeneration,
  orchestratorWith,
  validInsightsContent,
} from './fake-ai-provider';

const AI_CONFIG = {
  AI_ENABLED: true,
  AI_API_KEY: 'test-key',
  AI_JOB_ATTEMPTS: 3,
  AI_JOB_BACKOFF_DELAY_MS: 100,
} as never;

function makeAIJob(
  data: Partial<AIJobPayload>,
  options: { attempts?: number; attemptsMade?: number } = {},
): Parameters<AIExecutionService['execute']>[0] {
  return {
    id: 'ai-test-job',
    data: { analysisId: 'analysis', runId: 'run', aiResultId: 'ai-result', ...data },
    attemptsMade: options.attemptsMade ?? 0,
    opts: { attempts: options.attempts ?? 3 },
  } as never;
}

async function seedCompletedRun(
  prisma: PrismaClient,
  runStatus: 'COMPLETED' | 'PARTIALLY_COMPLETED' = 'COMPLETED',
  includePerformance = true,
): Promise<{ analysisId: string; runId: string; aiResultId: string }> {
  const { websiteId } = await seedWebsite(prisma);
  const { analysisId, runId } = await seedAnalysisRun(prisma, websiteId, {
    status: runStatus,
    attempt: 1,
    progress: 100,
    startedAt: new Date(),
    completedAt: new Date(),
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
  });
  await prisma.analysis.update({ where: { id: analysisId }, data: { status: 'COMPLETED', latestRunId: runId } });
  await prisma.analysisFinding.create({
    data: {
      analysisRunId: runId,
      ruleCode: 'SEO_META_DESCRIPTION_MISSING',
      category: 'seo',
      severity: 'high',
      title: 'Meta description is missing',
      description: 'The page has no meta description.',
      scoreImpact: 10,
      evidence: [
        { type: 'html_missing', selector: 'head > meta[name="description"]', source: 'document' },
      ],
    },
  });
  const categories: Array<[string, number]> = [
    ['seo', 80],
    ['technical', 90],
    ['content', 85],
    ['accessibility', 95],
  ];
  if (includePerformance) {
    categories.push(['performance', 90]);
  }
  await prisma.analysisScore.createMany({
    data: [
      ...categories.map(([category, score]) => ({
        analysisRunId: runId,
        category,
        score,
        weight: 0.2,
      })),
      { analysisRunId: runId, category: 'overall', score: 87, weight: null },
    ],
  });
  const aiResult = await prisma.aiAnalysisResult.create({
    data: { analysisRunId: runId, task: 'analysis_insights', status: 'PENDING' },
  });
  return { analysisId, runId, aiResultId: aiResult.id };
}

describe('AIExecutionService', () => {
  let prisma: PrismaClient;

  beforeEach(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  it('runs the full AI flow: context → provider → validated persistence', async () => {
    const { analysisId, runId, aiResultId } = await seedCompletedRun(prisma);
    const provider = new FakeAIProvider();
    provider.enqueueResponse(aiGeneration(validInsightsContent()));
    const service = new AIExecutionService(prisma, orchestratorWith(provider), AI_CONFIG);

    await service.execute(makeAIJob({ analysisId, runId, aiResultId }));

    const result = await prisma.aiAnalysisResult.findUnique({ where: { id: aiResultId } });
    expect(result?.status).toBe('COMPLETED');
    expect(result?.provider).toBe('fake');
    expect(result?.model).toBe('fake-model');
    expect(result?.promptVersion).toBe('1.0.0');
    expect(result?.schemaVersion).toBe('1.0.0');
    expect(result?.inputTokens).toBe(120);
    expect(result?.outputTokens).toBe(240);
    expect(result?.totalTokens).toBe(360);
    expect(result?.latencyMs).toBe(55);
    expect(result?.errorCode).toBeNull();
    const summary = result?.summary as { headline: string };
    expect(summary.headline).toBe('Worker fixture insights');
    const recommendations = result?.recommendations as Array<{ relatedFindingCodes: string[] }>;
    expect(recommendations[0]?.relatedFindingCodes).toEqual(['SEO_META_DESCRIPTION_MISSING']);

    // The deterministic run is untouched and still completed.
    const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('COMPLETED');
    expect(provider.calls).toHaveLength(1);
    // The prompt never carries identity or raw site content.
    expect(provider.calls[0]?.userPrompt).toContain('SEO_META_DESCRIPTION_MISSING');
    expect(provider.calls[0]?.userPrompt).not.toContain('userId');
  });

  it('is idempotent: a duplicate delivery of a completed AI result is a no-op', async () => {
    const { analysisId, runId, aiResultId } = await seedCompletedRun(prisma);
    const provider = new FakeAIProvider();
    provider.enqueueResponse(aiGeneration(validInsightsContent()));
    const service = new AIExecutionService(prisma, orchestratorWith(provider), AI_CONFIG);

    await service.execute(makeAIJob({ analysisId, runId, aiResultId }));
    await service.execute(makeAIJob({ analysisId, runId, aiResultId }));

    expect(provider.calls).toHaveLength(1);
    const result = await prisma.aiAnalysisResult.findUnique({ where: { id: aiResultId } });
    expect(result?.status).toBe('COMPLETED');
  });

  it('retries retryable provider failures (result back to PENDING, error rethrown)', async () => {
    const { analysisId, runId, aiResultId } = await seedCompletedRun(prisma);
    const provider = new FakeAIProvider();
    provider.enqueueError(new AIProviderError('AI_TIMEOUT', 'provider timed out', true));
    const service = new AIExecutionService(prisma, orchestratorWith(provider), AI_CONFIG);

    await expect(service.execute(makeAIJob({ analysisId, runId, aiResultId }))).rejects.toThrow(
      /timed out/,
    );

    const result = await prisma.aiAnalysisResult.findUnique({ where: { id: aiResultId } });
    expect(result?.status).toBe('PENDING');
    expect(result?.errorCode).toBe('AI_TIMEOUT');

    // Second delivery succeeds.
    provider.enqueueResponse(aiGeneration(validInsightsContent()));
    await service.execute(makeAIJob({ analysisId, runId, aiResultId }, { attemptsMade: 1 }));
    expect((await prisma.aiAnalysisResult.findUnique({ where: { id: aiResultId } }))?.status).toBe(
      'COMPLETED',
    );
  });

  it('marks the AI result failed on the final retryable attempt without failing the run', async () => {
    const { analysisId, runId, aiResultId } = await seedCompletedRun(prisma);
    const provider = new FakeAIProvider();
    provider.enqueueError(new AIProviderError('AI_PROVIDER_UNAVAILABLE', 'provider 503', true));
    const service = new AIExecutionService(prisma, orchestratorWith(provider), AI_CONFIG);

    // Final attempt → failure is swallowed, the job completes.
    await service.execute(makeAIJob({ analysisId, runId, aiResultId }, { attemptsMade: 2 }));

    const result = await prisma.aiAnalysisResult.findUnique({ where: { id: aiResultId } });
    expect(result?.status).toBe('FAILED');
    expect(result?.errorCode).toBe('AI_PROVIDER_UNAVAILABLE');
    expect(result?.errorMessage).toContain('503');

    // The deterministic run is unaffected by the AI failure.
    const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('COMPLETED');
    expect(run?.errorCode).toBeNull();
  });

  it('does not retry validation failures and marks AI_VALIDATION_FAILED', async () => {
    const { analysisId, runId, aiResultId } = await seedCompletedRun(prisma);
    const provider = new FakeAIProvider();
    // Fabricated finding code → domain validation fails on the first pass and
    // the bounded repair attempt; the run is unaffected.
    provider.enqueueResponse(aiGeneration(validInsightsContent().replace('SEO_META_DESCRIPTION_MISSING', 'SEO_FAKE')));
    provider.enqueueResponse(aiGeneration(validInsightsContent().replace('SEO_META_DESCRIPTION_MISSING', 'SEO_FAKE')));
    const service = new AIExecutionService(prisma, orchestratorWith(provider), AI_CONFIG);

    await service.execute(makeAIJob({ analysisId, runId, aiResultId }, { attempts: 1, attemptsMade: 0 }));

    const result = await prisma.aiAnalysisResult.findUnique({ where: { id: aiResultId } });
    expect(result?.status).toBe('FAILED');
    expect(result?.errorCode).toBe('AI_VALIDATION_FAILED');
    expect((await prisma.analysisRun.findUnique({ where: { id: runId } }))?.status).toBe('COMPLETED');
  });

  it('fails fast with AI_CONFIG_INVALID when no API key is configured', async () => {
    const { analysisId, runId, aiResultId } = await seedCompletedRun(prisma);
    const provider = new FakeAIProvider();
    const service = new AIExecutionService(prisma, orchestratorWith(provider), {
      AI_API_KEY: undefined,
    } as never);

    await service.execute(makeAIJob({ analysisId, runId, aiResultId }));

    const result = await prisma.aiAnalysisResult.findUnique({ where: { id: aiResultId } });
    expect(result?.status).toBe('FAILED');
    expect(result?.errorCode).toBe('AI_CONFIG_INVALID');
    expect(provider.calls).toHaveLength(0);
  });

  it('handles partially completed runs (failed category excluded from scores)', async () => {
    const { analysisId, runId, aiResultId } = await seedCompletedRun(prisma, 'PARTIALLY_COMPLETED', false);
    const provider = new FakeAIProvider();
    provider.enqueueResponse(aiGeneration(validInsightsContent()));
    const service = new AIExecutionService(prisma, orchestratorWith(provider), AI_CONFIG);

    await service.execute(makeAIJob({ analysisId, runId, aiResultId }));

    const result = await prisma.aiAnalysisResult.findUnique({ where: { id: aiResultId } });
    expect(result?.status).toBe('COMPLETED');
    // The failed category is reported in the prompt so the model does not
    // invent a performance score.
    expect(provider.calls[0]?.userPrompt).toContain('performance');
  });
});

describe('AnalysisExecutionService AI enqueue', () => {
  let prisma: PrismaClient;

  beforeEach(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  it('enqueues ai.enrich after deterministic completion with a tiny payload', async () => {
    const { websiteId } = await seedWebsite(prisma);
    const { analysisId, runId } = await seedAnalysisRun(prisma, websiteId);
    const captured: Array<{ name: string; data: unknown; opts: Record<string, unknown> }> = [];
    const fakeQueue = {
      add: async (name: string, data: unknown, opts: Record<string, unknown>) => {
        captured.push({ name, data, opts });
      },
    } as unknown as Queue;
    const service = new AnalysisExecutionService(prisma, engineWithFixture(), AI_CONFIG, fakeQueue);

    await service.execute(makeJob({ analysisId, runId }));

    const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('COMPLETED');

    expect(captured).toHaveLength(1);
    expect(captured[0]?.name).toBe(AI_JOB_NAME);
    const payload = captured[0]?.data as AIJobPayload;
    expect(payload.analysisId).toBe(analysisId);
    expect(payload.runId).toBe(runId);
    expect(payload.aiResultId).toBeTruthy();
    // Deterministic jobId: the same AI result can never be enqueued twice.
    expect(captured[0]?.opts.jobId).toBe(payload.aiResultId);

    const aiResult = await prisma.aiAnalysisResult.findUnique({
      where: { analysisRunId: runId },
    });
    expect(aiResult?.status).toBe('PENDING');
    expect(aiResult?.task).toBe('analysis_insights');
  });

  it('creates a SKIPPED AI result and enqueues nothing when AI is disabled', async () => {
    const { websiteId } = await seedWebsite(prisma);
    const { analysisId, runId } = await seedAnalysisRun(prisma, websiteId);
    let added = 0;
    const fakeQueue = {
      add: async () => {
        added += 1;
      },
    } as unknown as Queue;
    const service = new AnalysisExecutionService(
      prisma,
      engineWithFixture(),
      { AI_ENABLED: false } as never,
      fakeQueue,
    );

    await service.execute(makeJob({ analysisId, runId }));

    expect(added).toBe(0);
    const aiResult = await prisma.aiAnalysisResult.findUnique({ where: { analysisRunId: runId } });
    expect(aiResult?.status).toBe('SKIPPED');
  });

  it('marks the AI result failed but keeps the run completed when enqueueing fails', async () => {
    const { websiteId } = await seedWebsite(prisma);
    const { analysisId, runId } = await seedAnalysisRun(prisma, websiteId);
    const fakeQueue = {
      add: async () => {
        throw new Error('redis down');
      },
    } as unknown as Queue;
    const service = new AnalysisExecutionService(prisma, engineWithFixture(), AI_CONFIG, fakeQueue);

    await service.execute(makeJob({ analysisId, runId }));

    const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('COMPLETED');
    const aiResult = await prisma.aiAnalysisResult.findUnique({ where: { analysisRunId: runId } });
    expect(aiResult?.status).toBe('FAILED');
    expect(aiResult?.errorCode).toBe('AI_ENQUEUE_FAILED');
  });
});