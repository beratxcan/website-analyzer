/**
 * Dashboard contracts. All values are projections/aggregations over the
 * existing domain models — no dedicated dashboard entities exist.
 */

export interface DashboardOverviewDto {
  totalProjects: number;
  totalWebsites: number;
  totalAnalyses: number;
  completedAnalyses: number;
  failedAnalyses: number;
  averageScore: number | null;
}

export interface TopIssueDto {
  ruleCode: string;
  title: string;
  category: string;
  severity: string;
  count: number;
}

export interface TopIssuesResponse {
  items: TopIssueDto[];
}

export type ActivityEventType =
  | 'project_created'
  | 'website_added'
  | 'analysis_completed'
  | 'ai_insights_generated';

export interface ActivityEventDto {
  id: string;
  type: ActivityEventType;
  title: string;
  description: string;
  timestamp: string;
  analysisId: string | null;
  websiteId: string | null;
  projectId: string | null;
}

export interface ActivityFeedResponse {
  items: ActivityEventDto[];
}