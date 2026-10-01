import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { makeUser, registerAgent, type TestAgent } from './helpers/auth';
import { seedCompletedRun, seedProjectWithWebsite } from './helpers/seed';

const FINDINGS = [
  { ruleCode: 'SEO_TITLE_TOO_LONG', category: 'seo', severity: 'low', title: 'Long title', scoreImpact: 3 },
  { ruleCode: 'SEO_META_DESCRIPTION_MISSING', category: 'seo', severity: 'high', title: 'Missing meta', scoreImpact: 10 },
  { ruleCode: 'TECH_SECURITY_HEADER_MISSING', category: 'technical', severity: 'high', title: 'Headers missing', scoreImpact: 10 },
  { ruleCode: 'CONTENT_LOW_TEXT_LENGTH', category: 'content', severity: 'medium', title: 'Low text', scoreImpact: 8 },
  { ruleCode: 'A11Y_IMAGE_ALT_MISSING', category: 'accessibility', severity: 'medium', title: 'No alt', scoreImpact: 6 },
  { ruleCode: 'PERF_HTML_TOO_LARGE', category: 'performance', severity: 'low', title: 'Large html', scoreImpact: 4 },
];

describe('dashboard API', () => {
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

  it('returns zeroed overview for an empty account', async () => {
    const response = await agent.get('/api/v1/dashboard/overview').expect(200);
    expect(response.body).toEqual({
      totalProjects: 0,
      totalWebsites: 0,
      totalAnalyses: 0,
      completedAnalyses: 0,
      failedAnalyses: 0,
      averageScore: null,
    });
  });

  it('aggregates projects, websites, analyses and the average score', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    await seedCompletedRun(prisma, websiteId, { overall: 87 });
    const second = await agent
      .post('/api/v1/projects')
      .send({ name: 'Second' })
      .expect(201);
    await agent
      .post(`/api/v1/projects/${second.body.id}/websites`)
      .send({ name: 'Other', url: 'https://other.example.com' })
      .expect(201);

    const response = await agent.get('/api/v1/dashboard/overview').expect(200);
    expect(response.body).toMatchObject({
      totalProjects: 2,
      totalWebsites: 2,
      totalAnalyses: 1,
      completedAnalyses: 1,
      failedAnalyses: 0,
      averageScore: 87,
    });
  });

  it('averages across multiple completed analyses and counts failures', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    await seedCompletedRun(prisma, websiteId, { overall: 80 });
    await seedCompletedRun(prisma, websiteId, { overall: 90 });
    await prisma.analysis.create({ data: { websiteId, status: 'FAILED' } });

    const response = await agent.get('/api/v1/dashboard/overview').expect(200);
    expect(response.body).toMatchObject({
      totalAnalyses: 3,
      completedAnalyses: 2,
      failedAnalyses: 1,
      averageScore: 85,
    });
  });

  it('aggregates top issues across runs ordered by count', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    await seedCompletedRun(prisma, websiteId, {
      findings: [FINDINGS[0], FINDINGS[1], FINDINGS[2]],
    });
    await seedCompletedRun(prisma, websiteId, {
      findings: [FINDINGS[1], FINDINGS[2]],
    });

    const response = await agent.get('/api/v1/dashboard/top-issues').expect(200);
    expect(response.body.items[0]).toMatchObject({ ruleCode: 'SEO_META_DESCRIPTION_MISSING', count: 2 });
    expect(response.body.items[1]).toMatchObject({ ruleCode: 'TECH_SECURITY_HEADER_MISSING', count: 2 });
    expect(response.body.items[2]).toMatchObject({ ruleCode: 'SEO_TITLE_TOO_LONG', count: 1 });
    expect(response.body.items[0].title).toBeTruthy();
    expect(response.body.items[0].category).toBe('seo');
  });

  it('projects activity events across types, newest first', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const { analysisId } = await seedCompletedRun(prisma, websiteId, { ai: true });

    const response = await agent.get('/api/v1/dashboard/activity').expect(200);
    const types = response.body.items.map((item: { type: string }) => item.type);
    expect(types).toContain('project_created');
    expect(types).toContain('website_added');
    expect(types).toContain('analysis_completed');
    expect(types).toContain('ai_insights_generated');

    // Newest first.
    const timestamps = response.body.items.map((item: { timestamp: string }) => item.timestamp);
    const sorted = [...timestamps].sort((a, b) => b.localeCompare(a));
    expect(timestamps).toEqual(sorted);

    const aiEvent = response.body.items.find(
      (item: { type: string }) => item.type === 'ai_insights_generated',
    );
    expect(aiEvent.analysisId).toBe(analysisId);
  });

  it('isolates dashboard data between users', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    await seedCompletedRun(prisma, websiteId, { findings: [FINDINGS[1]] });

    const other = (await registerAgent(app, makeUser(1))).agent;
    const overview = await other.get('/api/v1/dashboard/overview').expect(200);
    expect(overview.body.totalProjects).toBe(0);
    expect(overview.body.totalWebsites).toBe(0);
    expect(overview.body.totalAnalyses).toBe(0);

    const issues = await other.get('/api/v1/dashboard/top-issues').expect(200);
    expect(issues.body.items).toHaveLength(0);
    const activity = await other.get('/api/v1/dashboard/activity').expect(200);
    expect(activity.body.items).toHaveLength(0);
  });
});

