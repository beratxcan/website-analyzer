import type { Evidence } from './types';

/** Compact builders for the supported evidence shapes. */
export const evidence = {
  attribute(selector: string, attribute?: string, value?: string): Evidence {
    return { type: 'html_attribute', selector, attribute, value, source: 'document' };
  },
  missing(selector: string): Evidence {
    return { type: 'html_missing', selector, source: 'document' };
  },
  metric(metric: string, value: number, unit?: string): Evidence {
    return { type: 'metric', metric, value, unit };
  },
  header(name: string, value?: string): Evidence {
    return { type: 'header', name, value, source: 'response' };
  },
  text(text: string): Evidence {
    return { type: 'text', text };
  },
};

/** Caps example lists so evidence stays short. */
export function limitExamples<T>(items: readonly T[], max = 3): T[] {
  return items.slice(0, max);
}