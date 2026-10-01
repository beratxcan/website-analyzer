/**
 * Website trends and analysis-history contracts. Trends are derived from
 * persisted AnalysisRun + AnalysisScore snapshots — no new tables.
 */

export interface WebsiteTrendPointDto {
  runId: string;
  analysisId: string;
  createdAt: string;
  overall: number | null;
  seo: number | null;
  technical: number | null;
  content: number | null;
  accessibility: number | null;
  performance: number | null;
}

export type WebsiteTrendsResponse = WebsiteTrendPointDto[];

export type WebsiteAnalysisStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface WebsiteAnalysisListItemDto {
  id: string;
  status: WebsiteAnalysisStatus;
  runId: string | null;
  overallScore: number | null;
  aiStatus: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteAnalysesResponse {
  items: WebsiteAnalysisListItemDto[];
  total: number;
  page: number;
  limit: number;
}