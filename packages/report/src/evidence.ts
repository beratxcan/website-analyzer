/**
 * Formats persisted engine evidence into short, human-readable report lines.
 *
 * The deterministic engine stores its `Evidence` union as JSON. This module
 * degrades unknown shapes to a bounded fragment instead of dumping a row, so
 * a report stays predictable regardless of what a (future) analyzer persisted.
 */
import { sanitizeText, truncate, toPrintable } from './sanitize';

export interface EvidenceLinesOptions {
  maxLines?: number;
  maxLength?: number;
}

const DEFAULTS: Required<EvidenceLinesOptions> = {
  maxLines: 3,
  maxLength: 160,
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string {
  if (typeof value === 'string') return toPrintable(value).trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/** One evidence item → at most one line. */
function formatEvidence(item: unknown): string | null {
  if (item === null || item === undefined) return null;
  if (typeof item === 'string') {
    const text = sanitizeText(item, { maxLength: 400 });
    return text || null;
  }
  const entry = record(item);
  if (!entry) return null;

  switch (entry.type) {
    case 'html_attribute': {
      const selector = str(entry.selector);
      const attribute = str(entry.attribute);
      const value = str(entry.value);
      if (!selector) return null;
      return attribute ? `${selector} [${attribute}${value ? `=${value}` : ''}]` : selector;
    }
    case 'html_missing': {
      const selector = str(entry.selector);
      return selector ? `missing ${selector}` : null;
    }
    case 'metric': {
      const metric = str(entry.metric) || 'metric';
      const value = str(entry.value);
      const unit = str(entry.unit);
      if (!value) return null;
      return `${metric} = ${value}${unit ? ` ${unit}` : ''}`;
    }
    case 'header': {
      const name = str(entry.name) || 'header';
      const value = str(entry.value);
      return `${name}: ${value || '(present)'}`;
    }
    case 'text': {
      const text = sanitizeText(entry.text, { maxLength: 400 });
      return text || null;
    }
    default: {
      try {
        const fragment = JSON.stringify(entry);
        return fragment ? truncate(toPrintable(fragment), 160) : null;
      } catch {
        return null;
      }
    }
  }
}

/** Bounded, printable evidence lines for one finding. */
export function evidenceLines(
  evidence: unknown,
  options: EvidenceLinesOptions = {},
): string[] {
  const { maxLines, maxLength } = { ...DEFAULTS, ...options };
  const items = Array.isArray(evidence) ? evidence : [evidence];
  const lines: string[] = [];

  for (const item of items) {
    const formatted = formatEvidence(item);
    if (!formatted) continue;
    lines.push(sanitizeText(formatted, { maxLength }));
    if (lines.length >= maxLines) break;
  }
  return lines;
}
