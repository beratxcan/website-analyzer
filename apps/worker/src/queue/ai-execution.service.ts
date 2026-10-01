import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { AIOrchestrator, estimateCostUsd } from '@analyzer/ai';
import { AI_QUEUE_NAME, type AIJobPayload } from '@analyzer/contracts';
import type { AppConfig } from '../config/config.constants';
import { PrismaService } from '../prisma/prisma.service';
import { classifyAIError, isFinalAIStatus } from './ai-errors';

const ALL_CATEGORIES = ['seo', 'technical', 'content', 'accessibility', 'performance'];

type RunWithRelations = Prisma.AiAnalysisResultGetPayload<{
  include: {
    run: {
      include: {
        analysis: { include: { website: true } };
        findings: true;
        scores: true;
      };
    };
  };
}>['run'];

/**
 * Executes one `ai.enrich` job: loads the AI result + deterministic run from
 * the database, rebuilds the AI context, calls the provider through the
 * orchestrator, and persists the validated outcome.
 *
 * The AI lifecycle is fully isolated from the deterministic run: an AI
 * failure marks only the AI result FAILED — the AnalysisRun stays as it was.
 */
@Injectable()
export class AIExecutionService {
  private readonly logger = new Logger('AIExecution');
  private readonly orchestrator: AIOrchestrator;
  private readonly config: AppConfig;

  constructor(
    private readonly prisma: PrismaService,
    orchestrator?: AIOrchestrator,
    config?: AppConfig,
  ) {
    this.orchestrator =
      orchestrator ?? (undefined as unknown as AIOrchestrator); // Nest provides it; tests always pass one
    this.config = config ?? (undefined as unknown as AppConfig);
  }

  async execute(job: Job<AIJobPayload>): Promise<void> {
    const { analysisId, runId, aiResultId } = job.data;
    const startedAt = Date.now();
    const log = (event: string, extra = ''): void => {
      this.logger.log(
        `ai.${event} analysisId=${analysisId} runId=${runId} aiResultId=${aiResultId} jobId=${job.id} queue=${AI_QUEUE_NAME}${extra}`,
      );
    };

    const aiResult = await this.prisma.aiAnalysisResult.findUnique({
      where: { id: aiResultId },
      include: {
        run: {
          include: {
            analysis: { include: { website: true } },
            findings: true,
            scores: true,
          },
        },
      },
    });
    if (!aiResult) {
      log('missing_result');
      return;
    }

    // Idempotency: at-least-once delivery of an already-final result is a no-op.
    if (isFinalAIStatus(aiResult.status)) {
      log('skipped_duplicate', ` status=${aiResult.status}`);
      return;
    }

    // Claim. PENDING or RUNNING (crash re-delivery) may transition; a result
    // already claimed elsewhere is skipped and acknowledged.
    const claimed = await this.prisma.aiAnalysisResult.updateMany({
      where: { id: aiResultId, status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'RUNNING' },
    });
    if (claimed.count === 0) {
      log('skipped_race');
      return;
    }
    log('started', ` task=${aiResult.task}`);

    // Fail fast on missing provider configuration — never retry, and never
    // touch the deterministic run.
    if (!this.config.AI_API_KEY) {
      await this.markFailed(
        aiResultId,
        'AI_CONFIG_INVALID',
        'No AI provider API key configured (AI_API_KEY)',
      );
      log('failed', ' code=AI_CONFIG_INVALID');
      return;
    }

    try {
      const outcome = await this.orchestrator.generate(this.buildSnapshot(aiResult.run));
      const cost = estimateCostUsd(
        outcome.generation.model,
        outcome.generation.inputTokens,
        outcome.generation.outputTokens,
      );
      await this.prisma.aiAnalysisResult.update({
        where: { id: aiResultId },
        data: {
          status: 'COMPLETED',
          provider: outcome.generation.provider,
          model: outcome.generation.model,
          promptVersion: outcome.promptVersion,
          schemaVersion: outcome.schemaVersion,
          summary: outcome.result.summary as unknown as Prisma.InputJsonValue,
          recommendations: outcome.result.recommendations as unknown as Prisma.InputJsonValue,
          inputTokens: outcome.generation.inputTokens,
          outputTokens: outcome.generation.outputTokens,
          totalTokens: outcome.generation.totalTokens,
          estimatedCostUsd: cost?.costUsd ?? null,
          currency: cost?.currency ?? null,
          latencyMs: outcome.generation.latencyMs,
          errorCode: null,
          errorMessage: null,
        },
      });
      log(
        'completed',
        ` status=COMPLETED provider=${outcome.generation.provider} model=${outcome.generation.model} tokens=${outcome.generation.totalTokens} repaired=${outcome.repaired} promptVersion=${outcome.promptVersion} durationMs=${Date.now() - startedAt}`,
      );
    } catch (error) {
      await this.handleFailure(job, aiResultId, error, Date.now() - startedAt);
    }
  }

