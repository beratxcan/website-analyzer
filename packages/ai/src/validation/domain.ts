/**
 * Domain validation — the second validation layer.
 *
 * Schema-valid output is not automatically trusted. This validator grounds
 * every recommendation in the deterministic findings that were actually
 * provided: unknown codes, fabricated references, category mismatches,
 * duplicates and over-referencing are all rejected here.
 */
import type { AIAnalysisContext, AIInsightResult } from '../domain';
import { AIValidationError } from '../errors';

export interface DomainValidatorOptions {
  /** Maximum recommendations per result. */
  maxRecommendations?: number;
  /** Maximum recommendations that may reference the same finding. */
  maxRecommendationsPerFinding?: number;
}

export class DomainValidator {
  private readonly maxRecommendations: number;
  private readonly maxPerFinding: number;

  constructor(options: DomainValidatorOptions = {}) {
    this.maxRecommendations = options.maxRecommendations ?? 8;
    this.maxPerFinding = options.maxRecommendationsPerFinding ?? 3;
  }

  /** Throws {@link AIValidationError} when the output is not grounded. */
  validate(result: AIInsightResult, context: AIAnalysisContext): void {
    const issues: string[] = [];
    const availableCodes = new Set(context.findings.map((finding) => finding.ruleCode));
    const codeCategory = new Map(context.findings.map((finding) => [finding.ruleCode, finding.category]));

    // Grounding: every referenced code must exist in the provided context.
    for (const recommendation of result.recommendations) {
      for (const code of recommendation.relatedFindingCodes) {
        if (!availableCodes.has(code)) {
          issues.push(
            `recommendation "${recommendation.title}" references unknown finding code "${code}"`,
          );
        }
      }
    }

    // Category coherence: a recommendation's category must match its findings.
    for (const recommendation of result.recommendations) {
      const categories = new Set(
        recommendation.relatedFindingCodes
          .map((code) => codeCategory.get(code))
          .filter((category): category is string => category !== undefined),
      );
      if (categories.size > 0 && !categories.has(recommendation.category)) {
        issues.push(
          `recommendation "${recommendation.title}" category "${recommendation.category}" does not match its findings (${[...categories].join(', ')})`,
        );
      }
    }

    // Empty content (schema already rejects raw empty strings).
    for (const recommendation of result.recommendations) {
      if (recommendation.title.trim().length === 0) {
        issues.push('recommendation with an empty title');
      }
      if (recommendation.description.trim().length === 0) {
        issues.push(`recommendation "${recommendation.title}" has an empty description`);
      }
    }

    // Duplicate recommendations (case-insensitive title).
    const seen = new Set<string>();
    for (const recommendation of result.recommendations) {
      const key = recommendation.title.trim().toLowerCase();
      if (seen.has(key)) {
        issues.push(`duplicate recommendation "${recommendation.title}"`);
      }
      seen.add(key);
    }

    // Bounds.
    if (result.recommendations.length > this.maxRecommendations) {
      issues.push(
        `too many recommendations (${result.recommendations.length} > ${this.maxRecommendations})`,
      );
    }

    // Over-referencing: one finding driving too many recommendations.
    const codeUsage = new Map<string, number>();
    for (const recommendation of result.recommendations) {
      for (const code of recommendation.relatedFindingCodes) {
        codeUsage.set(code, (codeUsage.get(code) ?? 0) + 1);
      }
    }
    for (const [code, count] of codeUsage) {
      if (count > this.maxPerFinding) {
        issues.push(`finding "${code}" drives too many recommendations (${count} > ${this.maxPerFinding})`);
      }
    }

    if (issues.length > 0) {
      throw new AIValidationError('domain', issues);
    }
  }
}