describe('website trends and history API', () => {
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

  it('returns an empty trend list when no runs completed', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const response = await agent.get(`/api/v1/websites/${websiteId}/trends`).expect(200);
    expect(response.body).toEqual([]);
  });

  it('returns one point per completed run with all category scores', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    await seedCompletedRun(prisma, websiteId, { overall: 70 });
    await seedCompletedRun(prisma, websiteId, { overall: 87 });

    const response = await agent.get(`/api/v1/websites/${websiteId}/trends`).expect(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0].overall).toBe(70);
    expect(response.body[1].overall).toBe(87);
    expect(response.body[1]).toMatchObject({
      seo: 78,
      technical: 86,
      content: 84,
      accessibility: 96,
      performance: 96,
    });
    expect(response.body[0].createdAt < response.body[1].createdAt).toBe(true);
  });

  it('pages the analysis history newest first with AI status', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const first = await seedCompletedRun(prisma, websiteId, { overall: 70 });
    const second = await seedCompletedRun(prisma, websiteId, { overall: 87, ai: true });
    // One pending analysis on top.
    const pending = await prisma.analysis.create({ data: { websiteId, status: 'PENDING' } });

    const response = await agent
      .get(`/api/v1/websites/${websiteId}/analyses?page=1&limit=2`)
      .expect(200);
    expect(response.body.total).toBe(3);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.page).toBe(1);
    expect(response.body.limit).toBe(2);
    // Newest first: the pending analysis is newest.
    expect(response.body.items[0].id).toBe(pending.id);
    expect(response.body.items[0].aiStatus).toBeNull();
    expect(response.body.items[1].id).toBe(second.analysisId);
    expect(response.body.items[1].overallScore).toBe(87);
    expect(response.body.items[1].aiStatus).toBe('completed');

    const page2 = await agent
      .get(`/api/v1/websites/${websiteId}/analyses?page=2&limit=2`)
      .expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.items[0].id).toBe(first.analysisId);
  });

  it('hides other users trends and history (404)', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const other = (await registerAgent(app, makeUser(1))).agent;
    await other.get(`/api/v1/websites/${websiteId}/trends`).expect(404);
    await other.get(`/api/v1/websites/${websiteId}/analyses`).expect(404);
  });
});

