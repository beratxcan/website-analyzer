import type {
  AIResultDto,
  AIResultStatus,
  AnalysisFindingDto,
  AnalysisRunDetail,
  AnalysisRunStatus,
  AnalysisRunSummary,
  AnalysisScoreDto,
  AnalysisStatus,
  AnalysisSummary,
} from '@analyzer/contracts';
import type { AiAnalysisResult, Analysis, AnalysisFinding, AnalysisRun, AnalysisScore, Website } from '@prisma/client';

export type AnalysisWithRelations = Analysis & {
  website: Website;
  latestRun: (AnalysisRun & { scores?: AnalysisScore[] }) | null;
};

export type RunWithDetails = AnalysisRun & {
  findings?: AnalysisFinding[];
  scores?: AnalysisScore[];
  aiResult?: AiAnalysisResult | null;
};

function toRunStatus(status: AnalysisRun['status']): AnalysisRunStatus {
  return status.toLowerCase() as AnalysisRunStatus;
}

function toAnalysisStatus(status: Analysis['status']): AnalysisStatus {
  return status.toLowerCase() as AnalysisStatus;
}

export function toAnalysisSummary(analysis: AnalysisWithRelations): AnalysisSummary {
  const overall = analysis.latestRun?.scores?.find((score) => score.category === 'overall');
  return {
    id: analysis.id,
    websiteId: analysis.websiteId,
    website: {
      id: analysis.website.id,
      name: analysis.website.name,
      url: analysis.website.url,
      host: analysis.website.host,
    },
    status: toAnalysisStatus(analysis.status),
    latestRunId: analysis.latestRunId,
    latestRunStatus: analysis.latestRun ? toRunStatus(analysis.latestRun.status) : null,
    latestScore: overall?.score ?? null,
    createdAt: analysis.createdAt.toISOString(),
    updatedAt: analysis.updatedAt.toISOString(),
  };
}

export function toRunSummary(run: AnalysisRun): AnalysisRunSummary {
  return {
    id: run.id,
    status: toRunStatus(run.status),
    attempt: run.attempt,
    progress: run.progress,
    engineVersion: run.engineVersion,
    scoringVersion: run.scoringVersion,
    errorCode: run.errorCode,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    failedAt: run.failedAt?.toISOString() ?? null,
    cancelledAt: run.cancelledAt?.toISOString() ?? null,
  };
}

export function toRunDetail(run: RunWithDetails): AnalysisRunDetail {
  return {
    ...toRunSummary(run),
    analysisId: run.analysisId,
    engineVersion: run.engineVersion,
    scoringVersion: run.scoringVersion,
    startedAt: run.startedAt?.toISOString() ?? null,
    errorMessage: run.errorMessage,
    updatedAt: run.updatedAt.toISOString(),
    findings: (run.findings ?? []).map(toFindingDto),
    scores: (run.scores ?? []).map(toScoreDto),
    ai: run.aiResult ? toAIResultDto(run.aiResult) : null,
  };
}

export function toAIResultDto(ai: AiAnalysisResult): AIResultDto {
  return {
    status: ai.status.toLowerCase() as AIResultStatus,
    task: ai.task,
    provider: ai.provider,
    model: ai.model,
    promptVersion: ai.promptVersion,
    schemaVersion: ai.schemaVersion,
    summary: ai.summary as AIResultDto['summary'],
    recommendations: ai.recommendations as AIResultDto['recommendations'],
    inputTokens: ai.inputTokens,
    outputTokens: ai.outputTokens,
    totalTokens: ai.totalTokens,
    estimatedCostUsd: ai.estimatedCostUsd,
    latencyMs: ai.latencyMs,
    errorCode: ai.errorCode,
    errorMessage: ai.errorMessage,
    createdAt: ai.createdAt.toISOString(),
    updatedAt: ai.updatedAt.toISOString(),
  };
}

export function toFindingDto(finding: AnalysisFinding): AnalysisFindingDto {
  return {
    id: finding.id,
    ruleCode: finding.ruleCode,
    category: finding.category,
    severity: finding.severity,
    title: finding.title,
    description: finding.description,
    scoreImpact: finding.scoreImpact,
    evidence: finding.evidence,
    createdAt: finding.createdAt.toISOString(),
  };
}

export function toScoreDto(score: AnalysisScore): AnalysisScoreDto {
  return {
    category: score.category,
    score: score.score,
    weight: score.weight,
  };
}