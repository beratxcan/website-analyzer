import type { AuthUser, ProjectDto, WebsiteDto } from '@analyzer/contracts';
import type { Project, User, Website } from '@prisma/client';

/** Maps a persisted user to the safe API representation (no password hash). */
export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function toProjectDto(project: Project): ProjectDto {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export function toWebsiteDto(website: Website): WebsiteDto {
  return {
    id: website.id,
    projectId: website.projectId,
    name: website.name,
    url: website.url,
    normalizedUrl: website.normalizedUrl,
    host: website.host,
    createdAt: website.createdAt.toISOString(),
    updatedAt: website.updatedAt.toISOString(),
  };
}