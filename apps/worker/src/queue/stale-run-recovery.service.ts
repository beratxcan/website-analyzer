import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.constants';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Recovers runs stuck in `running` after a worker crash or restart: any run
 * whose `startedAt` is older than the configured threshold is marked failed
 * with a stable error code. Runs are checked at startup and on an interval.
 * Deliberately simple — no distributed locking (single-worker assumption).
 */
@Injectable()
export class StaleRunRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('StaleRunRecovery');
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    void this.recover();
    this.timer = setInterval(() => {
      void this.recover();
    }, this.config.WORKER_STALE_CHECK_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
  }

  /** Marks stale running runs as failed. Returns the number recovered. */
  async recover(): Promise<number> {
    const threshold = new Date(Date.now() - this.config.WORKER_STALE_RUN_THRESHOLD_MS);
    const stale = await this.prisma.analysisRun.findMany({
      where: { status: 'RUNNING', startedAt: { lt: threshold } },
      select: { id: true, analysisId: true },
    });

    for (const run of stale) {
      await this.prisma.$transaction([
        this.prisma.analysisRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            failedAt: new Date(),
            errorCode: 'STALE_RUN_TIMEOUT',
            errorMessage: `Run exceeded the ${this.config.WORKER_STALE_RUN_THRESHOLD_MS}ms staleness threshold`,
          },
        }),
        this.prisma.analysis.updateMany({
          where: { id: run.analysisId, status: 'RUNNING' },
          data: { status: 'FAILED' },
        }),
      ]);
      this.logger.warn(`analysis.stale_recovered analysisId=${run.analysisId} runId=${run.id}`);
    }
    await this.recoverStaleAIResults(threshold);
    return stale.length;
  }

  /**
   * Marks AI results stuck in `running` (e.g. a worker crash mid-provider
   * call that BullMQ could not re-deliver) as failed. This never touches the
   * deterministic run status.
   */
  private async recoverStaleAIResults(threshold: Date): Promise<void> {
    const stale = await this.prisma.aiAnalysisResult.findMany({
      where: { status: 'RUNNING', updatedAt: { lt: threshold } },
      select: { id: true, analysisRunId: true },
    });
    for (const aiResult of stale) {
      await this.prisma.aiAnalysisResult.update({
        where: { id: aiResult.id },
        data: {
          status: 'FAILED',
          errorCode: 'AI_STALE_TIMEOUT',
          errorMessage: `AI result exceeded the ${this.config.WORKER_STALE_RUN_THRESHOLD_MS}ms staleness threshold`,
        },
      });
      this.logger.warn(`ai.stale_recovered runId=${aiResult.analysisRunId} aiResultId=${aiResult.id}`);
    }
  }
}