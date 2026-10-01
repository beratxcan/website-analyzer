/**
 * Token usage and cost estimation.
 *
 * Cost calculation is centralized here — provider pricing never leaks into
 * application code. Models without a known price return `null` instead of a
 * fabricated estimate. This is tracking only, not billing.
 */

export interface ModelPricing {
  /** USD per 1M input tokens. */
  inputPerMillionUsd: number;
  /** USD per 1M output tokens. */
  outputPerMillionUsd: number;
}

/** Common OpenAI-compatible model prices (per 1M tokens, USD). */
const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-4o-mini': { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 },
  'gpt-4o': { inputPerMillionUsd: 2.5, outputPerMillionUsd: 10 },
  'gpt-4.1-mini': { inputPerMillionUsd: 0.4, outputPerMillionUsd: 1.6 },
  'gpt-4.1': { inputPerMillionUsd: 2, outputPerMillionUsd: 8 },
  'gpt-4.1-nano': { inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.4 },
  'o4-mini': { inputPerMillionUsd: 1.1, outputPerMillionUsd: 4.4 },
};

export const USD_CURRENCY = 'USD';

export function getModelPricing(model: string): ModelPricing | undefined {
  return MODEL_PRICING[model];
}

/**
 * Estimates the cost of a generation in USD, or returns `null` when the
 * model's price is unknown (no fabricated estimates).
 */
export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): { costUsd: number; currency: typeof USD_CURRENCY } | null {
  const pricing = getModelPricing(model);
  if (!pricing) return null;
  const costUsd =
    (inputTokens / 1_000_000) * pricing.inputPerMillionUsd +
    (outputTokens / 1_000_000) * pricing.outputPerMillionUsd;
  return { costUsd: Math.round(costUsd * 1_000_000) / 1_000_000, currency: USD_CURRENCY };
}