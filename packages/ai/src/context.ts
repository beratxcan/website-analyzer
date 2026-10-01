/**
 * Context building for the AI layer.
 *
 * The model never receives a raw database dump. {@link EvidenceSelector}
 * deterministically picks and compacts findings (severity → score impact →
 * stable rule-code ordering, bounded by a hard limit), and
 * {@link AIContextBuilder} shapes the minimal {@link AIAnalysisContext} that
 * reaches the provider.
 */
import { severityRank, type AIAnalysisContext, type AIFindingContext, type AnalysisSnapshot } from './domain';

export interface EvidenceSelectorOptions {
  /** Hard limit on how many findings are sent to the model. */
  maxFindings?: number;
  /** Maximum evidence strings per finding. */
  maxEvidencePerFinding?: number;
  /** Maximum length of one evidence string. */
  maxEvidenceLength?: number;
  /** Maximum length of a finding description. */
  maxDescriptionLength?: number;
}

const DEFAULTS: Required<EvidenceSelectorOptions> = {
  maxFindings: 30,
  maxEvidencePerFinding: 2,
  maxEvidenceLength: 140,
  maxDescriptionLength: 240,
};

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

/**
 * Compacts a persisted evidence value (the deterministic engine's `Evidence`
 * union, stored as JSON) into short, model-friendly strings. Non-textual or
 * unknown shapes degrade to a bounded JSON fragment rather than being dropped
 * or expanded.
 */
export function compactEvidence(evidence: unknown): string[] {
  if (evidence === null || evidence === undefined) return [];
  if (typeof evidence === 'string') {
    return [evidence.trim()].filter(Boolean);
  }
  if (Array.isArray(evidence)) {
    return evidence.flatMap((item) => compactEvidence(item));
  }
  if (typeof evidence !== 'object') return [];

  const record = evidence as Record<string, unknown>;
  const type = record.type;
  if (typeof type === 'string') {
    switch (type) {
      case 'html_attribute': {
        const selector = typeof record.selector === 'string' ? record.selector : '';
        const attribute = typeof record.attribute === 'string' ? record.attribute : '';
        const value = typeof record.value === 'string' ? record.value : '';
        return [`${selector}${attribute ? ` [${attribute}${value ? `=${value}` : ''}]` : ''}`];
      }
      case 'html_missing': {
        const selector = typeof record.selector === 'string' ? record.selector : '';
        return [`missing ${selector}`];
      }
      case 'metric': {
        const metric = typeof record.metric === 'string' ? record.metric : 'metric';
        const value = typeof record.value === 'number' ? String(record.value) : '';
        const unit = typeof record.unit === 'string' ? record.unit : '';
        return [`${metric}=${value}${unit ? ` ${unit}` : ''}`];
      }
      case 'header': {
        const name = typeof record.name === 'string' ? record.name : 'header';
        const value = typeof record.value === 'string' ? record.value : '';
        return [`${name}: ${value || '(present)'}`];
      }
      case 'text': {
        const text = typeof record.text === 'string' ? record.text.trim() : '';
        return text ? [text] : [];
      }
      default:
        break;
    }
  }
  // Unknown shape — keep a bounded fragment instead of the raw row.
  try {
    return [JSON.stringify(record).slice(0, 160)];
  } catch {
    return [];
  }
}

/**
 * Deterministic finding selection: same input always produces the same
 * context. Ordering: severity (critical first) → score impact (highest
 * first) → stable rule-code ordering.
 */
export class EvidenceSelector {
  private readonly options: Required<EvidenceSelectorOptions>;

  constructor(options: EvidenceSelectorOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  select(findings: AnalysisSnapshot['findings']): AIFindingContext[] {
    const sorted = [...findings].sort((a, b) => {
      const bySeverity = severityRank(a.severity) - severityRank(b.severity);
      if (bySeverity !== 0) return bySeverity;
      const byImpact = b.scoreImpact - a.scoreImpact;
      if (byImpact !== 0) return byImpact;
      return a.ruleCode.localeCompare(b.ruleCode);
    });

    return sorted.slice(0, this.options.maxFindings).map((finding) => ({
      ruleCode: finding.ruleCode,
      category: finding.category,
      severity: finding.severity,
      title: finding.title,
      shortDescription: truncate(finding.description, this.options.maxDescriptionLength),
      compactEvidence: compactEvidence(finding.evidence)
        .slice(0, this.options.maxEvidencePerFinding)
        .map((item) => truncate(item, this.options.maxEvidenceLength)),
      scoreImpact: finding.scoreImpact,
    }));
  }
}

/** Builds the minimal, secret-free context sent to the model. */
export class AIContextBuilder {
  constructor(private readonly selector: EvidenceSelector = new EvidenceSelector()) {}

  build(snapshot: AnalysisSnapshot): AIAnalysisContext {
    return {
      website: {
        host: snapshot.website.host,
        url: snapshot.website.url,
      },
      analysis: {
        runStatus: snapshot.runStatus,
        overallScore: snapshot.overallScore,
        categoryScores: snapshot.categoryScores,
        failedCategories: snapshot.failedCategories ?? [],
        engineVersion: snapshot.engineVersion,
        scoringVersion: snapshot.scoringVersion,
      },
      findings: this.selector.select(snapshot.findings),
    };
  }
}