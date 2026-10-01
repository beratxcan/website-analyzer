import type {
  ActivityFeedResponse,
  DashboardOverviewDto,
  TopIssuesResponse,
} from '@analyzer/contracts';
import { apiClient } from '@/lib/api/client';

export function getDashboardOverview(): Promise<DashboardOverviewDto> {
  return apiClient.request('/api/v1/dashboard/overview');
}

export function getTopIssues(limit = 8): Promise<TopIssuesResponse> {
  return apiClient.request(`/api/v1/dashboard/top-issues?limit=${limit}`);
}

export function getActivity(limit = 20): Promise<ActivityFeedResponse> {
  return apiClient.request(`/api/v1/dashboard/activity?limit=${limit}`);
}