  /**
   * Retryable provider failures put the result back to PENDING and rethrow so
   * BullMQ retries with backoff. Everything else (including final attempts)
   * marks the result FAILED and is swallowed — the run is never affected.
   */
  private async handleFailure(
    job: Job<AIJobPayload>,
    aiResultId: string,
    error: unknown,
    durationMs: number,
  ): Promise<void> {
    const classification = classifyAIError(error);
    const message = error instanceof Error ? error.message : String(error);
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

    if (classification.retryable && !finalAttempt) {
      await this.prisma.aiAnalysisResult.update({
        where: { id: aiResultId },
        data: { status: 'PENDING', errorCode: classification.code, errorMessage: message },
      });
      this.logger.warn(
        `ai.retry aiResultId=${aiResultId} jobId=${job.id} queue=${AI_QUEUE_NAME} code=${classification.code} attempt=${job.attemptsMade + 1} durationMs=${durationMs}`,
      );
      throw error instanceof Error ? error : new Error(message);
    }

    await this.markFailed(aiResultId, classification.code, message);
    this.logger.error(
      `ai.failed aiResultId=${aiResultId} jobId=${job.id} queue=${AI_QUEUE_NAME} code=${classification.code} finalAttempt=${finalAttempt} durationMs=${durationMs}`,
    );
    // Swallow: the deterministic run's lifecycle is authoritative.
  }

  private async markFailed(aiResultId: string, errorCode: string, errorMessage: string): Promise<void> {
    await this.prisma.aiAnalysisResult.update({
      where: { id: aiResultId },
      data: { status: 'FAILED', errorCode, errorMessage },
    });
  }

  /** Maps persisted rows to the neutral snapshot the AI package consumes. */
  private buildSnapshot(run: RunWithRelations): Parameters<AIOrchestrator['generate']>[0] {
    const scores = run.scores ?? [];
    const categoryScores: Record<string, number | null> = {};
    let overallScore: number | null = null;
    for (const score of scores) {
      if (score.category === 'overall') {
        overallScore = score.score;
      } else {
        categoryScores[score.category] = score.score;
      }
    }
    const failedCategories = ALL_CATEGORIES.filter((category) => !(category in categoryScores));

    return {
      website: { host: run.analysis.website.host, url: run.analysis.website.url },
      runStatus: run.status === 'PARTIALLY_COMPLETED' ? 'partially_completed' : 'completed',
      overallScore,
      categoryScores,
      failedCategories,
      engineVersion: run.engineVersion,
      scoringVersion: run.scoringVersion,
      findings: (run.findings ?? []).map((finding) => ({
        ruleCode: finding.ruleCode,
        category: finding.category,
        severity: finding.severity,
        title: finding.title,
        description: finding.description,
        scoreImpact: finding.scoreImpact,
        evidence: finding.evidence,
      })),
    };
  }
}