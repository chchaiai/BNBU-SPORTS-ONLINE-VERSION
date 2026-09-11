import {
  HttpException,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';

import { ApplicationError } from '../errors/application-error.js';
import type { FoundationRequest } from '../http/request-context.js';
import { operationPolicies } from '../../generated/operation-policies.generated.js';
import { JsonLoggerService } from './json-logger.service.js';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: JsonLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = performance.now();
    const http = context.switchToHttp();
    const request = http.getRequest<FoundationRequest>();
    const response = http.getResponse<Response>();
    let errorCode: string | undefined;
    let errorStatus: number | undefined;

    return next.handle().pipe(
      tap({
        error: (error: unknown) => {
          if (error instanceof ApplicationError) {
            errorCode = error.code;
            errorStatus = error.status;
            return;
          }
          if (error instanceof HttpException) {
            const status = error.getStatus();
            if (status === 404) {
              errorCode = 'PERMISSION_RESOURCE_NOT_FOUND';
              errorStatus = 404;
            } else if (status === 401) {
              errorCode = 'AUTH_REQUIRED';
              errorStatus = 401;
            } else if (status === 403) {
              errorCode = 'PERMISSION_RESOURCE_SCOPE_DENIED';
              errorStatus = 403;
            } else if (status >= 400 && status < 500) {
              errorCode = 'VALIDATION_FAILED';
              errorStatus = 422;
            } else {
              errorCode = 'SYSTEM_INTERNAL_ERROR';
              errorStatus = 500;
            }
            return;
          }
          errorCode = 'SYSTEM_INTERNAL_ERROR';
          errorStatus = 500;
        },
      }),
      finalize(() => {
        this.logger.http({
          requestId: request.requestId,
          ...(request.operationId === undefined ? {} : { operationId: request.operationId }),
          ...(request.permissionId === undefined ? {} : { permissionId: request.permissionId }),
          ...(request.principal === undefined
            ? {}
            : {
                actorUserId: request.principal.userId,
                organizationId: request.principal.organizationId,
              }),
          method: request.method,
          path:
            request.operationId === undefined ||
            !Object.hasOwn(operationPolicies, request.operationId)
              ? '/api/v1/unknown'
              : `/api/v1/${operationPolicies[
                  request.operationId as keyof typeof operationPolicies
                ].route.replace(/^\//, '')}`,
          // Exception filters run after interceptor finalization. Prefer the
          // mapped error status so failure logs match the response on the wire.
          statusCode: errorStatus ?? response.statusCode,
          durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
          ...(errorCode === undefined ? {} : { errorCode }),
          outcome: errorCode === undefined ? 'SUCCEEDED' : 'FAILED',
        });
      }),
    );
  }
}
