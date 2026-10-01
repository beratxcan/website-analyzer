import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { allowedCorsOrigins, loadApiConfig, loadEnvFile } from '@analyzer/config';
import { logLevelsFor } from '@analyzer/shared';
import { AppModule } from './app.module';
import { DOCS_PATH, configureApp } from './app.setup';
import { APP_VERSION } from './version';

/** Headers the browser client is allowed to read on cross-origin responses. */
const EXPOSED_HEADERS = [
  'X-Request-Id',
  'Content-Disposition',
  'Retry-After',
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
];

async function bootstrap(): Promise<void> {
  loadEnvFile();
  const config = loadApiConfig();
  // Interactive docs are opt-in in production and on by default elsewhere.
  const swaggerEnabled = config.SWAGGER_ENABLED ?? config.NODE_ENV !== 'production';
  const allowedOrigins = allowedCorsOrigins(config);

  const app = await NestFactory.create(AppModule, { logger: logLevelsFor(config.LOG_LEVEL) });
  configureApp(app, config, { swaggerEnabled });

  // Explicit origin allowlist with credentials — never a wildcard.
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Request-Id'],
    exposedHeaders: EXPOSED_HEADERS,
    maxAge: 600,
  });

  if (config.TRUST_PROXY > 0) {
    // Rate limiting keys on the client IP; behind a proxy that requires an
    // explicit, bounded number of trusted hops.
    app.getHttpAdapter().getInstance().set('trust proxy', config.TRUST_PROXY);
  }
  app.enableShutdownHooks();

  if (swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Website Analyzer API')
        .setDescription('REST API for the AI SaaS Website Analyzer.')
        .setVersion(APP_VERSION)
        .build(),
    );
    SwaggerModule.setup(DOCS_PATH, app, document);
  }

  await app.listen(config.API_PORT, '0.0.0.0');
  Logger.log(`API listening on http://localhost:${config.API_PORT}`, 'Bootstrap');
  Logger.log(`CORS origins: ${allowedOrigins.join(', ')}`, 'Bootstrap');
  Logger.log(
    swaggerEnabled ? `Swagger UI available at /${DOCS_PATH}` : 'Swagger UI disabled',
    'Bootstrap',
  );
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : String(error), undefined, 'Bootstrap');
  process.exit(1);
});
