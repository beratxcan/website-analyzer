import { HttpStatus, Injectable } from '@nestjs/common';
import {
  buildReportFilename,
  PdfReportRenderer,
  ReportBuilder,
  type ReportDocument,
  type ReportKind,
  type ReportSource,
} from '@analyzer/report';
import { ApiException, ErrorCode } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { ComparisonService } from './comparison.service';
import {
  REPORTABLE_RUN_STATUSES,
  RUN_RESULTS_INCLUDE,
  toReportSource,
  type RunWithResults,
} from './run-results';

export interface RenderedReport {
  bytes: Uint8Array;
  filename: string;
}

/**
 * Builds professional reports on demand.
 *
 * The service is the only place that touches Prisma; the report package
 * itself is persistence-independent. PDF generation happens entirely outside
 * any database transaction, over a single bounded run, so request latency and
 * memory stay predictable. No report is ever persisted.
 */
@Injectable()
export class ReportsService {
  private readonly builder = new ReportBuilder();
  private readonly renderer = new PdfReportRenderer();

  constructor(
    private readonly prisma: PrismaService,
    private readonly comparisonService: ComparisonService,
  ) {}

  /** JSON projection of the report — the same model the PDF renderer consumes. */
  async document(userId: string, analysisId: string): Promise<ReportDocument> {
    const run = await this.loadReportableRun(userId, analysisId);
    return this.builder.build(toReportSource(run));
  }

  /** PDF of the latest completed run of an analysis. */
  async pdf(userId: string, analysisId: string): Promise<RenderedReport> {
    const run = await this.loadReportableRun(userId, analysisId);
    return this.render(toReportSource(run), 'analysis');
  }

  /**
   * PDF of the current run, enriched with the deterministic comparison
   * against the baseline run.
   */
  async comparisonPdf(
    userId: string,
    leftRunId: string,
    rightRunId: string,
  ): Promise<RenderedReport> {
    const comparison = await this.comparisonService.compareForUser(userId, leftRunId, rightRunId);
    const current = await this.comparisonService.loadRun(userId, rightRunId);
    return this.render(toReportSource(current, comparison), 'comparison');
  }

  private async render(source: ReportSource, kind: ReportKind): Promise<RenderedReport> {
    const report = this.builder.build(source);
    const bytes = await this.renderer.render(report);
    return {
      bytes,
      filename: buildReportFilename({
        // Host is user-influenced; the filename builder treats it as untrusted.
        host: source.website.host || source.website.name,
        date: report.metadata.analysisDate,
        kind,
      }),
    };
  }

  /**
   * Resolves the run a report is generated from: the newest run of the
   * analysis that finished (fully or partially), scoped to the caller's
   * ownership chain.
   */
  private async loadReportableRun(userId: string, analysisId: string): Promise<RunWithResults> {
    const run = await this.prisma.analysisRun.findFirst({
      where: {
        analysisId,
        status: { in: REPORTABLE_RUN_STATUSES },
        analysis: { website: { project: { userId } } },
      },
      include: RUN_RESULTS_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    if (run) return run;

    // Distinguish "not yours / does not exist" (404) from "nothing to report
    // yet" (409) without ever revealing another user's analysis.
    const visible = await this.prisma.analysis.findFirst({
      where: { id: analysisId, website: { project: { userId } } },
      select: { id: true },
    });
    if (!visible) {
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.ANALYSIS_NOT_FOUND, 'Analysis not found');
    }
    throw new ApiException(
      HttpStatus.CONFLICT,
      ErrorCode.REPORT_UNAVAILABLE,
      'This analysis has no completed run to report yet',
    );
  }
}
