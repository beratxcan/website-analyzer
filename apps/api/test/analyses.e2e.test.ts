import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { ANALYSIS_QUEUE } from '../src/queue/queue.constants';
import { createTestApp } from './helpers/app';
import { makeUser, registerAgent, type TestAgent } from './helpers/auth';

async function createWebsite(agent: TestAgent): Promise<{ projectId: string; websiteId: string }> {
  const project = await agent
    .post('/api/v1/projects')
    .send({ name: 'Analysis Project' })
    .expect(201);
  const website = await agent
    .post(`/api/v1/projects/${project.body.id}/websites`)
    .send({ name: 'Example', url: 'https://example.com' })
    .expect(201);
  return { projectId: project.body.id as string, websiteId: website.body.id as string };
}

describe('analyses API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agent: TestAgent;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');
    const registration = await registerAgent(app, makeUser());
    agent = registration.agent;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an analysis and enqueues a queue job without running the engine', async () => {
    const { websiteId } = await createWebsite(agent);

    const response = await agent
      .post('/api/v1/analyses')
      .send({ websiteId })
      .expect(201);

    expect(response.body.analysis.id).toBeTruthy();
    expect(response.body.analysis.websiteId).toBe(websiteId);
    expect(response.body.analysis.status).toBe('pending');
    expect(response.body.run.id).toBeTruthy();
    expect(response.body.run.status).toBe('queued');
    expect(response.body.run.attempt).toBe(0);
    expect(response.body.run.progress).toBe(0);
    expect(response.body.run.engineVersion).toBe('1.0.0');

    const run = await prisma.analysisRun.findUnique({ where: { id: response.body.run.id } });
    expect(run?.status).toBe('QUEUED');
    expect(run?.engineVersion).toBe('1.0.0');

    // The job exists in Redis with the deterministic jobId (= runId) and only references.
    const queue = app.get(ANALYSIS_QUEUE);
    const job = await queue.getJob(response.body.run.id as string);
    expect(job?.name).toBe('analysis.execute');
    expect(job?.data).toEqual({ analysisId: response.body.analysis.id, runId: response.body.run.id });
    expect(job?.opts.attempts).toBe(3);
  });

  it('lists analyses for the current user with the latest score', async () => {
    const { websiteId } = await createWebsite(agent);
    const { body } = await agent.post('/api/v1/analyses').send({ websiteId }).expect(201);
    await prisma.analysis.update({
      where: { id: body.analysis.id },
      data: { latestRunId: body.run.id, status: 'COMPLETED' },
    });
    await prisma.analysisScore.create({
      data: { analysisRunId: body.run.id, category: 'overall', score: 87 },
    });

    const list = await agent.get('/api/v1/analyses').expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      id: body.analysis.id,
      status: 'completed',
      latestScore: 87,
      website: { name: 'Example' },
    });
  });

  it('gets an analysis by id', async () => {
    const { websiteId } = await createWebsite(agent);
    const { body } = await agent.post('/api/v1/analyses').send({ websiteId }).expect(201);

    const response = await agent.get(`/api/v1/analyses/${body.analysis.id}`).expect(200);
    expect(response.body.id).toBe(body.analysis.id);
    expect(response.body.website.host).toBe('example.com');
  });

  it('lists runs and returns run details with findings and scores', async () => {
    const { websiteId } = await createWebsite(agent);
    const { body } = await agent.post('/api/v1/analyses').send({ websiteId }).expect(201);
    const runId = body.run.id as string;
    const analysisId = body.analysis.id as string;

    // Simulate a completed run with persisted results.
    await prisma.analysisRun.update({
      where: { id: runId },
      data: { status: 'COMPLETED', attempt: 1, progress: 100, completedAt: new Date(), startedAt: new Date() },
    });
    await prisma.analysis.update({
      where: { id: analysisId },
      data: { status: 'COMPLETED', latestRunId: runId },
    });
    await prisma.analysisFinding.create({
      data: {
        analysisRunId: runId,
        ruleCode: 'SEO_TITLE_TOO_LONG',
        category: 'seo',
        severity: 'low',
        title: 'Long title',
        description: 'desc',
        scoreImpact: 3,
        evidence: [{ type: 'metric', metric: 'title_length', value: 65, unit: 'chars' }],
      },
    });

    const runs = await agent.get(`/api/v1/analyses/${analysisId}/runs`).expect(200);
    expect(runs.body.items).toHaveLength(1);
    expect(runs.body.items[0].status).toBe('completed');

    const detail = await agent.get(`/api/v1/analyses/${analysisId}/runs/${runId}`).expect(200);
    expect(detail.body.status).toBe('completed');
    expect(detail.body.progress).toBe(100);
    expect(detail.body.findings).toHaveLength(1);
    expect(detail.body.findings[0].ruleCode).toBe('SEO_TITLE_TOO_LONG');
    expect(detail.body.findings[0].evidence).toEqual([
      { type: 'metric', metric: 'title_length', value: 65, unit: 'chars' },
    ]);
    // No AI enrichment has run yet for this queued analysis.
    expect(detail.body.ai).toBeNull();
  });

  it('exposes the AI enrichment result (status, summary, usage, versions) on the run detail', async () => {
    const { websiteId } = await createWebsite(agent);
    const { body } = await agent.post('/api/v1/analyses').send({ websiteId }).expect(201);
    const runId = body.run.id as string;
    const analysisId = body.analysis.id as string;

    await prisma.analysisRun.update({
      where: { id: runId },
      data: { status: 'COMPLETED', attempt: 1, progress: 100, completedAt: new Date() },
    });
    await prisma.analysis.update({
      where: { id: analysisId },
      data: { status: 'COMPLETED', latestRunId: runId },
    });
    await prisma.aiAnalysisResult.create({
      data: {
        analysisRunId: runId,
        status: 'COMPLETED',
        task: 'analysis_insights',
        provider: 'openai-compatible',
        model: 'gpt-4o-mini',
        promptVersion: '1.0.0',
        schemaVersion: '1.0.0',
        summary: {
          headline: 'Good baseline',
          overview: 'Overview text',
          strengths: ['A'],
          weaknesses: ['B'],
        },
        recommendations: [
          {
            title: 'Add a meta description',
            description: 'Write one.',
            priority: 'high',
            effort: 'low',
            impact: 'high',
            category: 'seo',
            relatedFindingCodes: ['SEO_TITLE_TOO_LONG'],
          },
        ],
        inputTokens: 120,
        outputTokens: 240,
        totalTokens: 360,
        estimatedCostUsd: 0.0002,
        currency: 'USD',
        latencyMs: 55,
      },
    });

    const detail = await agent.get(`/api/v1/analyses/${analysisId}/runs/${runId}`).expect(200);
    expect(detail.body.ai).toMatchObject({
      status: 'completed',
      provider: 'openai-compatible',
      model: 'gpt-4o-mini',
      promptVersion: '1.0.0',
      schemaVersion: '1.0.0',
      totalTokens: 360,
      estimatedCostUsd: 0.0002,
    });
    expect(detail.body.ai.summary.headline).toBe('Good baseline');
    expect(detail.body.ai.recommendations[0].relatedFindingCodes).toEqual(['SEO_TITLE_TOO_LONG']);
    expect(detail.body.ai.createdAt).toBeTruthy();
  });

  it('exposes a failed AI state without touching the completed run status', async () => {
    const { websiteId } = await createWebsite(agent);
    const { body } = await agent.post('/api/v1/analyses').send({ websiteId }).expect(201);
    const runId = body.run.id as string;
    const analysisId = body.analysis.id as string;

    await prisma.analysisRun.update({
      where: { id: runId },
      data: { status: 'COMPLETED', attempt: 1, progress: 100, completedAt: new Date() },
    });
    await prisma.analysis.update({
      where: { id: analysisId },
      data: { status: 'COMPLETED', latestRunId: runId },
    });
    await prisma.aiAnalysisResult.create({
      data: {
        analysisRunId: runId,
        status: 'FAILED',
        task: 'analysis_insights',
        errorCode: 'AI_CONFIG_INVALID',
        errorMessage: 'No API key configured',
      },
    });

    const detail = await agent.get(`/api/v1/analyses/${analysisId}/runs/${runId}`).expect(200);
    expect(detail.body.status).toBe('completed');
    expect(detail.body.ai.status).toBe('failed');
    expect(detail.body.ai.errorCode).toBe('AI_CONFIG_INVALID');
    expect(detail.body.ai.summary).toBeNull();
  });

  it('cancels a pending analysis', async () => {
    const { websiteId } = await createWebsite(agent);
    const { body } = await agent.post('/api/v1/analyses').send({ websiteId }).expect(201);

    const cancelled = await agent.post(`/api/v1/analyses/${body.analysis.id}/cancel`).expect(200);
    expect(cancelled.body.analysis.status).toBe('cancelled');

    const run = await prisma.analysisRun.findUnique({ where: { id: body.run.id } });
    expect(run?.status).toBe('CANCELLED');
    expect(run?.cancelledAt).not.toBeNull();
  });

  it('is idempotent when cancelling an already-cancelled analysis', async () => {
    const { websiteId } = await createWebsite(agent);
    const { body } = await agent.post('/api/v1/analyses').send({ websiteId }).expect(201);

    await agent.post(`/api/v1/analyses/${body.analysis.id}/cancel`).expect(200);
    await agent.post(`/api/v1/analyses/${body.analysis.id}/cancel`).expect(200);
  });

  it('rejects cancelling a completed analysis', async () => {
    const { websiteId } = await createWebsite(agent);
    const { body } = await agent.post('/api/v1/analyses').send({ websiteId }).expect(201);
    await prisma.analysis.update({ where: { id: body.analysis.id }, data: { status: 'COMPLETED' } });

    const response = await agent.post(`/api/v1/analyses/${body.analysis.id}/cancel`).expect(409);
    expect(response.body.error.code).toBe('ANALYSIS_NOT_CANCELLABLE');
  });

  it('rejects an invalid website id', async () => {
    const response = await agent
      .post('/api/v1/analyses')
      .send({ websiteId: 'does-not-exist' })
      .expect(404);
    expect(response.body.error.code).toBe('WEBSITE_NOT_FOUND');
  });

  it('rejects a website owned by another user', async () => {
    const other = await registerAgent(app, makeUser(1));
    const { websiteId } = await createWebsite(other.agent);

    const response = await agent.post('/api/v1/analyses').send({ websiteId }).expect(404);
    expect(response.body.error.code).toBe('WEBSITE_NOT_FOUND');
  });

  it('hides other users analyses (404) for every resource endpoint', async () => {
    const { websiteId } = await createWebsite(agent);
    const { body } = await agent.post('/api/v1/analyses').send({ websiteId }).expect(201);

    const other = await registerAgent(app, makeUser(2));
    await other.agent.get(`/api/v1/analyses/${body.analysis.id}`).expect(404);
    await other.agent.get(`/api/v1/analyses/${body.analysis.id}/runs`).expect(404);
    await other.agent.get(`/api/v1/analyses/${body.analysis.id}/runs/${body.run.id}`).expect(404);
    await other.agent.post(`/api/v1/analyses/${body.analysis.id}/cancel`).expect(404);

    const list = await other.agent.get('/api/v1/analyses').expect(200);
    expect(list.body.items).toHaveLength(0);
  });

  it('requires a valid websiteId in the request body', async () => {
    await agent.post('/api/v1/analyses').send({}).expect(400);
    await agent.post('/api/v1/analyses').send({ websiteId: 123 }).expect(400);
  });
});