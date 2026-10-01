import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { HealthCheckResponse, LivenessResponse } from '@analyzer/contracts';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { THROTTLER_NAMES } from '../common/rate-limit.constants';
import { HealthService } from './health.service';

// Probes are never rate limited: orchestration must always get an answer.
@SkipThrottle({
  [THROTTLER_NAMES.general]: true,
  [THROTTLER_NAMES.auth]: true,
  [THROTTLER_NAMES.analysis]: true,
})
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Health report (always 200) with infrastructure connectivity',
    description:
      'Kept at HTTP 200 even when degraded so probes can separate "process down" from "dependency degraded"; the body carries the detail. Use /health/ready for a hard readiness signal.',
  })
  @ApiOkResponse({ description: 'Health check result' })
  check(): Promise<HealthCheckResponse> {
    return this.healthService.check();
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe — process is running (no dependency checks)' })
  @ApiOkResponse({ description: 'Process is alive' })
  live(): LivenessResponse {
    return this.healthService.liveness();
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe — 200 when PostgreSQL and Redis are reachable, 503 otherwise',
  })
  @ApiOkResponse({ description: 'All dependencies are reachable' })
  @ApiServiceUnavailableResponse({ description: 'At least one dependency is unreachable' })
  async ready(@Res({ passthrough: true }) response: Response): Promise<HealthCheckResponse> {
    const result = await this.healthService.check();
    response.status(result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
