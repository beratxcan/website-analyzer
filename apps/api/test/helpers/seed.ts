import { Prisma, type AnalysisRunStatus, type AnalysisStatus, type AIResultStatus } from '@prisma/client';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { TestAgent } from './auth';

export interface SeedFinding {
  ruleCode: string;
  category: string;
  severity: string;
  title?: string;
  description?: string;
  scoreImpact?: number;
  evidence?: unknown;
}

export interface SeedRunOptions {
  status?: AnalysisRunStatus;
  analysisStatus?: AnalysisStatus;
  /** Overall score; omit to seed a run without an overall score row. */
  overall?: number | null;
  /** Category score overrides (merged over the defaults). */
  scores?: Record<string, number | null>;
  findings?: SeedFinding[];
  /** Seeds an AI result row. */
  ai?: boolean;
  aiStatus?: AIResultStatus;
  createdAt?: Date;
}

const DEFAULT_CATEGORY_SCORES: Array<{ category: string; score: number; weight: number }> = [
  { category: 'seo', score: 78, weight: 0.25 },
  { category: 'technical', score: 86, weight: 0.25 },
  { category: 'content', score: 84, weight: 0.2 },
  { category: 'accessibility', score: 96, weight: 0.15 },
  { category: 'performance', score: 96, weight: 0.15 },
];

export async function seedProjectWithWebsite(
  agent: TestAgent,
  name = 'Dashboard Project',
): Promise<{ projectId: string; websiteId: string }> {
  const project = await agent.post('/api/v1/projects').send({ name }).expect(201);
  const website = await agent
    .post(`/api/v1/projects/${project.body.id}/websites`)
    .send({ name: 'Example', url: 'https://example.com' })
    .expect(201);
  return { projectId: project.body.id as string, websiteId: website.body.id as string };
}

/**
 * Seeds one analysis + run with persisted scores, findings and (optionally) an
 * AI result. `createdAt` is controllable so tests can build deterministic run
 * orderings without sleeping.
 */
export async function seedRun(
  prisma: PrismaService,
  websiteId: string,
  options: SeedRunOptions = {},
): Promise<{ analysisId: string; runId: string }> {
  const status = options.status ?? 'COMPLETED';
  const finished = status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED';
  const createdAt = options.createdAt ?? new Date();

  const analysis = await prisma.analysis.create({
    data: {
      websiteId,
      status: options.analysisStatus ?? (finished ? 'COMPLETED' : toAnalysisStatus(status)),
      createdAt,
    },
  });
  const run = await prisma.analysisRun.create({
    data: {
      analysisId: analysis.id,
      status,
      attempt: 1,
      progress: finished ? 100 : 40,
      startedAt: status === 'QUEUED' ? null : createdAt,
      completedAt: finished ? createdAt : null,
      failedAt: status === 'FAILED' ? createdAt : null,
      cancelledAt: status === 'CANCELLED' ? createdAt : null,
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      createdAt,
    },
  });
  await prisma.analysis.update({
    where: { id: analysis.id },
    data: { latestRunId: run.id, createdAt },
  });

  if (finished) {
    await seedScores(prisma, run.id, options);
  }
  for (const finding of options.findings ?? []) {
    await prisma.analysisFinding.create({
      data: {
        analysisRunId: run.id,
        ruleCode: finding.ruleCode,
        category: finding.category,
        severity: finding.severity,
        title: finding.title ?? finding.ruleCode,
        description: finding.description ?? `Description of ${finding.ruleCode}`,
        scoreImpact: finding.scoreImpact ?? 5,
        evidence: (finding.evidence ?? [
          { type: 'metric', metric: 'probe', value: 1, unit: 'x' },
        ]) as Prisma.InputJsonValue,
      },
    });
  }
  if (options.ai) {
    const aiStatus = options.aiStatus ?? 'COMPLETED';
    const completed = aiStatus === 'COMPLETED';
    await prisma.aiAnalysisResult.create({
      data: {
        analysisRunId: run.id,
        status: aiStatus,
        task: 'analysis_insights',
        provider: 'fake',
        model: 'fake-model',
        promptVersion: '1.0.0',
        schemaVersion: '1.0.0',
        summary: completed
          ? { headline: 'h', overview: 'o', strengths: ['s'], weaknesses: ['w'] }
          : null,
        recommendations: completed ? [] : null,
        totalTokens: 100,
      },
    });
  }
  return { analysisId: analysis.id, runId: run.id };
}

/** Convenience wrapper for the common "finished run" case. */
export async function seedCompletedRun(
  prisma: PrismaService,
  websiteId: string,
  options: SeedRunOptions = {},
): Promise<{ analysisId: string; runId: string }> {
  return seedRun(prisma, websiteId, { ...options, status: options.status ?? 'COMPLETED' });
}

async function seedScores(
  prisma: PrismaService,
  runId: string,
  options: SeedRunOptions,
): Promise<void> {
  const rows: Array<{ analysisRunId: string; category: string; score: number; weight: number | null }> = [];

  if (options.overall !== null) {
    rows.push({
      analysisRunId: runId,
      category: 'overall',
      score: options.overall ?? 87,
      weight: null,
    });
  }
  for (const category of DEFAULT_CATEGORY_SCORES) {
    const override = options.scores?.[category.category];
    if (override === null) continue;
    rows.push({
      analysisRunId: runId,
      category: category.category,
      score: override ?? category.score,
      weight: category.weight,
    });
  }
  rows.push(...Object.entries(options.scores ?? {})
    .filter(([category, score]) => score !== null && !isDefaultCategory(category))
    .map(([category, score]) => ({
      analysisRunId: runId,
      category,
      score: score as number,
      weight: null,
    })));

  if (rows.length > 0) {
    await prisma.analysisScore.createMany({ data: rows });
  }
}

function isDefaultCategory(category: string): boolean {
  return DEFAULT_CATEGORY_SCORES.some((entry) => entry.category === category);
}

function toAnalysisStatus(status: AnalysisRunStatus): AnalysisStatus {
  switch (status) {
    case 'QUEUED':
      return 'PENDING';
    case 'RUNNING':
      return 'RUNNING';
    case 'FAILED':
      return 'FAILED';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return 'COMPLETED';
  }
}
