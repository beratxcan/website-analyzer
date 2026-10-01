import type { AnalyzerCategory, Evidence, Finding, Severity } from '../types';
import type { NormalizedWebsiteDocument } from '../document/document';

/** What a rule observed when its check failed. */
export interface RuleViolation {
  /** Overrides the rule description with finding-specific details. */
  description?: string;
  evidence: readonly Evidence[];
}

/**
 * A single deterministic check. Evaluates a normalized document and returns
 * a finding when the check fails, or null when the document passes.
 */
export interface Rule {
  readonly code: string;
  readonly category: AnalyzerCategory;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly scoreImpact: { readonly points: number };
  evaluate(document: NormalizedWebsiteDocument): Finding | null;
}

export interface RuleDefinition {
  code: string;
  category: AnalyzerCategory;
  severity: Severity;
  title: string;
  description: string;
  /** Point deduction applied to the category score when the rule fails. */
  points: number;
  evaluate(document: NormalizedWebsiteDocument): RuleViolation | null;
}

/** Builds a {@link Rule} from a declarative definition. */
export function defineRule(definition: RuleDefinition): Rule {
  const { code, category, severity, title, description, points } = definition;
  return {
    code,
    category,
    severity,
    title,
    description,
    scoreImpact: { points },
    evaluate(document: NormalizedWebsiteDocument): Finding | null {
      const violation = definition.evaluate(document);
      if (violation === null) {
        return null;
      }
      return {
        code,
        category,
        severity,
        title,
        description: violation.description ?? description,
        evidence: violation.evidence,
        scoreImpact: { points },
      };
    },
  };
}