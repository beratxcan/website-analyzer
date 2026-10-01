import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { FetcherError } from '@analyzer/analysis';
import { AnalysisExecutionService } from '../src/queue/analysis-execution.service';
import { StaleRunRecoveryService } from '../src/queue/stale-run-recovery.service';
import {
  engineWithError,
  engineWithFailingAnalyzer,
  engineWithFetchSideEffect,
  engineWithFixture,
  makeJob,
  resetDatabase,
  seedAnalysisRun,
  seedWebsite,
} from './helpers';

describe('AnalysisExecutionService', () => {
  let prisma: PrismaClient;

  beforeEach(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  it('runs the full flow: claim → engine → persist findings/scores → complete', async () => {
    const { websiteId } = await seedWebsite(prisma);
    const { analysisId, runId } = await seedAnalysisRun(prisma, websiteId);
    const service = new AnalysisExecutionService(prisma, engineWithFixture());

    await service.execute(makeJob({ analysisId, runId }));

    const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('COMPLETED');
    expect(run?.attempt).toBe(1);
    expect(run?.progress).toBe(100);
    expect(run?.engineVersion).toBe('1.0.0');
    expect(run?.startedAt).not.toBeNull();
    expect(run?.completedAt).not.toBeNull();
    expect(run?.errorCode).toBeNull();

    const findings = await prisma.analysisFinding.findMany({ where: { analysisRunId: runId } });
    expect(findings.length).toBeGreaterThan(0);
    const codes = findings.map((finding) => finding.ruleCode);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain('SEO_META_DESCRIPTION_MISSING');
    expect(findings[0]?.evidence).toBeDefined();

    const scores = await prisma.analysisScore.findMany({ where: { analysisRunId: runId } });
    expect(scores.filter((score) => score.category !== 'overall')).toHaveLength(5);
    expect(scores.find((score) => score.category === 'overall')?.score).toBeGreaterThan(0);
    expect(scores.find((score) => score.category === 'seo')?.weight).toBe(0.25);

    const analysis = await prisma.analysis.findUnique({ where: { id: analysisId } });
    expect(analysis?.status).toBe('COMPLETED');
    expect(analysis?.latestRunId).toBe(runId);
  });

  it('is idempotent: a duplicate job does not re-execute or duplicate rows', async () => {
    const { websiteId } = await seedWebsite(prisma);
    const { analysisId, runId } = await seedAnalysisRun(prisma, websiteId);
    const service = new AnalysisExecutionService(prisma, engineWithFixture());

    await service.execute(makeJob({ analysisId, runId }));
    const findingsAfterFirst = await prisma.analysisFinding.count({ where: { analysisRunId: runId } });

    // Second delivery of the same job (at-least-once semantics).
    await service.execute(makeJob({ analysisId, runId }));

    const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('COMPLETED');
    expect(run?.attempt).toBe(1);
    expect(await prisma.analysisFinding.count({ where: { analysisRunId: runId } })).toBe(findingsAfterFirst);
    expect(await prisma.analysisScore.count({ where: { analysisRunId: runId } })).toBe(6);
  });

  it('does not execute a run that is already in a final state', async () => {
    const { websiteId } = await seedWebsite(prisma);
    const { analysisId, runId } = await seedAnalysisRun(prisma, websiteId, { status: 'COMPLETED' });
    const service = new AnalysisExecutionService(prisma, engineWithFixture());

    await service.execute(makeJob({ analysisId, runId }));

    const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
    expect(run?.attempt).toBe(0);
    expect(await prisma.analysisFinding.count({ where: { analysisRunId: runId } })).toBe(0);
  });

  it('keeps the run queued with error metadata on a retryable failure', async () => {
    const { websiteId } = await seedWebsite(prisma);
    const { analysisId, runId } = await seedAnalysisRun(prisma, websiteId);
    const service = new AnalysisExecutionService(
      prisma,
      engineWithError(new FetcherError('REQUEST_TIMEOUT', 'request timed out')),
    );

    await expect(service.execute(makeJob({ analysisId, runId }))).rejects.toThrow();

    const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('QUEUED');
    expect(run?.attempt).toBe(1);
    expect(run?.errorCode).toBe('REQUEST_TIMEOUT');
    expect(run?.errorMessage).toContain('timed out');
    expect(run?.failedAt).toBeNull();

    const analysis = await prisma.analysis.findUnique({ where: { id: analysisId } });
    expect(analysis?.status).toBe('PENDING');
  });

  it('marks the run failed on the final retryable attempt', async () => {
    const { websiteId } = await seedWebsite(prisma);
    const { analysisId, runId } = await seedAnalysisRun(prisma, websiteId);
    const service = new AnalysisExecutionService(
      prisma,
      engineWithError(new FetcherError('CONNECTION_TIMEOUT', 'connect timed out')),
    );

    // attemptsMade 2 + 1 = 3 ≥ attempts 3 → last attempt.
    await expect(
      service.execute(makeJob({ analysisId, runId }, { attempts: 3, attemptsMade: 2 })),
    ).rejects.toThrow();

    const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('FAILED');
    expect(run?.failedAt).not.toBeNull();
    expect(run?.errorCode).toBe('CONNECTION_TIMEOUT');

    const analysis = await prisma.analysis.findUnique({ where: { id: analysisId } });
    expect(analysis?.status).toBe('FAILED');
    expect(analysis?.latestRunId).toBe(runId);
  });

  it('does not retry non-retryable errors and stores the SSRF code', async () => {
    const { websiteId } = await seedWebsite(prisma);
    const { analysisId, runId } = await seedAnalysisRun(prisma, websiteId);
    const service = new AnalysisExecutionService(
      prisma,
      engineWithError(new FetcherError('PRIVATE_IP_BLOCKED', 'target resolves to a private address')),
    );

    await expect(service.execute(makeJob({ analysisId, runId }, { attempts: 3 }))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('FAILED');
    expect(run?.errorCode).toBe('PRIVATE_IP_BLOCKED');
  });

  it('persists a partially_completed run when an analyzer fails', async () => {
    const { websiteId } = await seedWebsite(prisma);
    const { analysisId, runId } = await seedAnalysisRun(prisma, websiteId);
    const service = new AnalysisExecutionService(prisma, engineWithFailingAnalyzer());

    await service.execute(makeJob({ analysisId, runId }));

    const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('PARTIALLY_COMPLETED');

    const scores = await prisma.analysisScore.findMany({ where: { analysisRunId: runId } });
    expect(scores.some((score) => score.category === 'seo')).toBe(true);
    expect(scores.some((score) => score.category === 'performance')).toBe(false);
    expect(await prisma.analysisFinding.count({ where: { analysisRunId: runId } })).toBeGreaterThan(0);

    const analysis = await prisma.analysis.findUnique({ where: { id: analysisId } });
    expect(analysis?.status).toBe('COMPLETED');
  });

  it('skips a cancelled run without executing', async () => {
    const { websiteId } = await seedWebsite(prisma);
    const { analysisId, runId } = await seedAnalysisRun(prisma, websiteId, {
      status: 'CANCELLED',
      cancelledAt: new Date(),
    });
    const service = new AnalysisExecutionService(prisma, engineWithFixture());

    await service.execute(makeJob({ analysisId, runId }));

    expect(await prisma.analysisFinding.count({ where: { analysisRunId: runId } })).toBe(0);
    const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('CANCELLED');
    expect(run?.attempt).toBe(0);
  });

  it('discards results when the run is cancelled mid-flight', async () => {
    const { websiteId } = await seedWebsite(prisma);
    const { analysisId, runId } = await seedAnalysisRun(prisma, websiteId);
    // The fetch flips the run to CANCELLED (as the API cancel endpoint would).
    const service = new AnalysisExecutionService(
      prisma,
      engineWithFetchSideEffect(async () => {
        await prisma.analysisRun.update({
          where: { id: runId },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        });
      }),
    );

    await service.execute(makeJob({ analysisId, runId }));

    const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('CANCELLED');
    expect(run?.completedAt).toBeNull();
    expect(await prisma.analysisFinding.count({ where: { analysisRunId: runId } })).toBe(0);
    expect(await prisma.analysisScore.count({ where: { analysisRunId: runId } })).toBe(0);
  });

  it('tracks progress during execution', async () => {
    const { websiteId } = await seedWebsite(prisma);
    const { analysisId, runId } = await seedAnalysisRun(prisma, websiteId);
    const service = new AnalysisExecutionService(prisma, engineWithFixture());

    await service.execute(makeJob({ analysisId, runId }));

    const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
    expect(run?.progress).toBe(100);
  });
});

describe('StaleRunRecoveryService', () => {
  let prisma: PrismaClient;

  beforeEach(async () => {
    prisma = new PrismaClient();
    await resetDatabase(prisma);
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  it('recovers stale running runs but leaves fresh ones untouched', async () => {
    const { websiteId } = await seedWebsite(prisma);
    const stale = await seedAnalysisRun(prisma, websiteId, {
      status: 'RUNNING',
      startedAt: new Date(Date.now() - 10 * 60_000),
    });
    await prisma.analysis.update({ where: { id: stale.analysisId }, data: { status: 'RUNNING' } });
    const fresh = await seedAnalysisRun(prisma, websiteId, {
      status: 'RUNNING',
      startedAt: new Date(),
    });

    const service = new StaleRunRecoveryService(prisma, {
      WORKER_STALE_RUN_THRESHOLD_MS: 60_000,
      WORKER_STALE_CHECK_INTERVAL_MS: 60_000,
    } as never);

    expect(await service.recover()).toBe(1);

    const staleRun = await prisma.analysisRun.findUnique({ where: { id: stale.runId } });
    expect(staleRun?.status).toBe('FAILED');
    expect(staleRun?.errorCode).toBe('STALE_RUN_TIMEOUT');
    expect(staleRun?.failedAt).not.toBeNull();
    expect((await prisma.analysis.findUnique({ where: { id: stale.analysisId } }))?.status).toBe('FAILED');

    const freshRun = await prisma.analysisRun.findUnique({ where: { id: fresh.runId } });
    expect(freshRun?.status).toBe('RUNNING');
  });

  it('recovers nothing when there are no stale runs', async () => {
    const { websiteId } = await seedWebsite(prisma);
    await seedAnalysisRun(prisma, websiteId, { status: 'RUNNING', startedAt: new Date() });
    const service = new StaleRunRecoveryService(prisma, {
      WORKER_STALE_RUN_THRESHOLD_MS: 60_000,
      WORKER_STALE_CHECK_INTERVAL_MS: 60_000,
    } as never);

    expect(await service.recover()).toBe(0);
  });
});