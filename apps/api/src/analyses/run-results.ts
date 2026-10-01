/**
 * Shared mapping between persisted run rows and the framework-independent
 * comparison/report domain types.
 *
 * Both features are pure projections over the same existing tables — no new
 * entities, no stored comparison, no stored report.
 */
import type { ComparableRun } from '@analyzer/analysis';
import type { ReportSource } from '@analyzer/report';
import { isRecord } from '@analyzer/shared';
import { Prisma, type AnalysisRunStatus } from '@prisma/client';

/** Single include shape used by every comparison/report query. */
export const RUN_RESULTS_INCLUDE = {
  analysis: { include: { website: true } },
  scores: true,
  findings: true,
  aiResult: true,
} satisfies Prisma.AnalysisRunInclude;

export type RunWithResults = Prisma.AnalysisRunGetPayload<{ include: typeof RUN_RESULTS_INCLUDE }>;

/** Statuses whose persisted results are complete enough to compare/report. */
export const REPORTABLE_RUN_STATUSES: AnalysisRunStatus[] = ['COMPLETED', 'PARTIALLY_COMPLETED'];

/** Ownership-scoped predicate: a run is visible only through the user's project chain. */
export function ownedRunWhere(userId: string, runId: string): Prisma.AnalysisRunWhereInput {
  return { id: runId, analysis: { website: { project: { userId } } } };
}

/** Hard guard: only comparable runs may reach the comparison/report domain. */
export function toComparableRunStatus(status: AnalysisRunStatus): 'completed' | 'partially_completed' {
  if (status === 'COMPLETED') return 'completed';
  if (status === 'PARTIALLY_COMPLETED') return 'partially_completed';
  throw new Error(`Run status ${status} is not comparable`);
}

export function toComparableRun(run: RunWithResults): ComparableRun {
  const scores: Record<string, number | null> = {};
  for (const score of run.scores) {
    scores[score.category] = score.score;
  }
  return {
    runId: run.id,
    analysisId: run.analysisId,
    websiteId: run.analysis.websiteId,
    status: toComparableRunStatus(run.status),
    createdAt: run.createdAt.toISOString(),
    scores,
    findings: run.findings.map((finding) => ({
      ruleCode: finding.ruleCode,
      category: finding.category,
      severity: finding.severity,
      title: finding.title,
      scoreImpact: finding.scoreImpact,
    })),
  };
}

export function toReportSource(run: RunWithResults, comparison?: ReportSource['comparison']): ReportSource {
  return {
    analysisId: run.analysisId,
    runId: run.id,
    runStatus: toComparableRunStatus(run.status),
    engineVersion: run.engineVersion,
    scoringVersion: run.scoringVersion,
    runCreatedAt: run.createdAt.toISOString(),
    runCompletedAt: run.completedAt?.toISOString() ?? null,
    website: {
      name: run.analysis.website.name,
      host: run.analysis.website.host,
      url: run.analysis.website.url,
    },
    scores: run.scores.map((score) => ({
      category: score.category,
      score: score.score,
      weight: score.weight,
    })),
    findings: run.findings.map((finding) => ({
      ruleCode: finding.ruleCode,
      category: finding.category,
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      scoreImpact: finding.scoreImpact,
      evidence: finding.evidence,
    })),
    ai: toReportAI(run.aiResult),
    comparison: comparison ?? null,
  };
}

type ReportAI = NonNullable<ReportSource['ai']>;

/**
 * AI content is JSON typed as `unknown`. It is parsed defensively: a shape we
 * do not recognize degrades to "no AI content" rather than breaking a report
 * or leaking an unexpected structure into the document.
 */
function toReportAI(ai: RunWithResults['aiResult']): ReportSource['ai'] {
  if (!ai) return null;
  return {
    status: ai.status.toLowerCase() as ReportAI['status'],
    summary: parseSummary(ai.summary),
    recommendations: parseRecommendations(ai.recommendations),
  };
}

function parseSummary(value: unknown): ReportAI['summary'] {
  if (!isRecord(value)) return null;
  const headline = typeof value.headline === 'string' ? value.headline : '';
  const overview = typeof value.overview === 'string' ? value.overview : '';
  const strengths = toStringArray(value.strengths);
  const weaknesses = toStringArray(value.weaknesses);
  if (!headline && !overview && strengths.length === 0 && weaknesses.length === 0) {
    return null;
  }
  return { headline, overview, strengths, weaknesses };
}

function parseRecommendations(value: unknown): ReportAI['recommendations'] {
  if (!Array.isArray(value)) return null;
  const recommendations = value.filter(isRecord).flatMap((item) => {
    const title = typeof item.title === 'string' ? item.title : '';
    const description = typeof item.description === 'string' ? item.description : '';
    if (!title && !description) return [];
    return [
      {
        title,
        description,
        priority: typeof item.priority === 'string' ? item.priority : 'medium',
        impact: typeof item.impact === 'string' ? item.impact : 'medium',
        effort: typeof item.effort === 'string' ? item.effort : 'medium',
        category: typeof item.category === 'string' ? item.category : 'technical',
        relatedFindingCodes: toStringArray(item.relatedFindingCodes),
      },
    ];
  });
  return recommendations;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}
