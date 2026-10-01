import type {
  CreateWebsiteRequest,
  UpdateWebsiteRequest,
  WebsiteAnalysesResponse,
  WebsiteDto,
  WebsiteListResponse,
  WebsiteTrendsResponse,
} from '@analyzer/contracts';
import { apiClient } from '@/lib/api/client';

export function listWebsites(projectId: string): Promise<WebsiteListResponse> {
  return apiClient.request(`/api/v1/projects/${projectId}/websites`);
}

export function getWebsite(websiteId: string): Promise<WebsiteDto> {
  return apiClient.request(`/api/v1/websites/${websiteId}`);
}

export function createWebsite(projectId: string, input: CreateWebsiteRequest): Promise<WebsiteDto> {
  return apiClient.request(`/api/v1/projects/${projectId}/websites`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateWebsite(websiteId: string, input: UpdateWebsiteRequest): Promise<WebsiteDto> {
  return apiClient.request(`/api/v1/websites/${websiteId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteWebsite(websiteId: string): Promise<void> {
  return apiClient.request(`/api/v1/websites/${websiteId}`, { method: 'DELETE' });
}

export function getWebsiteTrends(websiteId: string): Promise<WebsiteTrendsResponse> {
  return apiClient.request(`/api/v1/websites/${websiteId}/trends`);
}

export function getWebsiteAnalyses(
  websiteId: string,
  page = 1,
  limit = 10,
): Promise<WebsiteAnalysesResponse> {
  return apiClient.request(`/api/v1/websites/${websiteId}/analyses?page=${page}&limit=${limit}`);
}