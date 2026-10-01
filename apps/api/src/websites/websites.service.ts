import { HttpStatus, Injectable } from '@nestjs/common';
import { normalizeWebsiteUrl, WebsiteUrlError } from '@analyzer/shared';
import { Prisma } from '@prisma/client';
import type {
  WebsiteAnalysesResponse,
  WebsiteDto,
  WebsiteListResponse,
  WebsiteTrendPointDto,
  WebsiteTrendsResponse,
} from '@analyzer/contracts';
import { ApiException, ErrorCode } from '../common/errors';
import { toWebsiteDto } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import type { CreateWebsiteDto } from './dto/create-website.dto';
import type { UpdateWebsiteDto } from './dto/update-website.dto';

const TREND_CATEGORIES = ['seo', 'technical', 'content', 'accessibility', 'performance'] as const;

@Injectable()
export class WebsitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async list(userId: string, projectId: string): Promise<WebsiteListResponse> {
    await this.projectsService.getOwnedProject(userId, projectId);
    const websites = await this.prisma.website.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    return { items: websites.map(toWebsiteDto) };
  }

  async create(userId: string, projectId: string, dto: CreateWebsiteDto): Promise<WebsiteDto> {
    await this.projectsService.getOwnedProject(userId, projectId);
    const normalized = this.normalize(dto.url);
    try {
      const website = await this.prisma.website.create({
        data: {
          projectId,
          name: dto.name,
          url: normalized.url,
          normalizedUrl: normalized.normalizedUrl,
          host: normalized.host,
        },
      });
      return toWebsiteDto(website);
    } catch (error) {
      this.rethrowDuplicate(error);
      throw error;
    }
  }

  async get(userId: string, websiteId: string): Promise<WebsiteDto> {
    const website = await this.getOwnedWebsite(userId, websiteId);
    return toWebsiteDto(website);
  }

  async update(userId: string, websiteId: string, dto: UpdateWebsiteDto): Promise<WebsiteDto> {
    await this.getOwnedWebsite(userId, websiteId);
    const normalized = dto.url !== undefined ? this.normalize(dto.url) : undefined;
    try {
      const website = await this.prisma.website.update({
        where: { id: websiteId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(normalized
            ? {
                url: normalized.url,
                normalizedUrl: normalized.normalizedUrl,
                host: normalized.host,
              }
            : {}),
        },
      });
      return toWebsiteDto(website);
    } catch (error) {
      this.rethrowDuplicate(error);
      throw error;
    }
  }

  async delete(userId: string, websiteId: string): Promise<void> {
    await this.getOwnedWebsite(userId, websiteId);
    await this.prisma.website.delete({ where: { id: websiteId } });
  }

  /**
   * Score history of a website derived from its persisted run score
   * snapshots (oldest first, ready for charting).
   */
  async trends(userId: string, websiteId: string): Promise<WebsiteTrendsResponse> {
    await this.getOwnedWebsite(userId, websiteId);
    const runs = await this.prisma.analysisRun.findMany({
      where: {
        analysis: { websiteId },
        status: { in: ['COMPLETED', 'PARTIALLY_COMPLETED'] },
      },
      include: { scores: true },
      orderBy: { createdAt: 'asc' },
    });
    return runs.map((run) => {
      const point: WebsiteTrendPointDto = {
        runId: run.id,
        analysisId: run.analysisId,
        createdAt: run.createdAt.toISOString(),
        overall: null,
        seo: null,
        technical: null,
        content: null,
        accessibility: null,
        performance: null,
      };
      for (const score of run.scores) {
        if (score.category === 'overall') {
          point.overall = score.score;
        } else if ((TREND_CATEGORIES as readonly string[]).includes(score.category)) {
          point[score.category as (typeof TREND_CATEGORIES)[number]] = score.score;
        }
      }
      return point;
    });
  }

  /** Paged analysis history of a website (newest first) with AI status. */
  async analyses(
    userId: string,
    websiteId: string,
    page: number,
    limit: number,
  ): Promise<WebsiteAnalysesResponse> {
    await this.getOwnedWebsite(userId, websiteId);
    const where: Prisma.AnalysisWhereInput = { websiteId };
    const [analyses, total] = await Promise.all([
      this.prisma.analysis.findMany({
        where,
        include: {
          latestRun: {
            include: {
              scores: { where: { category: 'overall' }, select: { score: true }, take: 1 },
              aiResult: { select: { status: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.analysis.count({ where }),
    ]);
    return {
      items: analyses.map((analysis) => ({
        id: analysis.id,
        status: analysis.status.toLowerCase() as WebsiteAnalysesResponse['items'][number]['status'],
        runId: analysis.latestRunId,
        overallScore: analysis.latestRun?.scores[0]?.score ?? null,
        aiStatus: analysis.latestRun?.aiResult
          ? (analysis.latestRun.aiResult.status.toLowerCase() as WebsiteAnalysesResponse['items'][number]['aiStatus'])
          : null,
        createdAt: analysis.createdAt.toISOString(),
        updatedAt: analysis.updatedAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
  }

  /** Resolves a website only when it belongs to a project owned by the user. */
  private async getOwnedWebsite(userId: string, websiteId: string) {
    const website = await this.prisma.website.findFirst({
      where: { id: websiteId, project: { userId } },
    });
    if (!website) {
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.WEBSITE_NOT_FOUND, 'Website not found');
    }
    return website;
  }

  private normalize(url: string) {
    try {
      return normalizeWebsiteUrl(url);
    } catch (error) {
      if (error instanceof WebsiteUrlError) {
        throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_TARGET_URL, error.message);
      }
      throw error;
    }
  }

  private rethrowDuplicate(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.WEBSITE_ALREADY_EXISTS,
        'This website already exists in the project',
      );
    }
  }
}