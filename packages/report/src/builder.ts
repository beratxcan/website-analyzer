/**
 * ReportBuilder — turns a neutral {@link ReportSource} into a bounded,
 * deterministic {@link ReportDocument}.
 *
 * The builder never calculates scores or findings; it only *presents* the
 * deterministic result (and, when available, the AI enrichment). AI is
 * strictly optional: a missing or failed AI result yields the deterministic
 * executive summary fallback and simply no recommendations.
 */
import type { FindingChange, RunComparison } from '@analyzer/analysis';
import type {
  ReportComparison,
  ReportDocument,
  ReportExecutiveSummary,
  ReportFinding,
  ReportFindingChange,
  ReportRecommendation,
  ReportScore,
  ReportSource,
} from './domain';
import { evidenceLines } from './evidence';
import { sanitizeList, sanitizeText } from './sanitize';

export interface ReportBuilderOptions {
  /** Max findings in the critical/high section. */
  maxCriticalFindings?: number;
  /** Max findings in the medium section. */
  maxAdditionalFindings?: number;
  maxRecommendations?: number;
  maxEvidenceLines?: number;
  maxSummaryItems?: number;
}

const DEFAULTS: Required<ReportBuilderOptions> = {
  maxCriticalFindings: 25,
  maxAdditionalFindings: 15,
  maxRecommendations: 10,
  maxEvidenceLines: 3,
  maxSummaryItems: 3,
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const CATEGORY_ORDER = ['overall', 'seo', 'technical', 'content', 'accessibility', 'performance'];

const STRONG_SCORE = 90;
const WEAK_SCORE = 80;

export interface BuildOptions {
  /** Fixes `metadata.generatedAt` (and therefore the PDF bytes). */
  generatedAt?: Date | string;
}

export class ReportBuilder {
  private readonly options: Required<ReportBuilderOptions>;

  constructor(options: ReportBuilderOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  build(source: ReportSource, options: BuildOptions = {}): ReportDocument {
    const generatedAt = toIso(options.generatedAt) ?? new Date().toISOString();
    const scoreSummary = this.buildScoreSummary(source);
    const findings = this.buildFindings(source);
    const criticalFindings = findings
      .filter((finding) => finding.severity === 'critical' || finding.severity === 'high')
      .slice(0, this.options.maxCriticalFindings);
    const additionalFindings = findings
      .filter((finding) => finding.severity === 'medium')
      .slice(0, this.options.maxAdditionalFindings);

    return {
      metadata: {
        title: 'Website Analysis Report',
        websiteName: sanitizeText(source.website.name, { maxLength: 120 }) || source.website.host,
        websiteHost: sanitizeText(source.website.host, { maxLength: 120 }),
        websiteUrl: sanitizeText(source.website.url, { maxLength: 300 }),
        analysisDate: source.runCompletedAt ?? source.runCreatedAt,
        generatedAt,
        analysisId: source.analysisId,
        runId: source.runId,
        runStatus: source.runStatus,
        engineVersion: sanitizeText(source.engineVersion, { maxLength: 32 }),
        scoringVersion: sanitizeText(source.scoringVersion, { maxLength: 32 }),
        aiStatus: source.ai?.status ?? null,
      },
      executiveSummary: this.buildExecutiveSummary(source, scoreSummary),
      scoreSummary,
      criticalFindings,
      additionalFindings,
      recommendations: this.buildRecommendations(source),
      comparison: source.comparison ? toReportComparison(source.comparison) : null,
    };
  }

  /** Deterministic score ordering: overall, canonical categories, then rest. */
  private buildScoreSummary(source: ReportSource): ReportDocument['scoreSummary'] {
    const byCategory = new Map(source.scores.map((score) => [score.category, score]));
    const ordered: ReportScore[] = [];

    for (const category of CATEGORY_ORDER) {
      const score = byCategory.get(category);
      if (score) {
        ordered.push({ category, score: score.score, weight: score.weight ?? null });
        byCategory.delete(category);
      }
    }
    for (const category of [...byCategory.keys()].sort()) {
      const score = byCategory.get(category)!;
      ordered.push({ category, score: score.score, weight: score.weight ?? null });
    }

    const overall = ordered.find((score) => score.category === 'overall')?.score ?? null;
    return {
      overall,
      categories: ordered.filter((score) => score.category !== 'overall'),
    };
  }

  /** Severity → impact desc → rule code, with compact, sanitized evidence. */
  private buildFindings(source: ReportSource): ReportFinding[] {
    return [...source.findings]
      .sort(
        (a, b) =>
          (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
          b.scoreImpact - a.scoreImpact ||
          a.ruleCode.localeCompare(b.ruleCode),
      )
      .map((finding) => ({
        ruleCode: sanitizeText(finding.ruleCode, { maxLength: 64 }),
        title: sanitizeText(finding.title, { maxLength: 200 }),
        description: sanitizeText(finding.description, { maxLength: 700 }),
        category: sanitizeText(finding.category, { maxLength: 32 }),
        severity: sanitizeText(finding.severity, { maxLength: 16 }),
        scoreImpact: finding.scoreImpact,
        evidence: evidenceLines(finding.evidence, { maxLines: this.options.maxEvidenceLines }),
      }));
  }

  /**
   * Uses the validated AI summary when present; otherwise produces a factual,
   * deterministic summary from the persisted scores and findings.
   */
  private buildExecutiveSummary(
    source: ReportSource,
    scoreSummary: ReportDocument['scoreSummary'],
  ): ReportExecutiveSummary {
    const aiSummary = source.ai?.status === 'completed' ? source.ai.summary : null;
    if (aiSummary) {
      return {
        headline: sanitizeText(aiSummary.headline, { maxLength: 200 }),
        overview: sanitizeText(aiSummary.overview, { maxLength: 1_200 }),
        strengths: sanitizeList(aiSummary.strengths, {
          maxItems: this.options.maxSummaryItems,
          maxLength: 200,
        }),
        weaknesses: sanitizeList(aiSummary.weaknesses, {
          maxItems: this.options.maxSummaryItems,
          maxLength: 200,
        }),
        source: 'ai',
      };
    }
    return this.deterministicSummary(source, scoreSummary);
  }

  private deterministicSummary(
    source: ReportSource,
    scoreSummary: ReportDocument['scoreSummary'],
  ): ReportExecutiveSummary {
    const host = sanitizeText(source.website.host || source.website.name, { maxLength: 120 });
    const overall = scoreSummary.overall;
    const scored = scoreSummary.categories.filter(
      (category): category is ReportScore & { score: number } => category.score !== null,
    );

    const headline =
      overall !== null
        ? `${host} scored ${overall}/100`
        : `Analysis of ${host} completed without a complete score`;

    const highSeverity = source.findings.filter(
      (finding) => finding.severity === 'critical' || finding.severity === 'high',
    ).length;
    const mediumSeverity = source.findings.filter((finding) => finding.severity === 'medium').length;

    const parts: string[] = [];
    if (scored.length > 0) {
      const weakest = [...scored].sort((a, b) => a.score - b.score).slice(0, 3);
      parts.push(
        `Deterministic analysis produced an overall score of ${overall ?? 'n/a'} out of 100 across ${scored.length} categories.`,
      );
      parts.push(
        `Lowest scoring areas: ${weakest.map((category) => `${category.category} (${category.score})`).join(', ')}.`,
      );
    } else {
      parts.push('Deterministic analysis completed, but no category scores were persisted for this run.');
    }
    parts.push(
      `${source.findings.length} finding${source.findings.length === 1 ? '' : 's'} detected, including ${highSeverity} critical/high and ${mediumSeverity} medium.`,
    );
    if (source.runStatus === 'partially_completed') {
      parts.push('One or more analyzers failed, so this run is flagged as partially completed.');
    }

    const strengths = [...scored]
      .filter((category) => category.score >= STRONG_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.options.maxSummaryItems)
      .map((category) => `${category.category}: ${category.score}/100`);
    const weaknesses = [...scored]
      .filter((category) => category.score < WEAK_SCORE)
      .sort((a, b) => a.score - b.score)
      .slice(0, this.options.maxSummaryItems)
      .map((category) => `${category.category}: ${category.score}/100`);

    return {
      headline: sanitizeText(headline, { maxLength: 200 }),
      overview: sanitizeText(parts.join(' '), { maxLength: 1_200 }),
      strengths: sanitizeList(strengths, { maxItems: this.options.maxSummaryItems, maxLength: 120 }),
      weaknesses: sanitizeList(weaknesses, { maxItems: this.options.maxSummaryItems, maxLength: 120 }),
      source: 'deterministic',
    };
  }

  private buildRecommendations(source: ReportSource): ReportRecommendation[] {
    if (source.ai?.status !== 'completed' || !source.ai.recommendations) {
      return [];
    }
    return source.ai.recommendations
      .slice(0, this.options.maxRecommendations)
      .map((recommendation) => ({
        title: sanitizeText(recommendation.title, { maxLength: 160 }),
        description: sanitizeText(recommendation.description, { maxLength: 700 }),
        priority: sanitizeText(recommendation.priority, { maxLength: 20 }),
        impact: sanitizeText(recommendation.impact, { maxLength: 20 }),
        effort: sanitizeText(recommendation.effort, { maxLength: 20 }),
        category: sanitizeText(recommendation.category, { maxLength: 32 }),
        relatedFindingCodes: sanitizeList(recommendation.relatedFindingCodes, {
          maxItems: 8,
          maxLength: 64,
        }),
      }))
      .filter(
        (recommendation) => recommendation.title.length > 0 || recommendation.description.length > 0,
      );
  }
}

function toIso(value: Date | string | undefined): string | null {
  if (value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Maps the deterministic diff into the report's view model. */
function toReportComparison(comparison: RunComparison): ReportComparison {
  const toChange = (finding: FindingChange): ReportFindingChange => ({
    ruleCode: sanitizeText(finding.ruleCode, { maxLength: 64 }),
    title: sanitizeText(finding.title, { maxLength: 200 }),
    category: sanitizeText(finding.category, { maxLength: 32 }),
    leftSeverity: finding.leftSeverity,
    rightSeverity: finding.rightSeverity,
    change: finding.change,
    severityChange: finding.severityChange,
  });

  return {
    leftRunId: comparison.left.runId,
    rightRunId: comparison.right.runId,
    leftDate: comparison.left.createdAt,
    rightDate: comparison.right.createdAt,
    leftScore: comparison.left.overall,
    rightScore: comparison.right.overall,
    overallDelta:
      comparison.scoreChanges.find((score) => score.category === 'overall')?.delta ?? null,
    scoreChanges: comparison.scoreChanges.map((score) => ({
      category: score.category,
      left: score.left,
      right: score.right,
      delta: score.delta,
    })),
    resolved: comparison.findingChanges.resolved.map(toChange),
    new: comparison.findingChanges.new.map(toChange),
    improved: comparison.findingChanges.unchanged
      .filter((finding) => finding.severityChange === 'improved')
      .map(toChange),
    regressed: comparison.findingChanges.unchanged
      .filter((finding) => finding.severityChange === 'regressed')
      .map(toChange),
    summary: { ...comparison.summary },
  };
}
