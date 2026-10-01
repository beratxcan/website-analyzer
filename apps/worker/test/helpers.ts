import type { Job } from 'bullmq';
import { PrismaClient, type User } from '@prisma/client';
import {
  AnalysisEngine,
  AnalyzerRegistry,
  RuleBasedAnalyzer,
  SeoAnalyzer,
  WebsiteFetcher,
  defineRule,
} from '@analyzer/analysis';
import type { AnalysisJobPayload } from '@analyzer/contracts';

export const PUBLIC_LOOKUP = async (): Promise<{ address: string; family: number }[]> => [
  { address: '93.184.216.34', family: 4 },
];

/** Small page with several deterministic issues (missing meta/OG/robots/lang...). */
export const FIXTURE_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Worker test fixture page</title>
</head>
<body>
  <h2>Welcome</h2>
  <img src="/hero.png">
  <p>This page is used by worker integration tests to exercise persistence.</p>
</body>
</html>`;

/** Truncates all tables so each suite starts from a clean state. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');
}

export async function seedWebsite(
  prisma: PrismaClient,
): Promise<{ user: User; projectId: string; websiteId: string; websiteUrl: string }> {
  const user = await prisma.user.create({
    data: { email: `worker-${Date.now()}@example.com`, passwordHash: 'not-used-in-tests' },
  });
  const project = await prisma.project.create({ data: { userId: user.id, name: 'Worker Test Project' } });
  const website = await prisma.website.create({
    data: {
      projectId: project.id,
      name: 'Example',
      url: 'https://example.com/',
      normalizedUrl: 'https://example.com',
      host: 'example.com',
    },
  });
  return { user, projectId: project.id, websiteId: website.id, websiteUrl: website.url };
}

export async function seedAnalysisRun(
  prisma: PrismaClient,
  websiteId: string,
  overrides: Partial<Parameters<PrismaClient['analysisRun']['create']>[0]['data']> = {},
): Promise<{ analysisId: string; runId: string }> {
  const analysis = await prisma.analysis.create({ data: { websiteId, status: 'PENDING' } });
  const run = await prisma.analysisRun.create({
    data: {
      analysisId: analysis.id,
      status: 'QUEUED',
      attempt: 0,
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      ...overrides,
    },
  });
  return { analysisId: analysis.id, runId: run.id };
}

export function engineWithFixture(): AnalysisEngine {
  return new AnalysisEngine({ fetcher: fetcherReturning(FIXTURE_HTML) });
}

export function engineWithError(error: Error): AnalysisEngine {
  const fetcher = new WebsiteFetcher({
    lookup: PUBLIC_LOOKUP,
    fetchImpl: async () => {
      throw error;
    },
  });
  return new AnalysisEngine({ fetcher });
}

/** Engine whose fetch flips the run state in the database (used to simulate mid-flight cancellation). */
export function engineWithFetchSideEffect(
  sideEffect: () => Promise<void>,
  html: string = FIXTURE_HTML,
): AnalysisEngine {
  return new AnalysisEngine({
    fetcher: new WebsiteFetcher({
      lookup: PUBLIC_LOOKUP,
      fetchImpl: async () => {
        await sideEffect();
        return fixtureResponse(html);
      },
    }),
  });
}

class ThrowingAnalyzer extends RuleBasedAnalyzer {
  readonly id = 'throwing';
  readonly category = 'performance' as const;
  readonly version = '1.0.0';
  protected readonly rules = [
    defineRule({
      code: 'THROW_BOOM',
      category: 'performance' as const,
      severity: 'high' as const,
      title: 'boom',
      description: 'always throws',
      points: 10,
      evaluate: (): never => {
        throw new Error('analyzer exploded');
      },
    }),
  ];
}

/** Engine whose performance analyzer always fails → PARTIALLY_COMPLETED. */
export function engineWithFailingAnalyzer(): AnalysisEngine {
  const registry = new AnalyzerRegistry().register(new SeoAnalyzer()).register(new ThrowingAnalyzer());
  return new AnalysisEngine({ registry, fetcher: fetcherReturning(FIXTURE_HTML) });
}

export function makeJob(
  data: AnalysisJobPayload,
  options: { id?: string; attempts?: number; attemptsMade?: number } = {},
): Job<AnalysisJobPayload> {
  return {
    id: options.id ?? 'test-job',
    data,
    attemptsMade: options.attemptsMade ?? 0,
    opts: { attempts: options.attempts ?? 3 },
    updateProgress: async () => undefined,
    log: async () => undefined,
  } as unknown as Job<AnalysisJobPayload>;
}

export async function waitFor(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 15_000,
  intervalMs = 100,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function fetcherReturning(html: string): WebsiteFetcher {
  return new WebsiteFetcher({
    lookup: PUBLIC_LOOKUP,
    fetchImpl: async () => fixtureResponse(html),
  });
}

function fixtureResponse(html: string) {
  return {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: (async function* () {
      yield new Uint8Array(Buffer.from(html, 'utf8'));
    })(),
  };
}