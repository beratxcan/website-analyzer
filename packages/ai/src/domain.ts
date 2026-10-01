/**
 * Core domain types of the AI orchestration layer.
 *
 * The layer is provider-independent and persistence-independent: it consumes
 * a neutral {@link AnalysisSnapshot} of deterministic results, produces a
 * validated {@link AIInsightResult}, and never talks to a database or to any
 * provider SDK directly.
 *
 * Contract with the deterministic engine: the AI layer only *explains*,
 * *prioritizes* and *enriches* deterministic findings. It never computes
 * scores, never runs rules, and never edits findings — the deterministic
 * analysis is the source of truth.
 */
import type { ZodType } from 'zod';

export type AITask = 'analysis_insights';

export type AIStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type AIRecommendationPriority = 'low' | 'medium' | 'high' | 'critical';

export type AIEffort = 'low' | 'medium' | 'high';

export type AIImpact = 'low' | 'medium' | 'high';

export type AICategory = 'seo' | 'technical' | 'content' | 'accessibility' | 'performance';

/** Categories of the deterministic engine, used for domain validation. */
export const AI_CATEGORIES: readonly AICategory[] = [
  'seo',
  'technical',
  'content',
  'accessibility',
  'performance',
];

/** Severity ordering shared with the deterministic engine (most severe first). */
const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const UNKNOWN_SEVERITY_RANK = 5;

export function severityRank(severity: string): number {
  return SEVERITY_RANK[severity] ?? UNKNOWN_SEVERITY_RANK;
}

/**
 * A compact, model-friendly representation of one deterministic finding.
 * Contains only what the model needs; raw HTML is never included.
 */
export interface AIFindingContext {
  ruleCode: string;
  category: string;
  severity: string;
  title: string;
  /** Truncated finding description. */
  shortDescription: string;
  /** Truncated, compacted evidence strings. */
  compactEvidence: string[];
  scoreImpact: number;
}

/**
 * The context handed to the model. Deliberately small: host, scores and
 * selected findings. Internal ids, timestamps, user/project ids, cookies and
 * session data are never part of it.
 */
export interface AIAnalysisContext {
  website: {
    host: string;
    url: string;
  };
  analysis: {
    runStatus: 'completed' | 'partially_completed';
    overallScore: number | null;
    categoryScores: Record<string, number | null>;
    failedCategories: string[];
    engineVersion: string;
    scoringVersion: string;
  };
  findings: AIFindingContext[];
}

/**
 * Neutral, persistence-shaped input the orchestrator consumes. Keeps this
 * package free of any database dependency — the worker maps Prisma rows into
 * this snapshot.
 */
export interface AnalysisSnapshot {
  website: { host: string; url: string };
  runStatus: 'completed' | 'partially_completed';
  overallScore: number | null;
  categoryScores: Record<string, number | null>;
  failedCategories?: string[];
  engineVersion: string;
  scoringVersion: string;
  findings: Array<{
    ruleCode: string;
    category: string;
    severity: string;
    title: string;
    description: string;
    scoreImpact: number;
    evidence: unknown;
  }>;
}

/** One actionable recommendation, grounded in deterministic finding codes. */
export interface AIRecommendation {
  title: string;
  description: string;
  priority: AIRecommendationPriority;
  effort: AIEffort;
  impact: AIImpact;
  category: AICategory;
  relatedFindingCodes: string[];
}

export interface AISummary {
  headline: string;
  overview: string;
  strengths: string[];
  weaknesses: string[];
}

/** Validated structured output of the analysis-insights task. */
export interface AIInsightResult {
  summary: AISummary;
  recommendations: AIRecommendation[];
}

/** Application-level request sent to a provider adapter. */
export interface AIPromptRequest {
  task: AITask;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  /** Structured-output schema (zod); the provider may use it to constrain generation. */
  schema?: ZodType;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  metadata?: Record<string, string>;
}

/**
 * Provider-normalized generation response. No provider SDK type or exception
 * ever crosses this boundary.
 */
export interface AIGenerationResponse {
  content: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  finishReason: string | null;
  latencyMs: number;
  providerRequestId: string | null;
}

/** The one abstraction the rest of the application depends on. */
export interface AIProvider {
  readonly name: string;
  generateStructured(request: AIPromptRequest): Promise<AIGenerationResponse>;
}