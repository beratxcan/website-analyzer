import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { Prisma } from '@prisma/client';
import { CATEGORY_WEIGHTS, AnalysisEngine, type AnalysisResult } from '@analyzer/analysis';
import {
  AI_JOB_NAME,
  ANALYSIS_QUEUE_NAME,
  type AIJobPayload,
  type AnalysisJobPayload,
} from '@analyzer/contracts';
import type { AppConfig } from '../config/config.constants';
import { PrismaService } from '../prisma/prisma.service';
import { classifyError, isFinalRunStatus } from './analysis-errors';

/**
 * Executes one analysis run job. The database is the source of truth:
 *
 * ```text
 * load run → idempotency check → claim (queued → running) → engine →
 * persist findings/scores → finalize run
 * ```
 *
 * The worker never talks to the HTTP API and never transports URLs or
 * results through the queue — only `analysisId`/`runId` references.
 */
@Injectable()
export class AnalysisExecutionService {
  private readonly logger = new Logger('AnalysisExecution');
  private readonly engine: AnalysisEngine;
  private readonly config: AppConfig;
  private readonly aiQueue: Queue | null;

  constructor(
    private readonly prisma: PrismaService,
    engine?: AnalysisEngine,
    config?: AppConfig,
    aiQueue?: Queue,
  ) {
    this.engine = engine ?? new AnalysisEngine();
    this.config = config ?? ({ AI_ENABLED: false } as AppConfig);
    this.aiQueue = aiQueue ?? null;
  }

  async execute(job: Job<AnalysisJobPayload>): Promise<void> {
    const { analysisId, runId } = job.data;
    const startedAt = Date.now();
    const run = await this.prisma.analysisRun.findUnique({
      where: { id: runId },
      include: { analysis: { include: { website: true } } },
    });
    if (!run) {
      throw new UnrecoverableError(`Analysis run ${runId} does not exist`);
    }

    const log = (event: string, extra = ''): void => {
      this.logger.log(
        `analysis.${event} analysisId=${analysisId} runId=${runId} jobId=${job.id} attempt=${run.attempt + 1}${extra}`,
      );
    };

    // Idempotency: at-least-once delivery of an already-final run is a no-op.
    if (isFinalRunStatus(run.status)) {
      log('skipped_duplicate', ` status=${run.status}`);
      return;
    }

    // Claim the run. Only QUEUED (or RUNNING after a crash re-delivery) can
    // transition; a cancelled run is skipped and acknowledged.
    const claimed = await this.prisma.analysisRun.updateMany({
      where: { id: runId, status: { in: ['QUEUED', 'RUNNING'] } },
      data: {
        status: 'RUNNING',
        attempt: run.attempt + 1,
        startedAt: new Date(),
        errorCode: null,
        errorMessage: null,
        progress: 5,
      },
    });
    if (claimed.count === 0) {
      log('skipped_race');
      return;
    }
    await this.prisma.analysis.updateMany({
      where: { id: analysisId, status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'RUNNING' },
    });
    log('started');

    const website = run.analysis.website;
    try {
      const result = await this.engine.analyze(website.url, {
        onProgress: (event) => {
          void this.trackProgress(runId, event.progress).catch(() => undefined);
        },
      });
      const finalized = await this.finalize(runId, analysisId, result);
      log(
        result.status === 'completed' ? 'completed' : 'partially_completed',
        ` status=${result.status} findings=${result.findings.length} durationMs=${Date.now() - startedAt}`,
      );
      if (finalized.persisted) {
        await this.enqueueAI(analysisId, runId, finalized.aiResultId);
      }
    } catch (error) {
      const errorToThrow = await this.handleFailure(job, runId, analysisId, error, Date.now() - startedAt);
      throw errorToThrow;
    }
  }

