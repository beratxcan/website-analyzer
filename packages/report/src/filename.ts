/**
 * Safe, predictable report filenames.
 *
 * The host comes from user-supplied URLs, so it is never interpolated
 * directly: it is lowercased, reduced to `[a-z0-9-]`, bounded, and given a
 * fixed fallback. The extension is always ours.
 */
import { toPrintable } from './sanitize';

const MAX_SLUG_LENGTH = 48;
const FALLBACK_SLUG = 'website';

/** Reduces arbitrary text to a conservative, filesystem-safe slug. */
export function toSafeSlug(value: unknown): string {
  const slug = toPrintable(value)
    // Fold Latin diacritics (ç → c, ö → o, ğ → g) so slugs stay readable ASCII.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug || FALLBACK_SLUG;
}

export type ReportKind = 'analysis' | 'comparison';

export interface ReportFilenameOptions {
  /** Website host or name — treated as untrusted. */
  host: string;
  /** ISO timestamp the filename date is derived from. */
  date: string;
  kind?: ReportKind;
}

/** `example-com-analysis-2026-09-06.pdf` */
export function buildReportFilename({
  host,
  date,
  kind = 'analysis',
}: ReportFilenameOptions): string {
  const hostSlug = toSafeSlug(host.replace(/^www\./i, ''));
  return `${hostSlug}-${kind}-${toIsoDay(date)}.pdf`;
}

function toIsoDay(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'unknown-date';
  return parsed.toISOString().slice(0, 10);
}
