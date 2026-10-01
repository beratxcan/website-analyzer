import type { HeadingInfo } from '../document/document';

/**
 * Deterministically detects heading hierarchy problems: a first heading
 * deeper than h1, or any heading skipping more than one level above the
 * previous one (e.g. h1 → h3).
 */
export function findHeadingOrderViolations(headings: readonly HeadingInfo[]): {
  violations: number;
  example?: string;
} {
  let violations = 0;
  let example: string | undefined;

  const first = headings[0];
  if (first !== undefined && first.level > 1) {
    violations += 1;
    example = first.text;
  }

  for (let i = 1; i < headings.length; i += 1) {
    const previous = headings[i - 1];
    const current = headings[i];
    if (previous !== undefined && current !== undefined && current.level > previous.level + 1) {
      violations += 1;
      if (example === undefined) {
        example = current.text;
      }
    }
  }

  return { violations, example };
}