import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req } from '@nestjs/common';

import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../../../common/http/request-context.js';
import { OperationPolicy } from '../../../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../../../common/policy/principal.decorator.js';
import type { ExerciseSessionProjection } from '../../application/exercise-session-projection.js';
import { ExerciseSessionsService } from '../../application/exercise-sessions.service.js';
import {
  ActiveExerciseSessionQueryDto,
  CancelExerciseSessionRequestDto,
  ExerciseSessionControlRequestDto,
  ExerciseSessionPathDto,
  ReconcileExerciseSessionRequestDto,
  StartExerciseSessionRequestDto,
} from './exercise-sessions.dto.js';

@Controller('exercise-sessions')
export class ExerciseSessionsController {
  constructor(private readonly sessions: ExerciseSessionsService) {}

  @Post()
  @HttpCode(201)
  @OperationPolicy('startExerciseSession')
  start(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: StartExerciseSessionRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ExerciseSessionProjection> {
    return this.sessions.start(principal, body, { requestId: request.requestId, idempotencyKey });
  }

  @Get('active')
  @OperationPolicy('getActiveExerciseSession')
  active(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ActiveExerciseSessionQueryDto,
    @Req() request: FoundationRequest,
  ): Promise<ExerciseSessionProjection | null> {
    return this.sessions.getActive(principal, query.enrollmentId, request.requestId);
  }

  @Get(':sessionId')
  @OperationPolicy('getExerciseSession')
  get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ExerciseSessionPathDto,
    @Req() request: FoundationRequest,
  ): Promise<ExerciseSessionProjection> {
    return this.sessions.get(principal, path.sessionId, request.requestId);
  }

  @Post(':sessionId/pause')
  @HttpCode(200)
  @OperationPolicy('pauseExerciseSession')
  pause(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ExerciseSessionPathDto,
    @Body() body: ExerciseSessionControlRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ExerciseSessionProjection> {
    return this.sessions.pause(principal, path.sessionId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post(':sessionId/resume')
  @HttpCode(200)
  @OperationPolicy('resumeExerciseSession')
  resume(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ExerciseSessionPathDto,
    @Body() body: ExerciseSessionControlRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ExerciseSessionProjection> {
    return this.sessions.resume(principal, path.sessionId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post(':sessionId/finish')
  @HttpCode(200)
  @OperationPolicy('finishExerciseSession')
  finish(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ExerciseSessionPathDto,
    @Body() body: ExerciseSessionControlRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ExerciseSessionProjection> {
    return this.sessions.finish(principal, path.sessionId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post(':sessionId/cancel')
  @HttpCode(200)
  @OperationPolicy('cancelExerciseSession')
  cancel(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ExerciseSessionPathDto,
    @Body() body: CancelExerciseSessionRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ExerciseSessionProjection> {
    return this.sessions.cancel(principal, path.sessionId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post(':sessionId/reconcile')
  @HttpCode(200)
  @OperationPolicy('reconcileExerciseSession')
  reconcile(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ExerciseSessionPathDto,
    @Body() body: ReconcileExerciseSessionRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ExerciseSessionProjection> {
    return this.sessions.reconcile(principal, path.sessionId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }
}
