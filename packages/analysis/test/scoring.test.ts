import { describe, expect, it } from 'vitest';
import { ScoringEngine, CATEGORY_WEIGHTS } from '../src/scoring';
import type { Finding } from '../src/types';

const engine = new ScoringEngine();

function finding(points: number, category: Finding['category'] = 'seo'): Finding {
  return {
    code: `TEST_${points}`,
    category,
    severity: points >= 15 ? 'high' : points >= 8 ? 'medium' : 'low',
    title: 'test',
    description: 'test',
    evidence: [],
    scoreImpact: { points },
  };
}

describe('ScoringEngine', () => {
  it('scores a category with no findings at 100', () => {
    expect(engine.scoreCategory('seo', [])).toBe(100);
  });

  it('deducts finding points from a category', () => {
    expect(engine.scoreCategory('seo', [finding(15), finding(10)])).toBe(75);
  });

  it('clamps category scores at zero', () => {
    expect(engine.scoreCategory('seo', [finding(60), finding(60)])).toBe(0);
  });

  it('only considers findings of the matching category', () => {
    expect(engine.scoreCategory('seo', [finding(20, 'technical')])).toBe(100);
  });

  it('rounds category scores', () => {
    expect(engine.scoreCategory('seo', [finding(3)])).toBe(97);
  });

  it('computes a weighted overall score', () => {
    const scores = { seo: 80, technical: 75, content: 68, accessibility: 70, performance: 67 };
    const expected = Math.round(
      80 * CATEGORY_WEIGHTS.seo +
        75 * CATEGORY_WEIGHTS.technical +
        68 * CATEGORY_WEIGHTS.content +
        70 * CATEGORY_WEIGHTS.accessibility +
        67 * CATEGORY_WEIGHTS.performance,
    );
    expect(engine.scoreOverall(scores)).toBe(expected);
  });

  it('renormalizes weights when a category is missing', () => {
    const full = { seo: 100, technical: 100, content: 100, accessibility: 100, performance: 50 };
    const partial = { seo: 100, technical: 100, content: 100, performance: 50 };
    // accessibility (weight .15) is dropped; remaining weights renormalize to 1.
    const expected = Math.round((100 * 0.25 + 100 * 0.2 + 100 * 0.2 + 50 * 0.2) / (0.25 + 0.2 + 0.2 + 0.2));
    expect(engine.scoreOverall(partial)).toBe(expected);
    expect(engine.scoreOverall(full)).not.toBe(expected);
  });

  it('returns null when no categories are scored', () => {
    expect(engine.scoreOverall({})).toBeNull();
  });

  it('is deterministic across repeated calls', () => {
    const findings = [finding(15), finding(10), finding(8), finding(3)];
    const scores = { seo: engine.scoreCategory('seo', findings), technical: 100, content: 100, accessibility: 100, performance: 100 };
    expect(engine.scoreOverall(scores)).toBe(engine.scoreOverall(scores));
    expect(engine.scoreCategory('seo', findings)).toBe(engine.scoreCategory('seo', findings));
  });
});