  /**
   * Persists findings, score snapshots, the final run state and the AI
   * enrichment placeholder in one transaction. Re-checks the run status
   * inside the transaction so results of a run cancelled mid-flight are
   * discarded. Returns the created AI result id (when AI is enabled) so the
   * caller can enqueue `ai.enrich` after commit.
   */
  private async finalize(
    runId: string,
    analysisId: string,
    result: AnalysisResult,
  ): Promise<{ persisted: boolean; aiResultId: string | null }> {
    const now = new Date();
    const finalStatus = result.status === 'completed' ? 'COMPLETED' : 'PARTIALLY_COMPLETED';

    const outcome = await this.prisma.$transaction(async (tx) => {
      const current = await tx.analysisRun.findUnique({ where: { id: runId }, select: { status: true } });
      if (!current || current.status === 'CANCELLED') {
        return { persisted: false as const, aiResultId: null as string | null };
      }

      if (result.findings.length > 0) {
        await tx.analysisFinding.createMany({
          data: result.findings.map((finding) => ({
            analysisRunId: runId,
            ruleCode: finding.code,
            category: finding.category,
            severity: finding.severity,
            title: finding.title,
            description: finding.description,
            scoreImpact: finding.scoreImpact.points,
            evidence: finding.evidence as unknown as Prisma.InputJsonValue,
          })),
          skipDuplicates: true,
        });
      }

      const scores: { category: string; score: number; weight: number | null }[] = [
        ...Object.entries(result.categoryScores).map(([category, score]) => ({
          category,
          score: score ?? 0,
          weight: CATEGORY_WEIGHTS[category as keyof typeof CATEGORY_WEIGHTS] ?? null,
        })),
      ];
      if (result.overallScore !== null) {
        scores.push({ category: 'overall', score: result.overallScore, weight: null });
      }
      if (scores.length > 0) {
        await tx.analysisScore.createMany({
          data: scores.map((score) => ({ analysisRunId: runId, ...score })),
          skipDuplicates: true,
        });
      }

      await tx.analysisRun.update({
        where: { id: runId },
        data: {
          status: finalStatus,
          completedAt: now,
          progress: 100,
          engineVersion: result.metadata.engine.analysisEngineVersion,
          scoringVersion: result.metadata.engine.scoringVersion,
          errorCode: null,
          errorMessage: null,
        },
      });
      await tx.analysis.update({
        where: { id: analysisId },
        data: { status: 'COMPLETED', latestRunId: runId },
      });

      // AI enrichment placeholder lives in the same transaction as the
      // deterministic results: either both exist or neither does. Enqueuing
      // happens after commit so the AI network call never blocks persistence.
      const aiStatus = this.config.AI_ENABLED ? 'PENDING' : 'SKIPPED';
      const aiResult = await tx.aiAnalysisResult.create({
        data: { analysisRunId: runId, task: 'analysis_insights', status: aiStatus },
        select: { id: true },
      });
      return { persisted: true as const, aiResultId: aiResult.id };
    });

    if (!outcome.persisted) {
      this.logger.log(`analysis.cancelled_during_execution analysisId=${analysisId} runId=${runId}`);
      return outcome;
    }
    if (!this.config.AI_ENABLED) {
      this.logger.log(`ai.skipped analysisId=${analysisId} runId=${runId} reason=ai_disabled`);
    }
    return outcome;
  }

  /**
   * Enqueues the AI enrichment job with the deterministic result as its
   * only reference. Queue failure marks only the AI result FAILED — it never
   * fails the completed deterministic run.
   */
  private async enqueueAI(
    analysisId: string,
    runId: string,
    aiResultId: string | null,
  ): Promise<void> {
    if (!aiResultId || !this.config.AI_ENABLED) {
      return;
    }
    if (!this.aiQueue) {
      this.logger.error(`ai.enqueue_failed analysisId=${analysisId} runId=${runId} aiResultId=${aiResultId} reason=no_queue`);
      return;
    }
    const payload: AIJobPayload = { analysisId, runId, aiResultId };
    try {
      await this.aiQueue.add(AI_JOB_NAME, payload, {
        // Deterministic job id: the same AI result can never be enqueued twice.
        jobId: aiResultId,
        attempts: this.config.AI_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: this.config.AI_JOB_BACKOFF_DELAY_MS },
        removeOnComplete: 200,
        removeOnFail: 1_000,
      });
      this.logger.log(`ai.queued analysisId=${analysisId} runId=${runId} aiResultId=${aiResultId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.aiAnalysisResult.update({
        where: { id: aiResultId },
        data: { status: 'FAILED', errorCode: 'AI_ENQUEUE_FAILED', errorMessage: message },
      });
      this.logger.error(
        `ai.enqueue_failed analysisId=${analysisId} runId=${runId} aiResultId=${aiResultId} message=${message}`,
      );
    }
  }

  /**
   * Applies retry semantics. Transient failures with attempts remaining put
   * the run back to QUEUED and rethrow (BullMQ retries with backoff). Final
   * failures and permanent errors mark the run FAILED and surface as an
   * {@link UnrecoverableError} so BullMQ does not retry.
   */
  private async handleFailure(
    job: Job<AnalysisJobPayload>,
    runId: string,
    analysisId: string,
    error: unknown,
    durationMs: number,
  ): Promise<Error> {
    const classification = classifyError(error);
    const message = error instanceof Error ? error.message : String(error);
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

    if (classification.retryable && !finalAttempt) {
      await this.prisma.analysisRun.update({
        where: { id: runId },
        data: { status: 'QUEUED', errorCode: classification.code, errorMessage: message },
      });
      await this.prisma.analysis.updateMany({
        where: { id: analysisId, status: 'RUNNING' },
        data: { status: 'PENDING' },
      });
      this.logger.warn(
        `analysis.retry analysisId=${analysisId} runId=${runId} jobId=${job.id} queue=${ANALYSIS_QUEUE_NAME} code=${classification.code} attempt=${job.attemptsMade + 1} durationMs=${durationMs}`,
      );
      return error instanceof Error ? error : new Error(message);
    }

    await this.prisma.$transaction([
      this.prisma.analysisRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          errorCode: classification.code,
          errorMessage: message,
        },
      }),
      this.prisma.analysis.update({
        where: { id: analysisId },
        data: { status: 'FAILED', latestRunId: runId },
      }),
    ]);
    this.logger.error(
      `analysis.failed analysisId=${analysisId} runId=${runId} jobId=${job.id} queue=${ANALYSIS_QUEUE_NAME} code=${classification.code} finalAttempt=${finalAttempt} durationMs=${durationMs}`,
    );
    return new UnrecoverableError(message);
  }

  private async trackProgress(runId: string, progress: number): Promise<void> {
    await this.prisma.analysisRun.update({ where: { id: runId }, data: { progress } });
  }
}