import type { Job, Processor } from 'bullmq';
import type { AnalysisJobPayload } from '@analyzer/contracts';
import type { AnalysisExecutionService } from './analysis-execution.service';

/**
 * Builds the BullMQ processor for the analysis queue. The processor is a
 * thin adapter: all orchestration lives in {@link AnalysisExecutionService}.
 */
export function createAnalysisProcessor(service: AnalysisExecutionService): Processor {
  return async (job: Job<AnalysisJobPayload>): Promise<void> => {
    await service.execute(job);
  };
}