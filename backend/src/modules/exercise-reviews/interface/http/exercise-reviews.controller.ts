import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req } from '@nestjs/common';

import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../../../common/http/request-context.js';
import type { PagedResult } from '../../../../common/http/envelope.interceptor.js';
import { OperationPolicy } from '../../../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../../../common/policy/principal.decorator.js';
import type { ExerciseReviewProjection } from '../../application/exercise-review-projection.js';
import {
  ExerciseReviewsService,
  type BatchReviewResult,
} from '../../application/exercise-reviews.service.js';
import {
  BatchReviewRequestDto,
  CreateReviewRequestDto,
  ExerciseReviewListQueryDto,
  ExerciseReviewPathDto,
  ReopenReviewRequestDto,
} from './exercise-reviews.dto.js';

@Controller()
export class ExerciseReviewsController {
  constructor(private readonly reviews: ExerciseReviewsService) {}

  @Get('exercise-records/:recordId/reviews')
  @OperationPolicy('listExerciseRecordReviews')
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ExerciseReviewPathDto,
    @Query() query: ExerciseReviewListQueryDto,
  ): Promise<PagedResult<ExerciseReviewProjection>> {
    return this.reviews.list(principal, path.recordId, query);
  }

  @Post('exercise-records/:recordId/reviews')
  @HttpCode(201)
  @OperationPolicy('reviewExerciseRecord')
  decide(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ExerciseReviewPathDto,
    @Body() body: CreateReviewRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ExerciseReviewProjection> {
    return this.reviews.decide(principal, path.recordId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post('exercise-records/:recordId/reviews/reopen')
  @HttpCode(201)
  @OperationPolicy('reopenExerciseRecordReview')
  reopen(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ExerciseReviewPathDto,
    @Body() body: ReopenReviewRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ExerciseReviewProjection> {
    return this.reviews.reopen(principal, path.recordId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post('exercise-reviews/batch')
  @HttpCode(200)
  @OperationPolicy('batchReviewExerciseRecords')
  batch(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: BatchReviewRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<BatchReviewResult> {
    return this.reviews.batch(principal, body, { requestId: request.requestId, idempotencyKey });
  }
}
