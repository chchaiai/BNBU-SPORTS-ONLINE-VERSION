import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../../../common/http/request-context.js';
import { OperationPolicy } from '../../../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../../../common/policy/principal.decorator.js';
import { CourseInviteTokenPathDto } from '../../../course-invites/interface/http/course-invites.dto.js';
import type {
  EnrollmentProjection,
  JoinResultProjection,
} from '../../application/enrollment-projection.js';
import { EnrollmentsService } from '../../application/enrollments.service.js';
import { QrJoinService } from '../../application/qr-join.service.js';
import {
  EnrollmentClassSectionPathDto,
  EnrollmentListQueryDto,
  EnrollmentPathDto,
  EnrollmentTransitionRequestDto,
  ManualEnrollmentRequestDto,
} from './enrollments.dto.js';
import type { PagedResult } from '../../../../common/http/envelope.interceptor.js';

function sensitiveResponse(response: Response): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Referrer-Policy', 'no-referrer');
}

@Controller()
export class EnrollmentsController {
  constructor(
    private readonly enrollments: EnrollmentsService,
    private readonly qrJoin: QrJoinService,
  ) {}

  @Get('enrollments')
  @OperationPolicy('listEnrollments')
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: EnrollmentListQueryDto,
    @Req() request: FoundationRequest,
  ): Promise<PagedResult<EnrollmentProjection>> {
    if (request.enrollmentCollectionScope === undefined) {
      throw new Error('ENROLLMENT_COLLECTION_SCOPE_REQUIRED');
    }
    return this.enrollments.list(principal, request.enrollmentCollectionScope, query);
  }

  @Get('enrollments/:enrollmentId')
  @OperationPolicy('getEnrollment')
  get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() _path: EnrollmentPathDto,
    @Req() request: FoundationRequest,
  ): Promise<EnrollmentProjection> {
    if (request.enrollmentContext === undefined) {
      throw new Error('ENROLLMENT_CONTEXT_REQUIRED');
    }
    return this.enrollments.get(principal, request.enrollmentContext);
  }

  @Post('class-sections/:classSectionId/enrollments')
  @HttpCode(201)
  @OperationPolicy('manuallyEnrollStudent')
  manual(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: EnrollmentClassSectionPathDto,
    @Body() body: ManualEnrollmentRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<EnrollmentProjection> {
    return this.enrollments.manuallyEnroll(principal, path.classSectionId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post('enrollments/:enrollmentId/remove')
  @HttpCode(200)
  @OperationPolicy('removeEnrollment')
  remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() _path: EnrollmentPathDto,
    @Body() body: EnrollmentTransitionRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<EnrollmentProjection> {
    if (request.enrollmentContext === undefined) {
      throw new Error('ENROLLMENT_CONTEXT_REQUIRED');
    }
    return this.enrollments.remove(principal, request.enrollmentContext, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post('enrollments/:enrollmentId/restore')
  @HttpCode(200)
  @OperationPolicy('restoreEnrollment')
  restore(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() _path: EnrollmentPathDto,
    @Body() body: EnrollmentTransitionRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<EnrollmentProjection> {
    if (request.enrollmentContext === undefined) {
      throw new Error('ENROLLMENT_CONTEXT_REQUIRED');
    }
    return this.enrollments.restore(principal, request.enrollmentContext, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post('enrollments/:enrollmentId/withdraw')
  @HttpCode(200)
  @OperationPolicy('withdrawEnrollment')
  withdraw(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() _path: EnrollmentPathDto,
    @Body() _body: EnrollmentTransitionRequestDto,
    @Headers('idempotency-key') _idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): never {
    if (request.enrollmentContext === undefined) {
      throw new Error('ENROLLMENT_CONTEXT_REQUIRED');
    }
    return this.enrollments.withdraw(principal, request.enrollmentContext);
  }

  @Post('course-invites/:inviteToken/join')
  @HttpCode(201)
  @OperationPolicy('joinClassSectionWithInvite')
  join(
    @Param() _path: CourseInviteTokenPathDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-join-capability') _joinCapability: string | undefined,
    @Req() request: FoundationRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<JoinResultProjection> {
    sensitiveResponse(response);
    if (request.capabilityContext === undefined) {
      throw new Error('JOIN_CAPABILITY_CONTEXT_REQUIRED');
    }
    return this.qrJoin.join(request.capabilityContext, {
      requestId: request.requestId,
      idempotencyKey,
      ...(request.ip === undefined ? {} : { sourceIp: request.ip }),
    });
  }
}
