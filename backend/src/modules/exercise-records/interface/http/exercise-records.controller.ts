import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import { ApplicationError } from '../../../../common/errors/application-error.js';
import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../../../common/http/request-context.js';
import type { PagedResult } from '../../../../common/http/envelope.interceptor.js';
import { OperationPolicy } from '../../../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../../../common/policy/principal.decorator.js';
import type {
  ExerciseRecordEvidenceContextProjection,
  ExerciseRecordProjection,
} from '../../application/exercise-record-projection.js';
import { ExerciseRecordsService } from '../../application/exercise-records.service.js';
import {
  CreateExerciseRecordRequestDto,
  ExerciseRecordListQueryDto,
  ExerciseRecordPathDto,
  SubmitExerciseRecordRequestDto,
  UpdateExerciseRecordRequestDto,
  VersionedRecordReasonRequestDto,
} from './exercise-records.dto.js';

@Controller('exercise-records')
export class ExerciseRecordsController {
  constructor(private readonly records: ExerciseRecordsService) {}

  @Get()
  @OperationPolicy('listExerciseRecords')
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ExerciseRecordListQueryDto,
    @Req() request: FoundationRequest,
  ): Promise<PagedResult<ExerciseRecordProjection>> {
    if (request.exerciseRecordCollectionScope === undefined) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
    }
    return this.records.list(principal, request.exerciseRecordCollectionScope, query);
  }

  @Post()
  @HttpCode(201)
  @OperationPolicy('createExerciseRecordDraft')
  create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: CreateExerciseRecordRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ExerciseRecordProjection> {
    return this.records.create(principal, body, { requestId: request.requestId, idempotencyKey });
  }

  @Get(':recordId')
  @OperationPolicy('getExerciseRecord')
  get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() _path: ExerciseRecordPathDto,
    @Req() request: FoundationRequest,
  ): Promise<ExerciseRecordProjection> {
    if (request.exerciseRecordContext === undefined) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
    }
    return this.records.get(principal, request.exerciseRecordContext);
  }

  @Get(':recordId/evidence-context')
  @OperationPolicy('getExerciseRecordEvidenceContext')
  getEvidenceContext(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() _path: ExerciseRecordPathDto,
    @Req() request: FoundationRequest,
  ): Promise<ExerciseRecordEvidenceContextProjection> {
    if (request.exerciseRecordContext === undefined) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
    }
    return this.records.getEvidenceContext(principal, request.exerciseRecordContext);
  }

  @Patch(':recordId')
  @OperationPolicy('updateExerciseRecordDraft')
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() _path: ExerciseRecordPathDto,
    @Body() body: UpdateExerciseRecordRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ExerciseRecordProjection> {
    if (request.exerciseRecordContext === undefined) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
    }
    return this.records.update(principal, request.exerciseRecordContext, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post(':recordId/submit')
  @HttpCode(200)
  @OperationPolicy('submitExerciseRecord')
  submit(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() _path: ExerciseRecordPathDto,
    @Body() body: SubmitExerciseRecordRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ExerciseRecordProjection> {
    if (request.exerciseRecordContext === undefined) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
    }
    return this.records.submit(principal, request.exerciseRecordContext, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post(':recordId/discard')
  @HttpCode(200)
  @OperationPolicy('discardExerciseRecord')
  discard(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() _path: ExerciseRecordPathDto,
    @Body() body: VersionedRecordReasonRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ExerciseRecordProjection> {
    if (request.exerciseRecordContext === undefined) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
    }
    return this.records.discard(principal, request.exerciseRecordContext, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post(':recordId/withdraw')
  @HttpCode(200)
  @OperationPolicy('withdrawExerciseRecord')
  withdraw(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() _path: ExerciseRecordPathDto,
    @Body() body: VersionedRecordReasonRequestDto,
    @Req() request: FoundationRequest,
  ): Promise<never> {
    if (request.exerciseRecordContext === undefined) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
    }
    return this.records.withdraw(principal, request.exerciseRecordContext, body);
  }
}
