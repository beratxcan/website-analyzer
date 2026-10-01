import type { AnalyzerCategory, Finding } from '../types';
import type { NormalizedWebsiteDocument } from '../document/document';
import type { Rule } from '../rules/rule';

/**
 * Framework-independent analyzer contract. Each analyzer owns a single
 * responsibility and must never call another analyzer.
 */
export interface Analyzer {
  readonly id: string;
  readonly category: AnalyzerCategory;
  /** Bumped whenever this analyzer's rules or thresholds change. */
  readonly version: string;
  analyze(document: NormalizedWebsiteDocument): Finding[];
}

/** Shared base for the built-in rule-based analyzers. */
export abstract class RuleBasedAnalyzer implements Analyzer {
  abstract readonly id: string;
  abstract readonly category: AnalyzerCategory;
  abstract readonly version: string;
  protected abstract readonly rules: readonly Rule[];

  analyze(document: NormalizedWebsiteDocument): Finding[] {
    const findings: Finding[] = [];
    for (const rule of this.rules) {
      const finding = rule.evaluate(document);
      if (finding !== null) {
        findings.push(finding);
      }
    }
    return findings;
  }
}