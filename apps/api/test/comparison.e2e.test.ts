import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { makeUser, registerAgent, type TestAgent } from './helpers/auth';
import { seedProjectWithWebsite, seedRun } from './helpers/seed';

const LEFT_SCORES = { seo: 72, technical: 79, content: 81, accessibility: 94, performance: 91 };
const RIGHT_SCORES = { seo: 78, technical: 86, content: 84, accessibility: 96, performance: 96 };

const LEFT_FINDINGS = [
  {
    ruleCode: 'SEO_META_DESCRIPTION_MISSING',
    category: 'seo',
    severity: 'high',
    title: 'Meta description is missing',
    scoreImpact: 10,
  },
  {
    ruleCode: 'TECH_SECURITY_HEADER_MISSING',
    category: 'technical',
    severity: 'high',
    title: 'Security headers are missing',
    scoreImpact: 10,
  },
  {
    ruleCode: 'CONTENT_LOW_TEXT_LENGTH',
    category: 'content',
    severity: 'low',
    title: 'Low content length',
    scoreImpact: 8,
  },
];

const RIGHT_FINDINGS = [
  // Present in both, less severe → improved.
  {
    ruleCode: 'TECH_SECURITY_HEADER_MISSING',
    category: 'technical',
    severity: 'medium',
    title: 'Security headers are missing',
    scoreImpact: 10,
  },
  // Present in both, more severe → regressed.
  {
    ruleCode: 'CONTENT_LOW_TEXT_LENGTH',
    category: 'content',
    severity: 'medium',
    title: 'Low content length',
    scoreImpact: 8,
  },
  // Only in the current run → new.
  {
    ruleCode: 'A11Y_IMAGE_ALT_MISSING',
    category: 'accessibility',
    severity: 'medium',
    title: 'Images are missing alt text',
    scoreImpact: 6,
  },
];

