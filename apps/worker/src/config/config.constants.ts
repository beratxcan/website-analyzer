import type { WorkerConfig } from '@analyzer/config';

export const APP_CONFIG = Symbol('APP_CONFIG');

export type AppConfig = WorkerConfig;