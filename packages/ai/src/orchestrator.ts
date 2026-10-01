/**
 * AIOrchestrator — the application entry point of the AI layer.
 *
 * ```text
 * snapshot → context builder → prompt registry → provider → schema validation
 *          → domain validation → (bounded repair) → AIInsightResult
 * ```
 *
 * Provider errors propagate untouched (the caller applies retry policy);
 * invalid model output triggers at most {@link AIOrchestratorOptions.maxRepairs}
 * repair attempts, then raises {@link AIValidationError}.
 */
import { z } from 'zod';
import { AIContextBuilder, EvidenceSelector } from './context';
import type {
  AIInsightResult,
  AIProvider,
  AIPromptRequest,
  AIGenerationResponse,
  AnalysisSnapshot,
} from './domain';
import { AIValidationError } from './errors';
import {
  ANALYSIS_INSIGHTS,
  buildRepairPrompt,
  buildUserPrompt,
  type AnalysisInsightsOptions,
} from './prompts/analysis-insights';
import { getPrompt } from './prompts/registry';
import { aiInsightResultSchema, validateAIInsightOutput } from './validation/schema';
import { DomainValidator } from './validation/domain';

export interface AIOrchestratorOptions {
  provider: AIProvider;
  /** Model to request; the provider may still resolve its own default. */
  model?: string;
  contextBuilder?: AIContextBuilder;
  domainValidator?: DomainValidator;
  maxFindings?: number;
  maxRecommendations?: number;
  /** Bounded repair attempts for invalid model output (default 1). */
  maxRepairs?: number;
}

export interface AIOrchestrationOutcome {
  result: AIInsightResult;
  generation: AIGenerationResponse;
  promptVersion: string;
  schemaVersion: string;
  repaired: boolean;
  generationAttempts: number;
}

function parseStructuredContent(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Repair-friendly fallback: extract the first balanced {...} block
    // (models occasionally wrap JSON in prose or code fences).
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // fall through to the validation error below
      }
    }
    throw new AIValidationError('schema', ['model output is not valid JSON']);
  }
}

export class AIOrchestrator {
  private readonly provider: AIProvider;
  private readonly model: string;
  private readonly contextBuilder: AIContextBuilder;
  private readonly domainValidator: DomainValidator;
  private readonly maxRecommendations: number;
  private readonly maxRepairs: number;

  constructor(options: AIOrchestratorOptions) {
    this.provider = options.provider;
    this.model = options.model ?? 'unset';
    this.contextBuilder =
      options.contextBuilder ??
      new AIContextBuilder(new EvidenceSelector({ maxFindings: options.maxFindings }));
    this.domainValidator =
      options.domainValidator ??
      new DomainValidator({ maxRecommendations: options.maxRecommendations });
    this.maxRecommendations = options.maxRecommendations ?? 8;
    this.maxRepairs = options.maxRepairs ?? 1;
  }

  async generate(snapshot: AnalysisSnapshot): Promise<AIOrchestrationOutcome> {
    const prompt = getPrompt(ANALYSIS_INSIGHTS.task);
    if (!prompt) {
      throw new Error(`No prompt registered for task "${ANALYSIS_INSIGHTS.task}"`);
    }

    const context = this.contextBuilder.build(snapshot);
    const options: AnalysisInsightsOptions = {
      maxRecommendations: this.maxRecommendations,
      jsonSchemaDescription: JSON.stringify(z.toJSONSchema(aiInsightResultSchema)),
    };

    const toRequest = (systemPrompt: string, userPrompt: string): AIPromptRequest => ({
      task: ANALYSIS_INSIGHTS.task,
      model: this.model,
      systemPrompt,
      userPrompt,
      schema: aiInsightResultSchema,
    });

    /** Schema validation → domain validation. Throws AIValidationError. */
    const validate = (parsed: unknown): AIInsightResult => {
      const issues = validateAIInsightOutput(parsed);
      if (issues.length > 0) {
        throw new AIValidationError('schema', issues);
      }
      const result = parsed as AIInsightResult;
      this.domainValidator.validate(result, context);
      return result;
    };

    let generation = await this.provider.generateStructured(
      toRequest(prompt.system(), prompt.user(context, options as Record<string, unknown>)),
    );
    let repaired = false;
    let parsed: unknown;

    try {
      parsed = parseStructuredContent(generation.content);
      validate(parsed);
    } catch (error) {
      if (!(error instanceof AIValidationError) || this.maxRepairs < 1) {
        throw error;
      }
      repaired = true;
      const repairPrompt = buildRepairPrompt(context, parsed, error.issues, options);
      generation = await this.provider.generateStructured(
        toRequest(prompt.system(), repairPrompt),
      );
      parsed = parseStructuredContent(generation.content);
      // Second failure is final.
      validate(parsed);
    }

    return {
      result: parsed as AIInsightResult,
      generation,
      promptVersion: prompt.promptVersion,
      schemaVersion: prompt.schemaVersion,
      repaired,
      generationAttempts: repaired ? 2 : 1,
    };
  }
}

export { buildUserPrompt as buildAnalysisInsightsPrompt };