import type {
  AnalysisListResponse,
  AnalysisRunDetail,
  AnalysisRunListResponse,
  AnalysisSummary,
  ComparisonResultDto,
  CreateAnalysisResponse,
  FindingsExplorerRequest,
  FindingsExplorerResponse,
} from '@analyzer/contracts';
import { apiClient, type DownloadedFile } from '@/lib/api/client';

export function createAnalysis(websiteId: string): Promise<CreateAnalysisResponse> {
  return apiClient.request('/api/v1/analyses', {
    method: 'POST',
    body: JSON.stringify({ websiteId }),
  });
}

export function listAnalyses(): Promise<AnalysisListResponse> {
  return apiClient.request('/api/v1/analyses');
}

export function getAnalysis(analysisId: string): Promise<AnalysisSummary> {
  return apiClient.request(`/api/v1/analyses/${analysisId}`);
}

export function listRuns(analysisId: string): Promise<AnalysisRunListResponse> {
  return apiClient.request(`/api/v1/analyses/${analysisId}/runs`);
}

export function getRunDetail(analysisId: string, runId: string): Promise<AnalysisRunDetail> {
  return apiClient.request(`/api/v1/analyses/${analysisId}/runs/${runId}`);
}

export function getFindings(
  analysisId: string,
  request: FindingsExplorerRequest = {},
): Promise<FindingsExplorerResponse> {
  const params = new URLSearchParams();
  if (request.severity) params.set('severity', request.severity);
  if (request.category) params.set('category', request.category);
  if (request.search) params.set('search', request.search);
  if (request.sort) params.set('sort', request.sort);
  if (request.page) params.set('page', String(request.page));
  if (request.limit) params.set('limit', String(request.limit));
  const query = params.toString();
  return apiClient.request(`/api/v1/analyses/${analysisId}/findings${query ? `?${query}` : ''}`);
}

/** Deterministic diff of two runs; computed on demand by the API. */
export function getComparison(
  leftRunId: string,
  rightRunId: string,
): Promise<ComparisonResultDto> {
  const params = new URLSearchParams({ leftRunId, rightRunId });
  return apiClient.request(`/api/v1/analyses/compare?${params.toString()}`);
}

export function downloadAnalysisReport(analysisId: string): Promise<DownloadedFile> {
  return apiClient.download(`/api/v1/analyses/${analysisId}/report.pdf`);
}

export function downloadComparisonReport(
  leftRunId: string,
  rightRunId: string,
): Promise<DownloadedFile> {
  const params = new URLSearchParams({ leftRunId, rightRunId });
  return apiClient.download(`/api/v1/analyses/compare/report.pdf?${params.toString()}`);
}