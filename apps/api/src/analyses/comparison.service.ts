import { HttpStatus, Injectable } from '@nestjs/common';
import {
  compareRuns,
  validateComparison,
  type ComparisonValidationError,
  type RunComparison,
} from '@analyzer/analysis';
import type { ComparisonResultDto } from '@analyzer/contracts';
import { ApiException, ErrorCode } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  ownedRunWhere,
  RUN_RESULTS_INCLUDE,
  toComparableRun,
  type RunWithResults,
} from './run-results';

/**
 * Runtime-only comparison of two completed runs.
 *
 * Nothing is persisted: the diff is recomputed on every request from the
 * existing `AnalysisRun`/`AnalysisFinding`/`AnalysisScore` rows, so it can
 * never go stale. Ownership is enforced in the query, not after loading.
 */
@Injectable()
export class ComparisonService {
  constructor(private readonly prisma: PrismaService) {}

  async compare(
    userId: string,
    leftRunId: string,
    rightRunId: string,
  ): Promise<ComparisonResultDto> {
    const comparison = await this.compareForUser(userId, leftRunId, rightRunId);
    // The DTO mirrors the deterministic domain shape exactly; the compiler
    // enforces that they cannot drift apart.
    return comparison;
  }

  /** Validated deterministic diff, reused by the comparison report. */
  async compareForUser(
    userId: string,
    leftRunId: string,
    rightRunId: string,
  ): Promise<RunComparison> {
    const [leftRun, rightRun] = await Promise.all([
      this.loadRun(userId, leftRunId),
      this.loadRun(userId, rightRunId),
    ]);

    const violation = validateComparison(
      toMetadata(leftRun),
      toMetadata(rightRun),
    );
    if (violation) {
      throw toComparisonException(violation);
    }
    return compareRuns(toComparableRun(leftRun), toComparableRun(rightRun));
  }

  /** Loads a run only when it is reachable through the user's ownership chain. */
  async loadRun(userId: string, runId: string): Promise<RunWithResults> {
    const run = await this.prisma.analysisRun.findFirst({
      where: ownedRunWhere(userId, runId),
      include: RUN_RESULTS_INCLUDE,
    });
    if (!run) {
      // Both "does not exist" and "belongs to someone else" are a 404: an
      // unauthorized caller must not be able to probe run ids.
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.ANALYSIS_NOT_FOUND, 'Analysis run not found');
    }
    return run;
  }
}

function toMetadata(run: RunWithResults) {
  return {
    runId: run.id,
    websiteId: run.analysis.websiteId,
    status: run.status.toLowerCase(),
  };
}

export function toComparisonException(violation: ComparisonValidationError): ApiException {
  switch (violation) {
    case 'same_run':
      return new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.COMPARISON_SAME_RUN,
        'Select two different analysis runs to compare',
      );
    case 'different_website':
      return new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.COMPARISON_DIFFERENT_WEBSITE,
        'Only runs of the same website can be compared',
      );
    case 'incompatible_status':
      return new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.RUN_NOT_COMPARABLE,
        'Only completed or partially completed runs can be compared',
      );
  }
}
