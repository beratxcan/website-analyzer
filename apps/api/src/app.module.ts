import { Logger, Module, type ExecutionContext } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from './config/config.constants';
import { AnalysesModule } from './analyses/analyses.module';
import { AuthModule } from './auth/auth.module';
import { AppThrottlerGuard } from './common/app-throttler.guard';
import { OriginCheckGuard } from './common/origin-check.guard';
import { RATE_LIMIT_CATEGORY, THROTTLER_NAMES, type ThrottlerCategory } from './common/rate-limit.constants';
import { RedisThrottlerStorage } from './common/redis-throttler.storage';
import { RequestLoggingInterceptor } from './common/request-logging.interceptor';
import { ConfigModule } from './config/config.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { REDIS_CLIENT, RedisModule } from './redis/redis.module';
import { WebsitesModule } from './websites/websites.module';

/**
 * Builds the `skipIf` predicate for one throttler: it stays active for routes
 * whose `@RateLimitCategory` matches, and is skipped elsewhere. The general
 * throttler is the exception — it applies unless a route opted into another
 * category.
 */
function skipUnlessCategory(
  reflector: Reflector,
  category: ThrottlerCategory,
  options: { applyByDefault?: boolean } = {},
): (context: ExecutionContext) => boolean {
  return (context) => {
    const declared = reflector.getAllAndOverride<ThrottlerCategory | undefined>(RATE_LIMIT_CATEGORY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (options.applyByDefault === true) {
      return declared !== undefined && declared !== category;
    }
    return declared !== category;
  };
}

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    // Rate limiting is Redis-backed so every API instance shares one budget.
    // Categories are separate counters: general API, authentication and
    // analysis creation (see THROTTLER_NAMES).
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RedisModule],
      inject: [APP_CONFIG, REDIS_CLIENT, Reflector],
      useFactory: (config: AppConfig, redis: Redis, reflector: Reflector) => ({
        throttlers: [
          {
            name: THROTTLER_NAMES.general,
            ttl: config.THROTTLE_TTL,
            limit: config.THROTTLE_LIMIT,
            // Applies to everything that is not explicitly categorized.
            skipIf: skipUnlessCategory(reflector, THROTTLER_NAMES.general, { applyByDefault: true }),
          },
          {
            name: THROTTLER_NAMES.auth,
            ttl: config.THROTTLE_AUTH_TTL,
            limit: config.THROTTLE_AUTH_LIMIT,
            skipIf: skipUnlessCategory(reflector, THROTTLER_NAMES.auth),
          },
          {
            name: THROTTLER_NAMES.analysis,
            ttl: config.THROTTLE_ANALYSIS_TTL,
            limit: config.THROTTLE_ANALYSIS_LIMIT,
            skipIf: skipUnlessCategory(reflector, THROTTLER_NAMES.analysis),
          },
        ],
        storage: new RedisThrottlerStorage({
          redis,
          keyPrefix: config.RATE_LIMIT_KEY_PREFIX,
          failureMode: config.RATE_LIMIT_REDIS_FAILURE,
          onRedisFailure: (error, failClosed) => {
            const logger = new Logger('RateLimit');
            const message = error instanceof Error ? error.message : String(error);
            if (failClosed) {
              logger.error(`Redis unavailable (${message}) — security-critical throttler fails closed`);
            } else {
              logger.warn(`Redis unavailable (${message}) — throttler fails open`);
            }
          },
        }),
      }),
    }),
    HealthModule,
    AuthModule,
    ProjectsModule,
    WebsitesModule,
    AnalysesModule,
    DashboardModule,
  ],
  providers: [
    // Order matters: throttle floods and reject unexpected origins before the
    // request reaches authentication or business logic.
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: OriginCheckGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
  ],
})
export class AppModule {}
