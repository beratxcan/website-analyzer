import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import 'reflect-metadata';
import { loadEnvFile } from '@analyzer/config';
import { Client } from 'pg';

/**
 * Runs as module side effects before every worker test file. Ensures
 * integration tests execute against the dedicated `analyzer_worker_test`
 * database (separate from the API's `analyzer_test`) with the latest
 * migrations applied. The dev database is never touched.
 */

const require = createRequire(import.meta.url);
const TEST_DATABASE_NAME = 'analyzer_worker_test';
const SCHEMA_PATH = '../api/prisma/schema.prisma';

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

function runPrismaCli(args: string[], testUrl: string): void {
  const prismaPkg = require.resolve('prisma/package.json');
  const prismaCli = join(dirname(prismaPkg), 'build', 'index.js');
  execSync(`node ${JSON.stringify(prismaCli)} ${args.join(' ')}`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });
}

/**
 * `prisma generate` replaces the query engine DLL; on Windows another
 * process holding it (e.g. the API test task under turbo) causes EPERM.
 * Retry briefly — the lock holder finishes quickly — before giving up.
 */
function runPrismaGenerateOnce(testUrl: string): void {
  const marker = join(tmpdir(), 'analyzer-worker-prisma-generated');
  if (existsSync(marker)) {
    return;
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      runPrismaCli(['generate', '--schema', SCHEMA_PATH], testUrl);
      writeFileSync(marker, new Date().toISOString());
      return;
    } catch (error) {
      lastError = error;
      // EPERM: the engine DLL is momentarily locked by another process.
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('EPERM') && !message.includes('EBUSY')) {
        throw error;
      }
      execSync('node -e "setTimeout(() => {}, 1500)"');
    }
  }
  throw lastError;
}

async function prepareTestEnvironment(): Promise<void> {
  loadEnvFile();
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error('DATABASE_URL is required to run worker tests (see .env.example)');
  }
  const testUrl = deriveTestDatabaseUrl(baseUrl);
  await ensureTestDatabase(baseUrl);
  // Generate at most once per machine/run (marker file in the temp dir): the
  // loaded Prisma engine DLL locks the generated client on Windows, and the
  // API test task may hold it concurrently under turbo.
  runPrismaGenerateOnce(testUrl);
  runPrismaCli(['migrate', 'deploy', '--schema', SCHEMA_PATH], testUrl);
  process.env.DATABASE_URL = testUrl;
}

await prepareTestEnvironment();