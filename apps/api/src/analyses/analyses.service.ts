import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ANALYSIS_ENGINE_VERSION, SCORING_VERSION } from '@analyzer/analysis';
import {
  ANALYSIS_JOB_NAME,
  type AnalysisListResponse,
  type AnalysisRunListResponse,
  type CancelAnalysisResponse,
  type CreateAnalysisResponse,
  type FindingsExplorerResponse,
  type FindingsSort,
} from '@analyzer/contracts';
import { Prisma, type Website } from '@prisma/client';
import type { FindingsQueryDto } from './dto/findings-query.dto';
import { ApiException, ErrorCode } from '../common/errors';
import { APP_CONFIG, type AppConfig } from '../config/config.constants';
import { PrismaService } from '../prisma/prisma.service';
import { ANALYSIS_QUEUE } from '../queue/queue.constants';
import { toAnalysisSummary, toFindingDto, toRunDetail, toRunSummary } from './analyses.mappers';

@Injectable()
export class AnalysesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ANALYSIS_QUEUE) private readonly queue: Queue,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Creates an analysis + its first run inside one transaction and enqueues
   * the job. The analysis engine is never executed inside the request.
   */
  async create(userId: string, websiteId: string): Promise<CreateAnalysisResponse> {
    const website = await this.getOwnedWebsite(userId, websiteId);

    const { analysis, run } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.analysis.create({
        data: { websiteId: website.id, status: 'PENDING' },
      });
      const createdRun = await tx.analysisRun.create({
        data: {
          analysisId: created.id,
          status: 'QUEUED',
          attempt: 0,
          engineVersion: ANALYSIS_ENGINE_VERSION,
          scoringVersion: SCORING_VERSION,
          progress: 0,
        },
      });
      return { analysis: created, run: createdRun };
    });

    try {
      await this.queue.add(
        ANALYSIS_JOB_NAME,
        { analysisId: analysis.id, runId: run.id },
        {
          // Deterministic job id: enqueuing the same run twice is a no-op.
          jobId: run.id,
          attempts: this.config.ANALYSIS_JOB_ATTEMPTS,
          backoff: {
            type: 'exponential',
            delay: this.config.ANALYSIS_JOB_BACKOFF_DELAY_MS,
          },
          removeOnComplete: 200,
          removeOnFail: 1_000,
        },
      );
    } catch (error) {
      // The queue must not silently drop the run; fail it with a meaningful code.
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.$transaction([
        this.prisma.analysisRun.update({
          where: { id: run.id },
          data: { status: 'FAILED', failedAt: new Date(), errorCode: 'QUEUE_ENQUEUE_FAILED', errorMessage: message },
        }),
        this.prisma.analysis.update({
          where: { id: analysis.id },
          data: { status: 'FAILED', latestRunId: run.id },
        }),
      ]);
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.QUEUE_UNAVAILABLE,
        'The analysis could not be queued; please try again',
      );
    }

    const created = await this.prisma.analysis.findUnique({
      where: { id: analysis.id },
      include: { website: true, latestRun: true },
    });
    if (!created) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR, 'Analysis was not created');
    }
    return { analysis: toAnalysisSummary(created), run: toRunSummary(run) };
  }

  async list(userId: string): Promise<AnalysisListResponse> {
    const analyses = await this.prisma.analysis.findMany({
      where: { website: { project: { userId } } },
      include: { website: true, latestRun: { include: { scores: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { items: analyses.map(toAnalysisSummary) };
  }

  async get(userId: string, analysisId: string) {
    const analysis = await this.getOwnedAnalysis(userId, analysisId);
    const withScores = await this.prisma.analysis.findUnique({
      where: { id: analysis.id },
      include: { website: true, latestRun: { include: { scores: true } } },
    });
    if (!withScores) {
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.ANALYSIS_NOT_FOUND, 'Analysis not found');
    }
    return toAnalysisSummary(withScores);
  }

  async runs(userId: string, analysisId: string): Promise<AnalysisRunListResponse> {
    await this.getOwnedAnalysis(userId, analysisId);
    const runs = await this.prisma.analysisRun.findMany({
      where: { analysisId },
      orderBy: { createdAt: 'desc' },
    });
    return { items: runs.map(toRunSummary) };
  }

  async runDetail(userId: string, analysisId: string, runId: string) {
    await this.getOwnedAnalysis(userId, analysisId);
    const run = await this.prisma.analysisRun.findFirst({
      where: { id: runId, analysisId },
      include: {
        findings: { orderBy: { ruleCode: 'asc' } },
        scores: { orderBy: { category: 'asc' } },
        aiResult: true,
      },
    });
    if (!run) {
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.ANALYSIS_NOT_FOUND, 'Analysis run not found');
    }
    return toRunDetail(run);
  }

  /**
   * Filtered + paged findings of an analysis (latest run). Per-run finding
   * sets are naturally bounded, so ordering (incl. severity rank) and
   * pagination happen after one scoped query — deterministic and free of
   * N+1 lookups.
   */
  async findings(
    userId: string,
    analysisId: string,
    query: FindingsQueryDto,
  ): Promise<FindingsExplorerResponse> {
    await this.getOwnedAnalysis(userId, analysisId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const latestRun = await this.prisma.analysisRun.findFirst({
      where: { analysisId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!latestRun) {
      return { items: [], total: 0, page, limit };
    }

    const where: Prisma.AnalysisFindingWhereInput = {
      analysisRunId: latestRun.id,
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.search
        ? {
            OR: [
              { ruleCode: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const findings = await this.prisma.analysisFinding.findMany({
      where,
      orderBy: { ruleCode: 'asc' },
    });
    const sorted = sortFindings(findings, query.sort ?? 'severity');
    const items = sorted.slice((page - 1) * limit, page * limit);
    return {
      items: items.map(toFindingDto),
      total: sorted.length,
      page,
      limit,
    };
  }

  async cancel(userId: string, analysisId: string): Promise<CancelAnalysisResponse> {
    const analysis = await this.getOwnedAnalysis(userId, analysisId);
    if (analysis.status === 'COMPLETED' || analysis.status === 'FAILED') {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.ANALYSIS_NOT_CANCELLABLE,
        'Only pending or running analyses can be cancelled',
      );
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.analysisRun.updateMany({
        where: { analysisId, status: { in: ['QUEUED', 'RUNNING'] } },
        data: { status: 'CANCELLED', cancelledAt: now },
      }),
      this.prisma.analysis.update({ where: { id: analysisId }, data: { status: 'CANCELLED' } }),
    ]);
    const cancelled = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
      include: { website: true, latestRun: true },
    });
    if (!cancelled) {
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.ANALYSIS_NOT_FOUND, 'Analysis not found');
    }
    return { analysis: toAnalysisSummary(cancelled) };
  }

  /** Resolves an analysis only when its website belongs to a project owned by the user. */
  private async getOwnedAnalysis(userId: string, analysisId: string) {
    const analysis = await this.prisma.analysis.findFirst({
      where: { id: analysisId, website: { project: { userId } } },
    });
    if (!analysis) {
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.ANALYSIS_NOT_FOUND, 'Analysis not found');
    }
    return analysis;
  }

  private async getOwnedWebsite(userId: string, websiteId: string): Promise<Website> {
    const website = await this.prisma.website.findFirst({
      where: { id: websiteId, project: { userId } },
    });
    if (!website) {
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.WEBSITE_NOT_FOUND, 'Website not found');
    }
    return website;
  }
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/** Deterministic finding ordering for the explorer (stable tie-break on code). */
function sortFindings<T extends { ruleCode: string; severity: string; scoreImpact: number; createdAt: Date }>(
  findings: T[],
  sort: FindingsSort,
): T[] {
  switch (sort) {
    case 'impact':
      return [...findings].sort(
        (a, b) => b.scoreImpact - a.scoreImpact || a.ruleCode.localeCompare(b.ruleCode),
      );
    case 'code':
      return [...findings].sort((a, b) => a.ruleCode.localeCompare(b.ruleCode));
    case 'newest':
      return [...findings].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.ruleCode.localeCompare(b.ruleCode),
      );
    case 'severity':
    default:
      return [...findings].sort(
        (a, b) =>
          (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
          a.ruleCode.localeCompare(b.ruleCode),
      );
  }
}