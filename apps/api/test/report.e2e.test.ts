import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Response } from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { makeUser, registerAgent, type TestAgent } from './helpers/auth';
import { seedProjectWithWebsite, seedRun } from './helpers/seed';

const RUN_DATE = new Date('2026-09-06T08:00:00.000Z');
const BASELINE_DATE = new Date('2026-09-01T08:00:00.000Z');

const FINDINGS = [
  {
    ruleCode: 'TECH_SECURITY_HEADER_MISSING',
    category: 'technical',
    severity: 'high',
    title: 'Security headers are missing',
    description: 'Response is missing recommended security headers.',
    scoreImpact: 10,
  },
  {
    ruleCode: 'CONTENT_LOW_TEXT_LENGTH',
    category: 'content',
    severity: 'medium',
    title: 'Low content length',
    description: 'The page has little unique text.',
    scoreImpact: 8,
  },
  {
    ruleCode: 'PERF_HTML_TOO_LARGE',
    category: 'performance',
    severity: 'low',
    title: 'HTML payload is large',
    description: 'The HTML document is larger than recommended.',
    scoreImpact: 4,
  },
];

function pdfBody(response: Response): Buffer {
  const body = response.body as unknown;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body, 'latin1');
  throw new Error(`Unexpected PDF response body: ${Object.prototype.toString.call(body)}`);
}

