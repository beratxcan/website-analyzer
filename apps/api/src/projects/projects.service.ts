import { HttpStatus, Injectable } from '@nestjs/common';
import type { ProjectDto, ProjectListResponse } from '@analyzer/contracts';
import type { Project } from '@prisma/client';
import { ApiException, ErrorCode } from '../common/errors';
import { toProjectDto } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ProjectListResponse> {
    const projects = await this.prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return { items: projects.map(toProjectDto) };
  }

  async create(userId: string, dto: CreateProjectDto): Promise<ProjectDto> {
    const project = await this.prisma.project.create({
      data: { userId, name: dto.name, description: dto.description ?? null },
    });
    return toProjectDto(project);
  }

  async get(userId: string, projectId: string): Promise<ProjectDto> {
    const project = await this.getOwnedProject(userId, projectId);
    return toProjectDto(project);
  }

  async update(userId: string, projectId: string, dto: UpdateProjectDto): Promise<ProjectDto> {
    await this.getOwnedProject(userId, projectId);
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });
    return toProjectDto(project);
  }

  async delete(userId: string, projectId: string): Promise<void> {
    await this.getOwnedProject(userId, projectId);
    await this.prisma.project.delete({ where: { id: projectId } });
  }

  /**
   * Resolves a project only when it belongs to the user. Ownership is scoped
   * in the query itself so another user's project id yields a 404 without
   * revealing whether the resource exists.
   */
  async getOwnedProject(userId: string, projectId: string): Promise<Project> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
    });
    if (!project) {
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.PROJECT_NOT_FOUND, 'Project not found');
    }
    return project;
  }
}