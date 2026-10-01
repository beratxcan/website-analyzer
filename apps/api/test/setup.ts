import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { loadEnvFile } from '@analyzer/config';
import { Client } from 'pg';

/**
 * Runs as module side effects before every test file (Vitest `setupFiles`
 * are imported, not invoked). Ensures integration tests execute against the
 * dedicated `analyzer_test` database with the latest committed migrations
 * applied. The dev database is never touched.
 */

const require = createRequire(import.meta.url);
const TEST_DATABASE_NAME = 'analyzer_test';

function deriveTestDatabaseUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  parsed.pathname = `/${TEST_DATABASE_NAME}`;
  return parsed.toString();
}

async function ensureTestDatabase(baseUrl: string): Promise<void> {
  const client = new Client({ connectionString: baseUrl });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${TEST_DATABASE_NAME}"`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists/i.test(message)) {
      throw error;
    }
  } finally {
    await client.end();
  }
}

function applyMigrations(testUrl: string): void {
  const prismaPkg = require.resolve('prisma/package.json');
  const prismaCli = join(dirname(prismaPkg), 'build', 'index.js');
  execSync(`node ${JSON.stringify(prismaCli)} migrate deploy`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });
}

async function prepareTestEnvironment(): Promise<void> {
  loadEnvFile();
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error('DATABASE_URL is required to run API tests (see .env.example)');
  }
  const testUrl = deriveTestDatabaseUrl(baseUrl);
  await ensureTestDatabase(baseUrl);
  applyMigrations(testUrl);
  process.env.DATABASE_URL = testUrl;
  // Throttling would make integration suites flaky (many requests share one
  // client IP); raise every category's budget. Dedicated tests that exercise
  // the limiter create their own app with low limits.
  process.env.THROTTLE_LIMIT = '100000';
  process.env.THROTTLE_AUTH_LIMIT = '100000';
  process.env.THROTTLE_ANALYSIS_LIMIT = '100000';
}

await prepareTestEnvironment();