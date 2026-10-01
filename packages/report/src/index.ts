// Report document model (the only input a renderer may consume)
export type {
  ReportAIStatus,
  ReportComparison,
  ReportDocument,
  ReportExecutiveSummary,
  ReportFinding,
  ReportFindingChange,
  ReportMetadata,
  ReportRecommendation,
  ReportRunStatus,
  ReportScore,
  ReportScoreChange,
  ReportScoreSummary,
  ReportSource,
} from './domain';

// Builder
export { ReportBuilder } from './builder';
export type { BuildOptions, ReportBuilderOptions } from './builder';

// Renderer
export { PdfReportRenderer } from './render/pdf';

// Safe filenames
export { buildReportFilename, toSafeSlug } from './filename';
export type { ReportFilenameOptions, ReportKind } from './filename';

// Sanitization & evidence formatting
export { sanitizeList, sanitizeText, toPrintable, truncate } from './sanitize';
export type { SanitizeTextOptions } from './sanitize';
export { evidenceLines } from './evidence';
export type { EvidenceLinesOptions } from './evidence';
