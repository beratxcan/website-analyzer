import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { routeOf, type RouteAwareRequest } from './http-log';
import type { RequestWithRequestId } from './request-id.middleware';
import type { RequestUser } from './request-user';

type LoggedRequest = RouteAwareRequest & RequestWithRequestId & { user?: RequestUser };

/**
 * Emits one structured log line per completed request with the correlation id,
 * route pattern, status and duration. The line deliberately contains no query
 * string, body, cookie or header value, so credentials can never leak into
 * logs.
 *
 * The listener is attached to the response `finish` event rather than the
 * observable, so responses written directly by a controller (`@Res()` PDF
 * downloads) are measured accurately too.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Http');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<LoggedRequest>();
    const response = http.getResponse<Response>();
    const startedAt = process.hrtime.bigint();

    response.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const statusCode = response.statusCode;
      const line = JSON.stringify({
        event: 'http.request',
        requestId: request.requestId ?? null,
        userId: request.user?.id ?? null,
        method: request.method,
        route: routeOf(request),
        statusCode,
        durationMs: Math.round(durationMs),
      });

      if (statusCode >= 500) {
        this.logger.error(line);
      } else if (statusCode >= 400) {
        this.logger.warn(line);
      } else {
        this.logger.log(line);
      }
    });

    return next.handle();
  }
}
