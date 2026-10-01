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
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type {
  WebsiteAnalysesResponse,
  WebsiteDto,
  WebsiteListResponse,
  WebsiteTrendsResponse,
} from '@analyzer/contracts';
import { WebsiteResponseDto } from '../common/response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/request-user';
import { ACCESS_TOKEN_COOKIE } from '../auth/auth.constants';
import { AnalysesQueryDto } from './dto/analyses-query.dto';
import { CreateWebsiteDto } from './dto/create-website.dto';
import { UpdateWebsiteDto } from './dto/update-website.dto';
import { WebsitesService } from './websites.service';

@ApiTags('websites')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Controller()
export class WebsitesController {
  constructor(private readonly websitesService: WebsitesService) {}

  @Get('projects/:projectId/websites')
  @ApiOperation({ summary: 'List websites of a project' })
  @ApiOkResponse({ description: 'List of websites' })
  list(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
  ): Promise<WebsiteListResponse> {
    return this.websitesService.list(user.id, projectId);
  }

  @Post('projects/:projectId/websites')
  @ApiOperation({ summary: 'Create a website in a project' })
  @ApiCreatedResponse({ type: WebsiteResponseDto })
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: RequestUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateWebsiteDto,
  ): Promise<WebsiteDto> {
    return this.websitesService.create(user.id, projectId, dto);
  }

  @Get('websites/:websiteId')
  @ApiOperation({ summary: 'Get a website by id' })
  @ApiOkResponse({ type: WebsiteResponseDto })
  get(@CurrentUser() user: RequestUser, @Param('websiteId') websiteId: string): Promise<WebsiteDto> {
    return this.websitesService.get(user.id, websiteId);
  }

  @Get('websites/:websiteId/trends')
  @ApiOperation({ summary: 'Score history of a website (one point per completed run)' })
  @ApiOkResponse({ description: 'Trend points ordered oldest first' })
  trends(
    @CurrentUser() user: RequestUser,
    @Param('websiteId') websiteId: string,
  ): Promise<WebsiteTrendsResponse> {
    return this.websitesService.trends(user.id, websiteId);
  }

  @Get('websites/:websiteId/analyses')
  @ApiOperation({ summary: 'Paged analysis history of a website' })
  @ApiOkResponse({ description: 'Analyses ordered newest first with AI status' })
  analyses(
    @CurrentUser() user: RequestUser,
    @Param('websiteId') websiteId: string,
    @Query() query: AnalysesQueryDto,
  ): Promise<WebsiteAnalysesResponse> {
    return this.websitesService.analyses(user.id, websiteId, query.page ?? 1, query.limit ?? 10);
  }

  @Patch('websites/:websiteId')
  @ApiOperation({ summary: 'Update a website' })
  @ApiOkResponse({ type: WebsiteResponseDto })
  update(
    @CurrentUser() user: RequestUser,
    @Param('websiteId') websiteId: string,
    @Body() dto: UpdateWebsiteDto,
  ): Promise<WebsiteDto> {
    return this.websitesService.update(user.id, websiteId, dto);
  }

  @Delete('websites/:websiteId')
  @ApiOperation({ summary: 'Delete a website' })
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: RequestUser,
    @Param('websiteId') websiteId: string,
  ): Promise<void> {
    await this.websitesService.delete(user.id, websiteId);
  }
}