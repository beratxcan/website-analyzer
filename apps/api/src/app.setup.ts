import type { INestApplication, ValidationPipeOptions } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { AppConfig } from './config/config.constants';
import { AppExceptionFilter } from './common/app-exception.filter';
import { requestIdMiddleware } from './common/request-id.middleware';
import { securityHeadersMiddleware } from './common/security-headers.middleware';

const validationPipeOptions: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
};

/** Path prefix of the interactive API docs (CSP is skipped there). */
export const DOCS_PATH = 'api/v1/docs';

export interface ConfigureAppOptions {
  /** Interactive docs disable the API CSP because they are an HTML app. */
  swaggerEnabled: boolean;
}

/**
 * Applies cross-cutting configuration shared by the production bootstrap and
 * integration tests so both exercise identical behavior.
 */
export function configureApp(
  app: INestApplication,
  config: AppConfig,
  options: ConfigureAppOptions,
): void {
  // Correlation ids first so every log line and error body can reference them.
  app.use(requestIdMiddleware);
  app.use(
    securityHeadersMiddleware({
      enableHsts: config.HSTS_ENABLED ?? config.NODE_ENV === 'production',
      ...(options.swaggerEnabled ? { docsPrefix: `/${DOCS_PATH}` } : {}),
    }),
  );
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  app.useGlobalFilters(new AppExceptionFilter());
  // Health stays at unversioned paths (`/health`, `/health/live`,
  // `/health/ready`) so probes are stable; business endpoints live under
  // `/api/v1`.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/live', 'health/ready'] });
}
