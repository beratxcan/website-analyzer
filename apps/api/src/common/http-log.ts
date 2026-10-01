import type { Request } from 'express';

/** Express request with the matched route pattern, when available. */
export type RouteAwareRequest = Request & { route?: { path?: string } };

/**
 * Route identifier for logs. Prefers the matched route *pattern* (e.g.
 * `/api/v1/analyses/:id`) so logs are low-cardinality and never carry resource
 * ids or query strings.
 */
export function routeOf(request: RouteAwareRequest): string {
  const pattern = request.route?.path;
  if (typeof pattern === 'string' && pattern.length > 0) {
    return pattern.slice(0, 200);
  }
  const raw = request.originalUrl ?? request.url ?? '/';
  return (raw.split('?')[0] ?? '/').slice(0, 200);
}
