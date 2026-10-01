import { z } from 'zod';
import { apiEnvSchema, workerEnvSchema, type ApiConfig, type WorkerConfig } from './schemas';

/**
 * Validates the given environment object against a Zod schema and returns
 * the typed result. Throws with a readable summary when validation fails so
 * applications can fail fast at startup.
 */
export function parseEnv<T>(schema: z.ZodType<T>, env: NodeJS.ProcessEnv = process.env): T {
  const result = schema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return result.data;
}

/** Loads and validates the API application configuration. */
export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return parseEnv(apiEnvSchema, env);
}

/** Loads and validates the worker application configuration. */
export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return parseEnv(workerEnvSchema, env);
}