import { createHash } from 'node:crypto';
import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Response } from 'express';
import { routeOf, type RouteAwareRequest } from './http-log';
import type { RequestWithRequestId } from './request-id.middleware';

/**
 * Rate-limit guard with two deliberate deviations from the default:
 *
 * 1. **Budget bucketing** — the key is derived from the throttler *category*
 *    plus the caller, not the matched route. Rotating across endpoints can
 *    therefore never multiply a caller's budget.
 * 2. **Structured rejection log** — 429s are logged with the correlation id so
 *    abuse is observable in production.
 *
 * The base guard emits `X-RateLimit-*` headers and a *category-suffixed*
 * `Retry-After-<name>` header. A plain `Retry-After` is added here as well so
 * clients never need to know the internal category name to back off.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger('RateLimit');

  protected override generateKey(
    _context: ExecutionContext,
    tracker: string,
    throttlerName: string,
  ): string {
    return createHash('sha256').update(`rate-limit:${throttlerName}:${tracker}`).digest('hex');
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest<RouteAwareRequest & RequestWithRequestId>();
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Retry-After', detail.timeToBlockExpire);
    this.logger.warn(
      JSON.stringify({
        event: 'http.rate_limited',
        requestId: request.requestId ?? null,
        method: request.method,
        route: routeOf(request),
        limit: detail.limit,
        windowSeconds: Math.ceil(detail.ttl / 1000),
        retryAfterSeconds: detail.timeToBlockExpire,
      }),
    );
    await super.throwThrottlingException(context, detail);
  }
}
