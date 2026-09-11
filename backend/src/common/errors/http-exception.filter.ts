import {
  ArgumentsHost,
  Catch,
  HttpException,
  Injectable,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

import { Clock } from '../time/clock.js';
import type { FoundationRequest } from '../http/request-context.js';
import { ApplicationError, publicErrorDetails } from './application-error.js';
import { operationPolicies } from '../../generated/operation-policies.generated.js';

@Catch()
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  constructor(private readonly clock: Clock) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FoundationRequest>();
    const response = http.getResponse<Response>();
    const error = this.map(exception);
    const operation = request.operationId && Object.hasOwn(operationPolicies, request.operationId)
      ? operationPolicies[request.operationId as keyof typeof operationPolicies] : null;
    this.logger.warn({
      event: 'HTTP_REQUEST_REJECTED',
      requestId: request.requestId,
      operationId: operation ? request.operationId : null,
      method: request.method,
      route: operation?.route ?? '/unknown',
      statusCode: error.status,
      errorCode: error.code,
      // Codes and field names only; request values and exception text stay private.
      invalidFields: error.details.fieldErrors?.flatMap(field => {
        const value = field as {field?:unknown} | null;
        return typeof value?.field === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(value.field) ? [value.field] : [];
      }),
      reason: typeof error.details.reason === 'string' && /^[A-Z][A-Z0-9_]{0,99}$/.test(error.details.reason) ? error.details.reason : null,
    });
    if (error.code === 'SYSTEM_INTERNAL_ERROR') {
      const candidate = exception as {
        name?: unknown;
        code?: unknown;
        message?: unknown;
        cause?: { originalCode?: unknown };
      } | null;
      this.logger.error({
        event: 'UNHANDLED_HTTP_ERROR',
        requestId: request.requestId,
        errorType:
          typeof candidate?.name === 'string' &&
          [
            'PrismaClientKnownRequestError',
            'PrismaClientUnknownRequestError',
            'DriverAdapterError',
            'Error',
            'TypeError',
          ].includes(candidate.name)
            ? candidate.name
            : 'UNEXPECTED_ERROR',
        databaseCode:
          typeof candidate?.code === 'string' && /^P\d{4}$/.test(candidate.code)
            ? candidate.code
            : null,
        sqlState:
          typeof candidate?.cause?.originalCode === 'string' &&
          /^[0-9A-Z]{5}$/.test(candidate.cause.originalCode)
            ? candidate.cause.originalCode
            : null,
        serializationFailure:
          typeof candidate?.message === 'string' &&
          /could not serialize|SQLSTATE.?40001|code: "40001"/.test(candidate.message),
        deadlock:
          typeof candidate?.message === 'string' && candidate.message.includes('deadlock detected'),
      });
    }

    response.status(error.status).json({
      code: error.code,
      message: error.message,
      details: publicErrorDetails(error.details),
      requestId: request.requestId,
      timestamp: this.clock.now().toISOString(),
    });
  }

  private map(exception: unknown): ApplicationError {
    if (exception instanceof ApplicationError) return exception;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 404) return new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      if (status === 401) return new ApplicationError('AUTH_REQUIRED', 401);
      if (status === 403) return new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
      if (status >= 400 && status < 500) return new ApplicationError('VALIDATION_FAILED', 422);
    }

    return new ApplicationError('SYSTEM_INTERNAL_ERROR', 500);
  }
}
