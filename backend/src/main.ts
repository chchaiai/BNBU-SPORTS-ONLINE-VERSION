import 'reflect-metadata';

import type { Server } from 'node:http';

import { json, urlencoded, type Express } from 'express';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';

import type { RuntimeConfig } from './common/config/environment.js';
import { RUNTIME_CONFIG } from './common/config/runtime-config.module.js';
import { loadRuntimeSecrets } from './common/config/file-json-secret-loader.js';
import { BodyParserErrorMiddleware } from './common/http/body-parser-error.middleware.js';
import { RequestIdMiddleware } from './common/http/request-id.js';
import { validationException } from './common/http/validation.js';
import { JsonLoggerService } from './common/logging/json-logger.service.js';
import openApiDocument from './generated/openapi.document.generated.json' with { type: 'json' };

async function bootstrap(): Promise<void> {
  await loadRuntimeSecrets(process.env);
  const { AppModule } = await import('./app.module.js');
  const application = await NestFactory.create(AppModule, {
    abortOnError: true,
    bodyParser: false,
    bufferLogs: true,
  });

  const config = application.get<RuntimeConfig>(RUNTIME_CONFIG);
  const logger = application.get(JsonLoggerService);
  const requestIds = application.get(RequestIdMiddleware);
  const bodyParserErrors = application.get(BodyParserErrorMiddleware);
  const localDocumentationEnabled =
    config.appEnvironment === 'local' || config.appEnvironment === 'development';
  application.useLogger(logger);
  application.use(requestIds.use.bind(requestIds));
  application.use(localDocumentationEnabled ? helmet({ contentSecurityPolicy: false }) : helmet());
  application.use(json({ limit: config.requestBodyLimitBytes, strict: true }));
  application.use(
    urlencoded({ extended: false, limit: config.requestBodyLimitBytes, parameterLimit: 100 }),
  );
  application.use(bodyParserErrors.use.bind(bodyParserErrors));
  application.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      exceptionFactory: validationException,
    }),
  );
  application.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, origin === undefined || config.corsAllowlist.has(origin));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Join-Capability',
      'X-Request-ID',
    ],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 600,
  });
  application.setGlobalPrefix('api/v1');
  application.enableShutdownHooks();

  const expressApplication = application.getHttpAdapter().getInstance() as Express;
  expressApplication.set('trust proxy', config.trustProxy ? 1 : false);
  if (localDocumentationEnabled) {
    SwaggerModule.setup('api/docs', application, openApiDocument as never, {
      jsonDocumentUrl: 'api/docs-json',
    });
  }

  const server = (await application.listen(config.port, '0.0.0.0')) as Server;
  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = config.requestTimeoutMs + 5_000;
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown bootstrap failure';
  process.stderr.write(`Backend bootstrap failed: ${message}\n`);
  process.exitCode = 1;
});
