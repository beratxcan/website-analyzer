import type { AnalyzerCategory, Finding } from './types';

export const SCORING_VERSION = '1.0.0';

/**
 * Category weights for the overall score. Bumping the scoring version is
 * required whenever these (or the deduction math) change.
 */
export const CATEGORY_WEIGHTS: Readonly<Record<AnalyzerCategory, number>> = {
  seo: 0.25,
  technical: 0.2,
  content: 0.2,
  accessibility: 0.15,
  performance: 0.2,
};

export type CategoryScores = Partial<Record<AnalyzerCategory, number>>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Deterministic scoring: a category starts at 100 and each finding deducts
 * its `scoreImpact.points`. The overall score is the weight-averaged category
 * score. The same findings always produce the same scores.
 */
export class ScoringEngine {
  readonly version = SCORING_VERSION;

  scoreCategory(category: AnalyzerCategory, findings: readonly Finding[]): number {
    const deduction = findings
      .filter((finding) => finding.category === category)
      .reduce((sum, finding) => sum + finding.scoreImpact.points, 0);
    return clamp(Math.round(100 - deduction), 0, 100);
  }

  scoreOverall(categoryScores: CategoryScores): number | null {
    const categories = (Object.keys(categoryScores) as AnalyzerCategory[]).filter(
      (category) => categoryScores[category] !== undefined,
    );
    if (categories.length === 0) {
      return null;
    }
    const totalWeight = categories.reduce((sum, category) => sum + CATEGORY_WEIGHTS[category], 0);
    if (totalWeight <= 0) {
      return null;
    }
    const weighted = categories.reduce(
      (sum, category) => sum + (categoryScores[category] ?? 0) * CATEGORY_WEIGHTS[category],
      0,
    );
    return Math.round(weighted / totalWeight);
  }
}