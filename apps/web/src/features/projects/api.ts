import type {
  CreateProjectRequest,
  ProjectDto,
  ProjectListResponse,
  UpdateProjectRequest,
} from '@analyzer/contracts';
import { apiClient } from '@/lib/api/client';

export function listProjects(): Promise<ProjectListResponse> {
  return apiClient.request('/api/v1/projects');
}

export function createProject(input: CreateProjectRequest): Promise<ProjectDto> {
  return apiClient.request('/api/v1/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getProject(projectId: string): Promise<ProjectDto> {
  return apiClient.request(`/api/v1/projects/${projectId}`);
}

export function updateProject(projectId: string, input: UpdateProjectRequest): Promise<ProjectDto> {
  return apiClient.request(`/api/v1/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteProject(projectId: string): Promise<void> {
  return apiClient.request(`/api/v1/projects/${projectId}`, { method: 'DELETE' });
}