describe('analysis report API', () => {
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

  async function seedAnalysableRun(options: Parameters<typeof seedRun>[2] = {}) {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const run = await seedRun(prisma, websiteId, {
      findings: FINDINGS,
      ai: true,
      createdAt: RUN_DATE,
      ...options,
    });
    return { websiteId, ...run };
  }

  it('returns the report document of the latest completed run', async () => {
    const { analysisId, runId } = await seedAnalysableRun();

    const response = await agent.get(`/api/v1/analyses/${analysisId}/report`).expect(200);
    const report = response.body;

    expect(report.metadata).toMatchObject({
      title: 'Website Analysis Report',
      websiteName: 'Example',
      websiteHost: 'example.com',
      websiteUrl: 'https://example.com',
      analysisDate: RUN_DATE.toISOString(),
      analysisId,
      runId,
      runStatus: 'completed',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      aiStatus: 'completed',
    });
    expect(report.scoreSummary.overall).toBe(87);
    expect(report.scoreSummary.categories.map((score: { category: string }) => score.category)).toEqual([
      'seo',
      'technical',
      'content',
      'accessibility',
      'performance',
    ]);
    expect(report.criticalFindings.map((f: { ruleCode: string }) => f.ruleCode)).toEqual([
      'TECH_SECURITY_HEADER_MISSING',
    ]);
    expect(report.additionalFindings.map((f: { ruleCode: string }) => f.ruleCode)).toEqual([
      'CONTENT_LOW_TEXT_LENGTH',
    ]);
    // Low severity findings are intentionally not part of the report.
    expect(
      [...report.criticalFindings, ...report.additionalFindings].some(
        (finding: { severity: string }) => finding.severity === 'low',
      ),
    ).toBe(false);
    expect(report.comparison).toBeNull();
  });

  it('uses the AI summary and recommendations when available', async () => {
    const { analysisId } = await seedAnalysableRun();

    const response = await agent.get(`/api/v1/analyses/${analysisId}/report`).expect(200);
    expect(response.body.executiveSummary).toMatchObject({ source: 'ai', headline: 'h', overview: 'o' });
  });

  it('falls back to a deterministic summary without AI', async () => {
    const { analysisId } = await seedAnalysableRun({ ai: false });

    const response = await agent.get(`/api/v1/analyses/${analysisId}/report`).expect(200);
    const report = response.body;

    expect(report.metadata.aiStatus).toBeNull();
    expect(report.executiveSummary.source).toBe('deterministic');
    expect(report.executiveSummary.headline).toBe('example.com scored 87/100');
    expect(report.recommendations).toEqual([]);
  });

  it('does not block the report when AI failed', async () => {
    const { analysisId } = await seedAnalysableRun({ ai: true, aiStatus: 'FAILED' });

    const response = await agent.get(`/api/v1/analyses/${analysisId}/report`).expect(200);
    expect(response.body.metadata.aiStatus).toBe('failed');
    expect(response.body.executiveSummary.source).toBe('deterministic');
    expect(response.body.recommendations).toEqual([]);
  });

  it('keeps internal AI bookkeeping out of the report payload', async () => {
    const { analysisId } = await seedAnalysableRun();

    const response = await agent.get(`/api/v1/analyses/${analysisId}/report`).expect(200);
    const serialized = JSON.stringify(response.body);

    for (const forbidden of ['inputTokens', 'outputTokens', 'totalTokens', 'estimatedCostUsd', 'provider', 'errorMessage']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('sanitizes untrusted evidence text', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const { analysisId } = await seedRun(prisma, websiteId, {
      createdAt: RUN_DATE,
      findings: [
        {
          ruleCode: 'XSS_ATTEMPT',
          category: 'technical',
          severity: 'critical',
          title: '</text><script>alert(1)</script>',
          description: 'İçerik ğüşiöç 🚀',
          scoreImpact: 99,
          evidence: [{ type: 'text', text: 'İçerik\u0007 <script>alert(1)</script> 🚀' }],
        },
      ],
    });

    const response = await agent.get(`/api/v1/analyses/${analysisId}/report`).expect(200);
    const finding = response.body.criticalFindings[0];

    // Control characters and unencodable glyphs are stripped; markup is kept as
    // literal text and is never interpreted.
    expect(finding.evidence).toEqual(['Içerik <script>alert(1)</script>']);
    expect(finding.title).toBe('</text><script>alert(1)</script>');
  });

  it('renders the analysis PDF with correct headers and a safe filename', async () => {
    const { analysisId } = await seedAnalysableRun();

    const response = await agent
      .get(`/api/v1/analyses/${analysisId}/report.pdf`)
      .buffer(true)
      .expect(200);

    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="example-com-analysis-2026-09-06.pdf"',
    );
    const body = pdfBody(response);
    expect(body.byteLength).toBeGreaterThan(1_000);
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('renders a comparison report PDF from two runs', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const baseline = await seedRun(prisma, websiteId, {
      overall: 72,
      findings: [
        {
          ruleCode: 'SEO_META_DESCRIPTION_MISSING',
          category: 'seo',
          severity: 'high',
          title: 'Meta description is missing',
          scoreImpact: 10,
        },
      ],
      createdAt: BASELINE_DATE,
    });
    const current = await seedRun(prisma, websiteId, {
      findings: FINDINGS,
      ai: true,
      createdAt: RUN_DATE,
    });

    const response = await agent
      .get(
        `/api/v1/analyses/compare/report.pdf?leftRunId=${baseline.runId}&rightRunId=${current.runId}`,
      )
      .buffer(true)
      .expect(200);

    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="example-com-comparison-2026-09-06.pdf"',
    );
    const body = pdfBody(response);
    expect(body.byteLength).toBeGreaterThan(1_000);
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('rejects an incomparable pair in the comparison report', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const run = await seedRun(prisma, websiteId, { findings: FINDINGS, createdAt: RUN_DATE });

    const response = await agent
      .get(
        `/api/v1/analyses/compare/report.pdf?leftRunId=${run.runId}&rightRunId=${run.runId}`,
      )
      .expect(400);
    // Errors keep the API's JSON envelope even on a PDF route.
    expect(response.body.error.code).toBe('COMPARISON_SAME_RUN');
  });

  it('returns 409 when the analysis has no completed run yet', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const pending = await prisma.analysis.create({ data: { websiteId, status: 'PENDING' } });
    await prisma.analysisRun.create({
      data: {
        analysisId: pending.id,
        status: 'QUEUED',
        attempt: 0,
        engineVersion: '1.0.0',
        scoringVersion: '1.0.0',
      },
    });

    const documentResponse = await agent
      .get(`/api/v1/analyses/${pending.id}/report`)
      .expect(409);
    expect(documentResponse.body.error.code).toBe('REPORT_UNAVAILABLE');

    await agent.get(`/api/v1/analyses/${pending.id}/report.pdf`).expect(409);
  });

  it('returns 409 for an analysis with no runs at all', async () => {
    const { websiteId } = await seedProjectWithWebsite(agent);
    const analysis = await prisma.analysis.create({ data: { websiteId } });

    const response = await agent.get(`/api/v1/analyses/${analysis.id}/report`).expect(409);
    expect(response.body.error.code).toBe('REPORT_UNAVAILABLE');
  });

  it('returns 404 for an unknown analysis', async () => {
    await agent.get('/api/v1/analyses/11111111-2222-3333-4444-555555555555/report').expect(404);
    await agent.get('/api/v1/analyses/11111111-2222-3333-4444-555555555555/report.pdf').expect(404);
  });

  it('hides other users reports behind a 404', async () => {
    const { analysisId } = await seedAnalysableRun();
    const other = (await registerAgent(app, makeUser(1))).agent;

    await other.get(`/api/v1/analyses/${analysisId}/report`).expect(404);
    await other.get(`/api/v1/analyses/${analysisId}/report.pdf`).expect(404);
  });
});