describe('findings explorer API', () => {
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

  it('returns an empty page when the analysis has no runs', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const analysis = await prisma.analysis.create({ data: { websiteId } });
    const response = await agent
      .get(`/api/v1/analyses/${analysis.id}/findings`)
      .expect(200);
    expect(response.body).toEqual({ items: [], total: 0, page: 1, limit: 20 });
  });

  it('lists findings of the latest run with default severity ordering', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const { analysisId } = await seedCompletedRun(prisma, websiteId, { findings: FINDINGS });

    const response = await agent.get(`/api/v1/analyses/${analysisId}/findings`).expect(200);
    expect(response.body.total).toBe(6);
    expect(response.body.page).toBe(1);
    expect(response.body.limit).toBe(20);
    // Severity order: high first, then medium, then low.
    expect(response.body.items[0].ruleCode).toBe('SEO_META_DESCRIPTION_MISSING');
    expect(response.body.items[2].severity).toBe('medium');
    expect(response.body.items[4].severity).toBe('low');
  });

  it('filters by severity and category', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const { analysisId } = await seedCompletedRun(prisma, websiteId, { findings: FINDINGS });

    const high = await agent
      .get(`/api/v1/analyses/${analysisId}/findings?severity=high`)
      .expect(200);
    expect(high.body.total).toBe(2);
    expect(high.body.items.every((item: { severity: string }) => item.severity === 'high')).toBe(true);

    const seo = await agent
      .get(`/api/v1/analyses/${analysisId}/findings?category=seo`)
      .expect(200);
    expect(seo.body.total).toBe(2);
    expect(seo.body.items.every((item: { category: string }) => item.category === 'seo')).toBe(true);
  });

  it('searches rule codes, titles and descriptions case-insensitively', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const { analysisId } = await seedCompletedRun(prisma, websiteId, { findings: FINDINGS });

    const byCode = await agent
      .get(`/api/v1/analyses/${analysisId}/findings?search=seo_meta`)
      .expect(200);
    expect(byCode.body.total).toBe(1);
    expect(byCode.body.items[0].ruleCode).toBe('SEO_META_DESCRIPTION_MISSING');

    const byTitle = await agent
      .get(`/api/v1/analyses/${analysisId}/findings?search=headers`)
      .expect(200);
    expect(byTitle.body.total).toBe(1);
    expect(byTitle.body.items[0].ruleCode).toBe('TECH_SECURITY_HEADER_MISSING');

    const none = await agent
      .get(`/api/v1/analyses/${analysisId}/findings?search=zzz-nothing`)
      .expect(200);
    expect(none.body.total).toBe(0);
  });

  it('sorts by impact and paginates', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const { analysisId } = await seedCompletedRun(prisma, websiteId, { findings: FINDINGS });

    const byImpact = await agent
      .get(`/api/v1/analyses/${analysisId}/findings?sort=impact`)
      .expect(200);
    expect(byImpact.body.items[0].scoreImpact).toBe(10);
    expect(byImpact.body.items[1].scoreImpact).toBe(10);

    const page1 = await agent
      .get(`/api/v1/analyses/${analysisId}/findings?page=1&limit=2`)
      .expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.total).toBe(6);

    const page2 = await agent
      .get(`/api/v1/analyses/${analysisId}/findings?page=3&limit=2`)
      .expect(200);
    expect(page2.body.items).toHaveLength(2);
    // No overlap between pages.
    const ids = [...page1.body.items.map((i: { id: string }) => i.id), ...page2.body.items.map((i: { id: string }) => i.id)];
    expect(new Set(ids).size).toBe(4);
  });

  it('rejects invalid filter values', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const { analysisId } = await seedCompletedRun(prisma, websiteId, { findings: FINDINGS });

    await agent.get(`/api/v1/analyses/${analysisId}/findings?severity=urgent`).expect(400);
    await agent.get(`/api/v1/analyses/${analysisId}/findings?category=marketing`).expect(400);
    await agent.get(`/api/v1/analyses/${analysisId}/findings?sort=bogus`).expect(400);
    await agent.get(`/api/v1/analyses/${analysisId}/findings?limit=5000`).expect(400);
  });

  it('hides other users findings (404)', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const { analysisId } = await seedCompletedRun(prisma, websiteId, { findings: FINDINGS });
    const other = (await registerAgent(app, makeUser(1))).agent;
    await other.get(`/api/v1/analyses/${analysisId}/findings`).expect(404);
  });
});