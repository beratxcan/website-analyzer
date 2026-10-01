import { Injectable } from '@nestjs/common';
import type {
  ActivityEventDto,
  ActivityFeedResponse,
  DashboardOverviewDto,
  TopIssueDto,
  TopIssuesResponse,
} from '@analyzer/contracts';
import { PrismaService } from '../prisma/prisma.service';

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/**
 * Dashboard projections over existing models — no dedicated dashboard
 * entities, no new tables. All queries are ownership-scoped (one filter hop
 * through project → website → analysis), so a user can never observe another
 * user's data.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(userId: string): Promise<DashboardOverviewDto> {
    const [totalProjects, totalWebsites, analyses] = await Promise.all([
      this.prisma.project.count({ where: { userId } }),
      this.prisma.website.count({ where: { project: { userId } } }),
      this.prisma.analysis.findMany({
        where: { website: { project: { userId } } },
        select: {
          status: true,
          latestRun: {
            select: {
              scores: {
                where: { category: 'overall' },
                select: { score: true },
                take: 1,
              },
            },
          },
        },
      }),
    ]);

    const completedAnalyses = analyses.filter((analysis) => analysis.status === 'COMPLETED').length;
    const failedAnalyses = analyses.filter((analysis) => analysis.status === 'FAILED').length;

    // Average of the latest overall score per completed analysis.
    const scores = analyses
      .filter((analysis) => analysis.status === 'COMPLETED')
      .map((analysis) => analysis.latestRun?.scores[0]?.score)
      .filter((score): score is number => score !== null && score !== undefined);
    const averageScore =
      scores.length > 0
        ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
        : null;

    return {
      totalProjects,
      totalWebsites,
      totalAnalyses: analyses.length,
      completedAnalyses,
      failedAnalyses,
      averageScore,
    };
  }

  /** Most frequent finding codes across the user's completed runs. */
  async topIssues(userId: string, limit = 8): Promise<TopIssuesResponse> {
    const grouped = await this.prisma.analysisFinding.groupBy({
      by: ['ruleCode'],
      where: { run: { analysis: { website: { project: { userId } } } } },
      _count: { ruleCode: true },
      orderBy: { _count: { ruleCode: 'desc' } },
      take: limit,
    });
    if (grouped.length === 0) {
      return { items: [] };
    }

    // One representative row per rule code (the most recent occurrence).
    const samples = await this.prisma.analysisFinding.findMany({
      where: {
        ruleCode: { in: grouped.map((group) => group.ruleCode) },
        run: { analysis: { website: { project: { userId } } } },
      },
      distinct: ['ruleCode'],
      orderBy: { createdAt: 'desc' },
      select: { ruleCode: true, title: true, category: true, severity: true },
    });
    const sampleByCode = new Map(samples.map((sample) => [sample.ruleCode, sample]));

    const items: TopIssueDto[] = grouped.map((group) => {
      const sample = sampleByCode.get(group.ruleCode);
      return {
        ruleCode: group.ruleCode,
        title: sample?.title ?? group.ruleCode,
        category: sample?.category ?? 'technical',
        severity: sample?.severity ?? 'info',
        count: group._count.ruleCode,
      };
    });
    // Severity order for equal counts keeps the feed readable.
    items.sort(
      (a, b) =>
        b.count - a.count ||
        (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
    );
    return { items };
  }

  /**
   * Recent activity, projected from existing rows (no event table): project
   * creation, website addition, completed analyses and generated AI insights.
   */
  async activity(userId: string, limit = 20): Promise<ActivityFeedResponse> {
    const [projects, websites, analyses, aiResults] = await Promise.all([
      this.prisma.project.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.website.findMany({
        where: { project: { userId } },
        select: { id: true, name: true, createdAt: true, projectId: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.analysis.findMany({
        where: { website: { project: { userId } }, status: 'COMPLETED', latestRun: { isNot: null } },
        select: {
          id: true,
          websiteId: true,
          website: { select: { name: true } },
          latestRun: { select: { completedAt: true, scores: { where: { category: 'overall' }, select: { score: true }, take: 1 } } },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      this.prisma.aiAnalysisResult.findMany({
        where: { status: 'COMPLETED', run: { analysis: { website: { project: { userId } } } } },
        select: {
          id: true,
          updatedAt: true,
          run: {
            select: {
              analysisId: true,
              analysis: { select: { websiteId: true, website: { select: { name: true } } } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
    ]);

    const events: ActivityEventDto[] = [
      ...projects.map((project) => ({
        id: `p-${project.id}`,
        type: 'project_created' as const,
        title: 'Project created',
        description: project.name,
        timestamp: project.createdAt.toISOString(),
        analysisId: null,
        websiteId: null,
        projectId: project.id,
      })),
      ...websites.map((website) => ({
        id: `w-${website.id}`,
        type: 'website_added' as const,
        title: 'Website added',
        description: website.name,
        timestamp: website.createdAt.toISOString(),
        analysisId: null,
        websiteId: website.id,
        projectId: website.projectId,
      })),
      ...analyses.map((analysis) => ({
        id: `a-${analysis.id}`,
        type: 'analysis_completed' as const,
        title: 'Analysis completed',
        description:
          analysis.latestRun?.scores[0]?.score !== undefined && analysis.latestRun.scores[0].score !== null
            ? `${analysis.website.name} — score ${analysis.latestRun.scores[0].score}`
            : analysis.website.name,
        timestamp: (analysis.latestRun?.completedAt ?? new Date()).toISOString(),
        analysisId: analysis.id,
        websiteId: analysis.websiteId,
        projectId: null,
      })),
      ...aiResults.map((result) => ({
        id: `ai-${result.id}`,
        type: 'ai_insights_generated' as const,
        title: 'AI insights generated',
        description: result.run.analysis.website.name,
        timestamp: result.updatedAt.toISOString(),
        analysisId: result.run.analysisId,
        websiteId: result.run.analysis.websiteId,
        projectId: null,
      })),
    ];

    events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return { items: events.slice(0, limit) };
  }
}