import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';

import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type {
  AnalysisListResponse,
  AnalysisRunDetail,
  AnalysisRunListResponse,
  AnalysisSummary,
  CancelAnalysisResponse,
  ComparisonResultDto,
  CreateAnalysisResponse,
  FindingsExplorerResponse,
  ReportDocumentDto,
} from '@analyzer/contracts';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimitCategory, THROTTLER_NAMES } from '../common/rate-limit.constants';
import type { RequestUser } from '../common/request-user';
import { ACCESS_TOKEN_COOKIE } from '../auth/auth.constants';
import { AnalysesService } from './analyses.service';
import { ComparisonService } from './comparison.service';
import { ReportsService, type RenderedReport } from './reports.service';
import { CompareRunsQueryDto } from './dto/compare-runs-query.dto';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import { FindingsQueryDto } from './dto/findings-query.dto';

@ApiTags('analyses')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Controller('analyses')
export class AnalysesController {
  constructor(
    private readonly analysesService: AnalysesService,
    private readonly comparisonService: ComparisonService,
    private readonly reportsService: ReportsService,
  ) {}

  // Creating an analysis triggers a queued run and (when enabled) an AI
  // enrichment call — the stricter, dedicated budget applies instead of the
  // general one, which also caps AI cost abuse per caller. Reads (including
  // the polling endpoints) stay on the general budget.
  @RateLimitCategory(THROTTLER_NAMES.analysis)
  @Post()
  @ApiOperation({ summary: 'Create an analysis for a website (asynchronous)' })
  @ApiCreatedResponse({ description: 'New analysis and its first queued run' })
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateAnalysisDto): Promise<CreateAnalysisResponse> {
    return this.analysesService.create(user.id, dto.websiteId);
  }

  @Get()
  @ApiOperation({ summary: 'List the current user analyses' })
  @ApiOkResponse({ description: 'Analyses ordered by creation date (newest first)' })
  list(@CurrentUser() user: RequestUser): Promise<AnalysisListResponse> {
    return this.analysesService.list(user.id);
  }

  // Static routes must be declared before `:id` so `/analyses/compare` is not
  // captured by the parameterized route.
  @Get('compare')
  @ApiOperation({ summary: 'Compare two completed runs of the same website' })
  @ApiOkResponse({ description: 'Deterministic score and finding diff (never persisted)' })
  compare(
    @CurrentUser() user: RequestUser,
    @Query() query: CompareRunsQueryDto,
  ): Promise<ComparisonResultDto> {
    return this.comparisonService.compare(user.id, query.leftRunId, query.rightRunId);
  }

  @Get('compare/report.pdf')
  @ApiOperation({ summary: 'Download a PDF report of the current run compared with the baseline' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Server-rendered PDF report with the comparison section' })
  async comparisonReportPdf(
    @CurrentUser() user: RequestUser,
    @Query() query: CompareRunsQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const report = await this.reportsService.comparisonPdf(
      user.id,
      query.leftRunId,
      query.rightRunId,
    );
    sendPdf(response, report);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an analysis by id' })
  @ApiOkResponse({ description: 'Analysis with its website and latest run' })
  get(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<AnalysisSummary> {
    return this.analysesService.get(user.id, id);
  }

  @Get(':id/runs')
  @ApiOperation({ summary: 'List runs of an analysis' })
  @ApiOkResponse({ description: 'Runs ordered by creation date (newest first)' })
  runs(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<AnalysisRunListResponse> {
    return this.analysesService.runs(user.id, id);
  }

  @Get(':id/runs/:runId')
  @ApiOperation({ summary: 'Get a run with its findings and scores' })
  @ApiOkResponse({ description: 'Run detail including persisted findings and score snapshots' })
  runDetail(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('runId') runId: string,
  ): Promise<AnalysisRunDetail> {
    return this.analysesService.runDetail(user.id, id, runId);
  }

  @Get(':id/findings')
  @ApiOperation({ summary: 'Filtered and paged findings of an analysis (latest run)' })
  @ApiOkResponse({ description: 'Findings matching severity/category/search with pagination' })
  findings(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query() query: FindingsQueryDto,
  ): Promise<FindingsExplorerResponse> {
    return this.analysesService.findings(user.id, id, query);
  }

  @Get(':id/report')
  @ApiOperation({ summary: 'Get the professional report document of an analysis as JSON' })
  @ApiOkResponse({ description: 'ReportDocument projection (same model the PDF renders)' })
  report(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<ReportDocumentDto> {
    return this.reportsService.document(user.id, id);
  }

  @Get(':id/report.pdf')
  @ApiOperation({ summary: 'Download the professional PDF report of an analysis' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Server-rendered PDF report' })
  async reportPdf(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const report = await this.reportsService.pdf(user.id, id);
    sendPdf(response, report);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a pending or running analysis' })
  @ApiOkResponse({ description: 'Cancelled analysis' })
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<CancelAnalysisResponse> {
    return this.analysesService.cancel(user.id, id);
  }
}

/**
 * Streams a rendered report. The filename is produced by the report package
 * from a strict `[a-z0-9-]` slug, so it can never inject response headers.
 */
function sendPdf(response: Response, report: RenderedReport): void {
  const body = Buffer.from(report.bytes);
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Length', body.byteLength);
  response.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
  response.setHeader('Cache-Control', 'no-store');
  response.status(HttpStatus.OK);
  response.end(body);
}
