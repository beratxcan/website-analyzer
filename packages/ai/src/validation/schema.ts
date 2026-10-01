/**
 * Structured-output schema for the analysis-insights task. Every model
 * response passes through this schema before domain validation; free-form
 * parsing is never trusted.
 */
import { z } from 'zod';
import type { AIInsightResult as DomainAIInsightResult } from '../domain';

export const aiInsightResultSchema = z.object({
  summary: z.object({
    headline: z.string().min(1).max(200),
    overview: z.string().min(1).max(2_000),
    strengths: z.array(z.string().min(1).max(500)).max(8),
    weaknesses: z.array(z.string().min(1).max(500)).max(8),
  }),
  recommendations: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().min(1).max(2_000),
        priority: z.enum(['low', 'medium', 'high', 'critical']),
        effort: z.enum(['low', 'medium', 'high']),
        impact: z.enum(['low', 'medium', 'high']),
        category: z.enum(['seo', 'technical', 'content', 'accessibility', 'performance']),
        relatedFindingCodes: z.array(z.string().min(1)).min(1).max(10),
      }),
    )
    .max(10),
});

export type AIInsightResult = z.infer<typeof aiInsightResultSchema>;

// Compile-time guard: the validated output shape matches the domain type.
export const _shapeCheck: DomainAIInsightResult extends AIInsightResult ? true : never = true;

/** Returns human-readable validation issues, or an empty array when valid. */
export function validateAIInsightOutput(value: unknown): string[] {
  const parsed = aiInsightResultSchema.safeParse(value);
  if (parsed.success) return [];
  return parsed.error.issues.map(
    (issue) => `${issue.path.length > 0 ? issue.path.join('.') : 'root'}: ${issue.message}`,
  );
}