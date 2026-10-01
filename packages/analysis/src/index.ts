// Engine
export { AnalysisEngine, ANALYSIS_ENGINE_VERSION } from './engine';
export type {
  AnalysisEngineOptions,
  AnalysisMetadata,
  AnalysisProgress,
  AnalysisResult,
  AnalyzeOptions,
  AnalyzerRunResult,
  VersionMetadata,
} from './engine';

// Fetcher
export { WebsiteFetcher } from './fetcher/fetcher';
export type { FetchImpl, FetchInit, FetcherOptions, HttpResponse } from './fetcher/fetcher';
export { FetcherError } from './fetcher/errors';
export type { FetcherErrorCode } from './fetcher/errors';
export { validateIpAddress, validateUrlForFetch, isBlockedHostname } from './fetcher/ssrf';
export type { IpBlockReason, IpValidation, LookupFn, ResolvedAddress } from './fetcher/ssrf';

// Normalization
export { normalizeHtmlDocument } from './document/normalize';
export type {
  ButtonInfo,
  FetchedWebsite,
  FormControlInfo,
  HeadingInfo,
  ImageInfo,
  LinkInfo,
  NormalizedWebsiteDocument,
  ScriptInfo,
} from './document/document';

// Analyzers
export { RuleBasedAnalyzer } from './analyzers/analyzer';
export type { Analyzer } from './analyzers/analyzer';
export { SeoAnalyzer } from './analyzers/seo';
export { TechnicalAnalyzer } from './analyzers/technical';
export { ContentAnalyzer } from './analyzers/content';
export { AccessibilityAnalyzer } from './analyzers/accessibility';
export { PerformanceAnalyzer } from './analyzers/performance';

// Registry
export { AnalyzerRegistry } from './registry';

// Rules
export { defineRule } from './rules/rule';
export type { Rule, RuleDefinition, RuleViolation } from './rules/rule';
export { RuleCode } from './rules/codes';
export type { RuleCodeValue } from './rules/codes';

// Scoring
export { ScoringEngine, SCORING_VERSION, CATEGORY_WEIGHTS } from './scoring';
export type { CategoryScores } from './scoring';

// Comparison (deterministic diff of two runs)
export {
  compareFindings,
  compareRuns,
  compareScores,
  isComparableRunStatus,
  validateComparison,
} from './comparison/compare';
export { COMPARISON_CATEGORIES } from './comparison/types';
export type {
  ComparableFinding,
  ComparableRun,
  ComparableRunMetadata,
  ComparableRunRef,
  ComparableRunStatus,
  ComparisonCategory,
  ComparisonSummary,
  ComparisonValidationError,
  FindingChange,
  FindingChangeKind,
  FindingChanges,
  RunComparison,
  ScoreChange,
  SeverityTransition,
} from './comparison/types';

// Domain types
export { SEVERITY_ORDER, severityWeight } from './types';
export type {
  AnalysisStatus,
  AnalyzerCategory,
  Evidence,
  Finding,
  ScoreImpact,
  Severity,
} from './types';
export { evidence, limitExamples } from './evidence';