import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  ActivityFeedResponse,
  DashboardOverviewDto,
  TopIssuesResponse,
} from '@analyzer/contracts';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/request-user';
import { ACCESS_TOKEN_COOKIE } from '../auth/auth.constants';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Aggregated counts and average score for the dashboard cards' })
  @ApiOkResponse({ description: 'Dashboard overview numbers' })
  overview(@CurrentUser() user: RequestUser): Promise<DashboardOverviewDto> {
    return this.dashboardService.overview(user.id);
  }

  @Get('top-issues')
  @ApiOperation({ summary: 'Most frequent finding codes across the user analyses' })
  @ApiOkResponse({ description: 'Top issues by occurrence count' })
  topIssues(
    @CurrentUser() user: RequestUser,
    @Query('limit', new DefaultValuePipe(8), new ParseIntPipe({ optional: true })) limit = 8,
  ): Promise<TopIssuesResponse> {
    return this.dashboardService.topIssues(user.id, Math.min(Math.max(limit, 1), 50));
  }

  @Get('activity')
  @ApiOperation({ summary: 'Recent activity feed (projected from existing records)' })
  @ApiOkResponse({ description: 'Merged, time-ordered activity events' })
  activity(
    @CurrentUser() user: RequestUser,
    @Query('limit', new DefaultValuePipe(20), new ParseIntPipe({ optional: true })) limit = 20,
  ): Promise<ActivityFeedResponse> {
    return this.dashboardService.activity(user.id, Math.min(Math.max(limit, 1), 100));
  }
}