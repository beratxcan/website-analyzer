import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadDotenv } from 'dotenv';

const MAX_LEVELS = 5;

/**
 * Loads the nearest `.env` file into `process.env`, starting from
 * `startDir` and walking up the directory tree (the repository root holds
 * the canonical `.env`; package scripts run from their own directory).
 *
 * Real environment variables always take precedence over the file.
 *
 * @returns the absolute path of the loaded file, or `undefined` if none exists.
 */
export function loadEnvFile(startDir: string = process.cwd()): string | undefined {
  let dir = startDir;
  for (let level = 0; level < MAX_LEVELS; level += 1) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate, override: false, quiet: true });
      return candidate;
    }
    const parent = join(dir, '..');
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
}