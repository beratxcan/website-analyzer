/**
 * Queue contract shared by the API (enqueue) and the worker (consume).
 * Jobs carry only identity references — the database remains the source of
 * truth; URLs and results are never transported through the queue.
 */

export const ANALYSIS_QUEUE_NAME = 'analysis';

export const ANALYSIS_JOB_NAME = 'analysis.execute';

export interface AnalysisJobPayload {
  analysisId: string;
  runId: string;
}

/** Queue + job for the AI enrichment stage, isolated from the deterministic run. */
export const AI_QUEUE_NAME = 'ai';

export const AI_JOB_NAME = 'ai.enrich';

export interface AIJobPayload {
  analysisId: string;
  runId: string;
  aiResultId: string;
}