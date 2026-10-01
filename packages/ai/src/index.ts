// Orchestrator
export { AIOrchestrator } from './orchestrator';
export type { AIOrchestrationOutcome, AIOrchestratorOptions } from './orchestrator';

// Context & evidence selection
export { AIContextBuilder, EvidenceSelector, compactEvidence } from './context';
export type { EvidenceSelectorOptions } from './context';

// Providers
export { OpenAICompatibleProvider } from './providers/openai-compatible';
export type { OpenAICompatibleProviderOptions } from './providers/openai-compatible';

// Prompt registry
export { registerPrompt, getPrompt, registeredTasks } from './prompts/registry';
export type { PromptDefinition, RegisteredPrompt } from './prompts/registry';
export {
  ANALYSIS_INSIGHTS,
  buildUserPrompt as buildAnalysisInsightsUserPrompt,
} from './prompts/analysis-insights';
export type { AnalysisInsightsOptions } from './prompts/analysis-insights';

// Validation
export { aiInsightResultSchema, validateAIInsightOutput } from './validation/schema';
export type { AIInsightResult as ValidatedAIInsightResult } from './validation/schema';
export { DomainValidator } from './validation/domain';
export type { DomainValidatorOptions } from './validation/domain';

// Usage tracking
export { estimateCostUsd, getModelPricing, USD_CURRENCY } from './usage';
export type { ModelPricing } from './usage';

// Errors
export { AIProviderError, AIValidationError, isRetryableProviderError } from './errors';
export type { AIProviderErrorCode } from './errors';

// Domain
export { AI_CATEGORIES, severityRank } from './domain';
export type {
  AIAnalysisContext,
  AICategory,
  AIEffort,
  AIFindingContext,
  AIGenerationResponse,
  AIInsightResult,
  AIProvider,
  AIPromptRequest,
  AIRecommendation,
  AIRecommendationPriority,
  AIStatus,
  AISummary,
  AITask,
  AIImpact,
  AnalysisSnapshot,
} from './domain';