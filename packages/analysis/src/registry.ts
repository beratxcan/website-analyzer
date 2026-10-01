import type { Analyzer } from './analyzers/analyzer';
import { SeoAnalyzer } from './analyzers/seo';
import { TechnicalAnalyzer } from './analyzers/technical';
import { ContentAnalyzer } from './analyzers/content';
import { AccessibilityAnalyzer } from './analyzers/accessibility';
import { PerformanceAnalyzer } from './analyzers/performance';

/**
 * Central registry for analyzers. Adding a new analyzer only requires
 * registering it — existing analyzers are never modified.
 */
export class AnalyzerRegistry {
  private readonly analyzersById = new Map<string, Analyzer>();

  register(analyzer: Analyzer): this {
    if (this.analyzersById.has(analyzer.id)) {
      throw new Error(`Analyzer "${analyzer.id}" is already registered`);
    }
    this.analyzersById.set(analyzer.id, analyzer);
    return this;
  }

  get all(): Analyzer[] {
    return [...this.analyzersById.values()];
  }

  getById(id: string): Analyzer | undefined {
    return this.analyzersById.get(id);
  }

  /** Registry with the five built-in analyzers. */
  static default(): AnalyzerRegistry {
    return new AnalyzerRegistry()
      .register(new SeoAnalyzer())
      .register(new TechnicalAnalyzer())
      .register(new ContentAnalyzer())
      .register(new AccessibilityAnalyzer())
      .register(new PerformanceAnalyzer());
  }
}