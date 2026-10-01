import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { ProjectDto, ProjectListResponse } from '@analyzer/contracts';
import { ProjectResponseDto } from '../common/response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/request-user';
import { ACCESS_TOKEN_COOKIE } from '../auth/auth.constants';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List the current user\'s projects' })
  @ApiOkResponse({ description: 'List of projects' })
  list(@CurrentUser() user: RequestUser): Promise<ProjectListResponse> {
    return this.projectsService.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a project' })
  @ApiCreatedResponse({ type: ProjectResponseDto })
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateProjectDto): Promise<ProjectDto> {
    return this.projectsService.create(user.id, dto);
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Get a project by id' })
  @ApiOkResponse({ type: ProjectResponseDto })
  get(@CurrentUser() user: RequestUser, @Param('projectId') projectId: string): Promise<ProjectDto> {
    return this.projectsService.get(user.id, projectId);
  }

  @Patch(':projectId')
  @ApiOperation({ summary: 'Update a project' })
  @ApiOkResponse({ type: ProjectResponseDto })
  update(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectDto> {
    return this.projectsService.update(user.id, projectId, dto);
  }

  @Delete(':projectId')
  @ApiOperation({ summary: 'Delete a project' })
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
  ): Promise<void> {
    await this.projectsService.delete(user.id, projectId);
  }
}