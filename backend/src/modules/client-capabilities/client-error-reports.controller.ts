import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { AllowSystemModes } from '../../common/policy/system-mode-policy.decorator.js';
import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../common/http/request-context.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { ERROR_HTTP_STATUS } from '../../common/errors/error-http-status.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { RateLimitPort } from '../../common/rate-limit/rate-limit.port.js';
import { operationPolicies } from '../../generated/operation-policies.generated.js';

export class ClientErrorReportInput {
  @IsIn(['WEB_STUDENT', 'WEB_TEACHER', 'WEB_ADMIN', 'IOS', 'ANDROID']) platform!: string;
  @IsIn(['ERROR']) level!: string;
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{0,99}$/) errorCode!: string;
  @IsIn([
    'NETWORK',
    'TIMEOUT',
    'AUTHENTICATION',
    'AUTHORIZATION',
    'CONFLICT',
    'VALIDATION',
    'RATE_LIMIT',
    'SERVER',
    'UNKNOWN',
  ])
  category!: string;
  @IsBoolean() retryable!: boolean;
  @IsDateString() clientOccurredAt!: string;
  @ValidateIf((_o, v: unknown) => v !== undefined) @IsInt() @Min(100) @Max(599) httpStatus?: number;
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  method?: string;
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(300)
  @Matches(/^\/[A-Za-z0-9._~!$&()*+,;=:@%/-]*$/)
  route?: string;
  @ValidateIf((_o, v: unknown) => v !== undefined)
  @IsString()
  @Matches(/^[A-Za-z0-9_.:-]{1,128}$/)
  relatedRequestId?: string;
}

@Controller('audit-logs/client-errors')
export class ClientErrorReportsController {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly rateLimits: RateLimitPort,
  ) {}

  @Post()
  @HttpCode(200)
  @OperationPolicy('reportClientError')
  @AllowSystemModes('NORMAL', 'MAINTENANCE')
  async report(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: ClientErrorReportInput,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<{auditLogId: string; receivedAt: string}> {
    const nativeStudent = principal.role === 'STUDENT' && ['IOS', 'ANDROID'].includes(body.platform);
    if (body.platform !== `WEB_${principal.role}` && !nativeStudent)
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const rate = await this.rateLimits.consume({
      purpose: 'CLIENT_DIAGNOSTICS',
      keys: [`${principal.organizationId}:${principal.userId}`],
      windowSeconds: 60,
      maximumAttempts: 30,
    });
    if (!rate.allowed)
      throw new ApplicationError('AUTH_RATE_LIMITED', 429, {
        retryAfterSeconds: rate.retryAfterSeconds,
      });
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'reportClientError',
        scope: `${principal.organizationId}:${principal.userId}`,
        key,
        request: body,
        requestId: request.requestId,
      },
      async (transaction) => {
        const id = this.ids.next(),
          now = this.clock.now();
        // Keep client claims labelled. Persist only known route templates and UUID
        // references, never user-supplied paths, query strings or arbitrary text.
        const operation = Object.entries(operationPolicies).find(([, policy]) =>
          policy.method === body.method && policy.route.replace(/\{[^}]+\}/g,':id') === body.route?.replace(/^\/api\/v1(?=\/)/,''));
        const relatedRequestId = typeof body.relatedRequestId === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.relatedRequestId)
          ? body.relatedRequestId.toLowerCase() : null;
        const errorCode =
          Object.hasOwn(ERROR_HTTP_STATUS, body.errorCode) ||
          ['NETWORK_UNAVAILABLE', 'NETWORK_TIMEOUT', 'MEDIA_UPLOAD_FAILED', 'MEDIA_ETAG_MISSING', 'UNKNOWN'].includes(body.errorCode)
            ? body.errorCode
            : 'UNKNOWN';
        const metadata = {
          reportedByClient: true,
          platform: body.platform,
          category: body.category,
          errorCode,
          retryable: body.retryable,
          ...(relatedRequestId ? { relatedRequestId } : {}),
          ...(operation ? { operationId: operation[0], route: operation[1].route } : {}),
          ...(body.httpStatus === undefined ? {} : { httpStatus: body.httpStatus }),
          ...(body.method === undefined ? {} : { method: body.method }),
        };
        await transaction.auditLog.create({
          data: {
            id,
            organizationId: principal.organizationId,
            actorUserId: principal.userId,
            actorRoleSnapshot: principal.role,
            permissionId: 'CLIENT-ERROR-REPORT',
            actionType: 'CLIENT_ERROR_REPORTED',
            targetType: 'CLIENT_DIAGNOSTIC',
            targetId: null,
            requestId: request.requestId,
            outcome: 'SUCCEEDED',
            safeMetadata: metadata,
            occurredAt: now,
          },
        });
        return this.idempotency.success({ auditLogId: id, receivedAt: now.toISOString() });
      },
    );
  }
}
