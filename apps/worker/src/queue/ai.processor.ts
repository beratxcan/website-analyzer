import type { Job, Processor } from 'bullmq';
import type { AIJobPayload } from '@analyzer/contracts';
import type { AIExecutionService } from './ai-execution.service';

/**
 * Builds the BullMQ processor for the AI queue. Thin adapter — all
 * orchestration lives in {@link AIExecutionService}.
 */
export function createAIProcessor(service: AIExecutionService): Processor {
  return async (job: Job<AIJobPayload>): Promise<void> => {
    await service.execute(job);
  };
}