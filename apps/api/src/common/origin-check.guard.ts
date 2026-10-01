import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { allowedCorsOrigins } from '@analyzer/config';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../config/config.constants';
import { ApiException, ErrorCode } from './errors';
import { routeOf, type RouteAwareRequest } from './http-log';
import type { RequestWithRequestId } from './request-id.middleware';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF mitigation for the cookie-based session model.
 *
 * Browsers always attach `Origin` to cross-origin state-changing requests, so
 * rejecting an unexpected origin blocks classic CSRF even though the session
 * cookie travels automatically. Requests without `Origin`/`Referer` (CLI
 * clients, server-to-server calls, integration tests) are allowed and remain
 * protected by the access token itself — this guard hardens the browser path,
 * it is not the only line of defence.
 *
 * `Origin: null` (sandboxed iframes, `file://`) is always rejected.
 */
@Injectable()
export class OriginCheckGuard implements CanActivate {
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.allowedOrigins = new Set(allowedCorsOrigins(config));
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RouteAwareRequest & RequestWithRequestId>();
    if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    const origin = requestOrigin(request);
    if (origin === null) {
      return true;
    }
    if (origin === 'null' || !this.allowedOrigins.has(origin)) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        ErrorCode.CSRF_ORIGIN_REJECTED,
        `Request origin is not allowed for ${routeOf(request)}`,
      );
    }
    return true;
  }
}

/** Normalized origin from `Origin`, falling back to `Referer`. */
function requestOrigin(request: Request): string | null {
  const origin = request.headers.origin;
  if (typeof origin === 'string' && origin.length > 0) {
    return origin.replace(/\/+$/, '');
  }
  const referer = request.headers.referer;
  if (typeof referer === 'string' && referer.length > 0) {
    try {
      return new URL(referer).origin;
    } catch {
      return 'null';
    }
  }
  return null;
}