describe('comparison API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agent: TestAgent;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');
    agent = (await registerAgent(app, makeUser())).agent;
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedPair(websiteId: string) {
    const left = await seedRun(prisma, websiteId, {
      overall: 72,
      scores: LEFT_SCORES,
      findings: LEFT_FINDINGS,
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
    });
    const right = await seedRun(prisma, websiteId, {
      overall: 87,
      scores: RIGHT_SCORES,
      findings: RIGHT_FINDINGS,
      createdAt: new Date('2026-09-06T10:00:00.000Z'),
    });
    return { left, right };
  }

  it('compares two completed runs with score deltas and a finding diff', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const { left, right } = await seedPair(websiteId);

    const response = await agent
      .get(`/api/v1/analyses/compare?leftRunId=${left.runId}&rightRunId=${right.runId}`)
      .expect(200);

    expect(response.body.left).toMatchObject({
      runId: left.runId,
      analysisId: left.analysisId,
      status: 'completed',
      overall: 72,
    });
    expect(response.body.right).toMatchObject({ runId: right.runId, overall: 87 });
    expect(response.body.scoreChanges).toEqual([
      { category: 'overall', left: 72, right: 87, delta: 15 },
      { category: 'seo', left: 72, right: 78, delta: 6 },
      { category: 'technical', left: 79, right: 86, delta: 7 },
      { category: 'content', left: 81, right: 84, delta: 3 },
      { category: 'accessibility', left: 94, right: 96, delta: 2 },
      { category: 'performance', left: 91, right: 96, delta: 5 },
    ]);
    expect(response.body.findingChanges.resolved.map((f: { ruleCode: string }) => f.ruleCode)).toEqual([
      'SEO_META_DESCRIPTION_MISSING',
    ]);
    expect(response.body.findingChanges.new.map((f: { ruleCode: string }) => f.ruleCode)).toEqual([
      'A11Y_IMAGE_ALT_MISSING',
    ]);
    // Both unchanged findings share the same (medium) severity, so the stable
    // tie-break is the rule code.
    expect(
      response.body.findingChanges.unchanged.map((f: { ruleCode: string }) => f.ruleCode),
    ).toEqual(['CONTENT_LOW_TEXT_LENGTH', 'TECH_SECURITY_HEADER_MISSING']);
    expect(response.body.summary).toEqual({
      newCount: 1,
      resolvedCount: 1,
      unchangedCount: 2,
      improvedCount: 1,
      regressedCount: 1,
    });
  });

  it('reports deterministic severity transitions for unchanged findings', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const { left, right } = await seedPair(websiteId);

    const response = await agent
      .get(`/api/v1/analyses/compare?leftRunId=${left.runId}&rightRunId=${right.runId}`)
      .expect(200);
    const byCode = Object.fromEntries(
      response.body.findingChanges.unchanged.map((finding: { ruleCode: string }) => [
        finding.ruleCode,
        finding,
      ]),
    );

    expect(byCode.TECH_SECURITY_HEADER_MISSING).toMatchObject({
      change: 'unchanged',
      leftSeverity: 'high',
      rightSeverity: 'medium',
      severityChange: 'improved',
    });
    expect(byCode.CONTENT_LOW_TEXT_LENGTH).toMatchObject({
      leftSeverity: 'low',
      rightSeverity: 'medium',
      severityChange: 'regressed',
    });
    // New and resolved findings never carry a severity transition.
    expect(response.body.findingChanges.new[0].severityChange).toBeNull();
    expect(response.body.findingChanges.new[0].leftSeverity).toBeNull();
    expect(response.body.findingChanges.resolved[0].severityChange).toBeNull();
    expect(response.body.findingChanges.resolved[0].rightSeverity).toBeNull();
  });

  it('accepts partially completed runs as comparable', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const left = await seedRun(prisma, websiteId, {
      status: 'PARTIALLY_COMPLETED',
      findings: LEFT_FINDINGS,
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
    });
    const right = await seedRun(prisma, websiteId, {
      status: 'PARTIALLY_COMPLETED',
      findings: RIGHT_FINDINGS,
      createdAt: new Date('2026-09-06T10:00:00.000Z'),
    });

    const response = await agent
      .get(`/api/v1/analyses/compare?leftRunId=${left.runId}&rightRunId=${right.runId}`)
      .expect(200);
    expect(response.body.left.status).toBe('partially_completed');
    expect(response.body.right.status).toBe('partially_completed');
  });

  it('rejects selecting the same run twice', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const { left } = await seedPair(websiteId);

    const response = await agent
      .get(`/api/v1/analyses/compare?leftRunId=${left.runId}&rightRunId=${left.runId}`)
      .expect(400);
    expect(response.body.error.code).toBe('COMPARISON_SAME_RUN');
  });

  it('rejects runs that belong to different websites', async () => {
    const first = await seedProjectWithWebsite(agent, 'First');
    const second = await seedProjectWithWebsite(agent, 'Second');
    const left = await seedRun(prisma, first.websiteId, { findings: [] });
    const right = await seedRun(prisma, second.websiteId, { findings: [] });

    const response = await agent
      .get(`/api/v1/analyses/compare?leftRunId=${left.runId}&rightRunId=${right.runId}`)
      .expect(400);
    expect(response.body.error.code).toBe('COMPARISON_DIFFERENT_WEBSITE');
  });

  it.each(['QUEUED', 'RUNNING', 'FAILED', 'CANCELLED'] as const)(
    'rejects a %s run as not comparable',
    async (status) => {
      const { websiteId } = await seedProjectWithWebsite(agent);
      const completed = await seedRun(prisma, websiteId, {
        findings: LEFT_FINDINGS,
        createdAt: new Date('2026-09-01T10:00:00.000Z'),
      });
      const other = await seedRun(prisma, websiteId, {
        status,
        findings: RIGHT_FINDINGS,
        createdAt: new Date('2026-09-06T10:00:00.000Z'),
      });

      const response = await agent
        .get(`/api/v1/analyses/compare?leftRunId=${other.runId}&rightRunId=${completed.runId}`)
        .expect(409);
      expect(response.body.error.code).toBe('RUN_NOT_COMPARABLE');
    },
  );

  it('returns 404 for a run that does not exist', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const { left } = await seedPair(websiteId);

    await agent
      .get(
        `/api/v1/analyses/compare?leftRunId=${left.runId}&rightRunId=11111111-2222-3333-4444-555555555555`,
      )
      .expect(404);
  });

  it('hides other users runs behind a 404', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const { left, right } = await seedPair(websiteId);

    const other = (await registerAgent(app, makeUser(1))).agent;
    await other
      .get(`/api/v1/analyses/compare?leftRunId=${left.runId}&rightRunId=${right.runId}`)
      .expect(404);
    // One foreign run is enough to fail the whole comparison.
    await other
      .get(`/api/v1/analyses/compare?leftRunId=${left.runId}&rightRunId=${left.runId}`)
      .expect(404);
  });

  it('validates the query parameters', async () => {
    await agent.get('/api/v1/analyses/compare').expect(400);
    await agent.get('/api/v1/analyses/compare?leftRunId=abc').expect(400);
    const { websiteId } = await seedProjectWithWebsite(agent);
    const { left, right } = await seedPair(websiteId);
    await agent
      .get(
        `/api/v1/analyses/compare?leftRunId=${left.runId}&rightRunId=${right.runId}&bogus=1`,
      )
      .expect(400);
  });

  it('does not shadow the parameterized analysis route', async () => {
    // `/analyses/compare` must resolve to the comparison endpoint, not to
    // `GET /analyses/:id` with id="compare".
    const response = await agent.get('/api/v1/analyses/compare').expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
