/**
 * Output sanitization for report content.
 *
 * Report content is derived from untrusted sources (fetched website HTML,
 * model output, user-supplied names). Two guarantees are enforced here:
 *
 * 1. **No markup interpretation.** The PDF renderer draws plain glyphs only;
 *    nothing is ever parsed as HTML/markup. Sanitization additionally removes
 *    control characters that could be misused in other renderers.
 * 2. **Encodability.** The standard PDF fonts use WinAnsi (CP1252) encoding and
 *    throw on characters outside it. We transliterate what we can and drop the
 *    rest, so hostile or exotic content can never break — or bloat — a report.
 */

/** Best-effort transliteration of common non-WinAnsi characters. */
const TRANSLITERATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[\u2018\u2019\u201A\u201B\u2032]/g, "'"],
  [/[\u201C\u201D\u201E\u201F\u2033]/g, '"'],
  [/[\u2013\u2014\u2212]/g, '-'],
  [/\u2026/g, '...'],
  [/[\u2022\u00B7]/g, '-'],
  [/[\u00A0\u2007\u202F\u2009\u200A\u200B\uFEFF]/g, ' '],
  [/\u0130/g, 'I'],
  [/\u0131/g, 'i'],
  [/[\u015E\u0218]/g, 'S'],
  [/[\u015F\u0219]/g, 's'],
  [/[\u011E]/g, 'G'],
  [/[\u011F]/g, 'g'],
  [/[\u021A]/g, 'T'],
  [/[\u021B]/g, 't'],
  [/[\u0141]/g, 'L'],
  [/[\u0142]/g, 'l'],
  [/[\u0110]/g, 'D'],
  [/[\u0111]/g, 'd'],
];

/**
 * Everything the standard PDF fonts can encode: ASCII, Latin-1, and the
 * printable CP1252 extension block. `\t\n\r` survive (removed later by
 * single-line collapsing).
 */
const NOT_WINANSI = /[^\t\n\r\x20-\x7E\xA0-\xFF\u20AC\u201A\u0192\u201E\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/g;

/** Converts an arbitrary value into printable, PDF-safe text. */
export function toPrintable(value: unknown): string {
  if (typeof value !== 'string') return '';
  let text = value.normalize('NFC');
  for (const [pattern, replacement] of TRANSLITERATIONS) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(NOT_WINANSI, '');
}

/** Truncates a printable string, appending an ellipsis when shortened. */
export function truncate(value: string, maxLength: number): string {
  if (maxLength <= 0) return '';
  if (value.length <= maxLength) return value;
  if (maxLength === 1) return value.slice(0, 1);
  return `${value.slice(0, maxLength - 1).trimEnd()}\u2026`;
}

export interface SanitizeTextOptions {
  /** Hard character cap applied after whitespace collapsing. */
  maxLength?: number;
}

/** Single-line, bounded, printable text. */
export function sanitizeText(value: unknown, options: SanitizeTextOptions = {}): string {
  const { maxLength = 600 } = options;
  const collapsed = toPrintable(value).replace(/\s+/g, ' ').trim();
  return truncate(collapsed, maxLength);
}

/** Sanitizes a list of strings, dropping empties and capping the count. */
export function sanitizeList(
  values: readonly unknown[],
  options: SanitizeTextOptions & { maxItems?: number } = {},
): string[] {
  const { maxItems = 10, ...textOptions } = options;
  return values
    .map((value) => sanitizeText(value, textOptions))
    .filter((value) => value.length > 0)
    .slice(0, maxItems);
}
