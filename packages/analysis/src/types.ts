/**
 * Core domain types of the analysis engine.
 *
 * These types are framework-independent and persistence-independent:
 * analyzers produce immutable findings, a scoring engine derives
 * deterministic scores, and a separate application layer decides how to
 * persist the result.
 */

export type AnalyzerCategory = 'seo' | 'technical' | 'content' | 'accessibility' | 'performance';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type AnalysisStatus = 'completed' | 'partially_completed';

/**
 * Observational evidence attached to a finding. Kept short, reliable and
 * reproducible; raw HTML is never embedded.
 */
export type Evidence =
  | { type: 'html_attribute'; selector: string; attribute?: string; value?: string; source: 'document' }
  | { type: 'html_missing'; selector: string; source: 'document' }
  | { type: 'metric'; metric: string; value: number; unit?: string }
  | { type: 'header'; name: string; value?: string; source: 'response' }
  | { type: 'text'; text: string };

/** Deterministic point deduction this finding applies to its category score. */
export interface ScoreImpact {
  readonly points: number;
}

/** A single immutable analysis result produced by one rule evaluation. */
export interface Finding {
  readonly code: string;
  readonly category: AnalyzerCategory;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly evidence: readonly Evidence[];
  readonly scoreImpact: ScoreImpact;
}

/** Severity ordering used for deterministic finding sorting (ascending weight). */
export const SEVERITY_ORDER: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export function severityWeight(severity: Severity): number {
  const index = SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? SEVERITY_ORDER.length : index;
}