import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readAppVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Application version, read from package.json (fallback: `0.0.0`). */
export const APP_VERSION = readAppVersion();