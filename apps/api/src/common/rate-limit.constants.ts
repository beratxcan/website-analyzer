import { SetMetadata } from '@nestjs/common';

/** Throttler names shared between module config, decorators and storage. */
export const THROTTLER_NAMES = {
  /** General API budget, applied to every route that is not categorized. */
  general: 'default',
  /** Authentication endpoints (login/register/refresh) share one budget. */
  auth: 'auth',
  /** Analysis creation — triggers a deterministic run and AI enrichment. */
  analysis: 'analysis',
} as const;

export type ThrottlerCategory = (typeof THROTTLER_NAMES)[keyof typeof THROTTLER_NAMES];

/** Metadata key the throttler `skipIf` predicates read through the Reflector. */
export const RATE_LIMIT_CATEGORY = 'rateLimitCategory';

/**
 * Opts a controller or handler into a dedicated budget instead of the general
 * one.
 *
 * Categories are opt-in metadata read through the Nest `Reflector` — never
 * route or class name strings — so a newly added controller automatically gets
 * exactly the general budget and needs no changes here.
 */
export const RateLimitCategory = (category: ThrottlerCategory): MethodDecorator & ClassDecorator =>
  SetMetadata(RATE_LIMIT_CATEGORY, category);

/**
 * Throttlers that fail closed when Redis cannot serve the counter. Security
 * critical endpoints must never become unlimited because the limiter itself
 * is unavailable.
 */
export const FAIL_CLOSED_THROTTLERS: ReadonlySet<string> = new Set([THROTTLER_NAMES.auth]);
