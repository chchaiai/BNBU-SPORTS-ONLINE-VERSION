import { Injectable } from '@nestjs/common';
import { V81Service } from '../../v8/v81.service.js';

import { AuditService } from '../../../common/audit/audit.service.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import {
  ApplicationError,
  publicErrorDetails,
  type PublicErrorDetails,
} from '../../../common/errors/application-error.js';
import { pagedResult, type PagedResult } from '../../../common/http/envelope.interceptor.js';
import type { AuthenticatedPrincipal } from '../../../common/http/request-context.js';
import {
  IdempotencyService,
  type IdempotencyStageOwner,
} from '../../../common/idempotency/idempotency.service.js';
import { OutboxService } from '../../../common/outbox/outbox.service.js';
import { ScopedCursorService } from '../../../common/pagination/scoped-cursor.service.js';
import { SecureDigestService } from '../../../common/security/secure-digest.service.js';
import { Clock } from '../../../common/time/clock.js';
import { IdGenerator } from '../../../common/time/id-generator.js';
import {
  Prisma,
  type ExerciseRecord,
  type ReviewRecord,
} from '../../../generated/prisma/client.js';
import { ScoresService } from '../../scores/application/scores.service.js';
import type {
  BatchReviewItemDto,
  BatchReviewRequestDto,
  CreateReviewRequestDto,
  ExerciseReviewListQueryDto,
  ReopenReviewRequestDto,
} from '../interface/http/exercise-reviews.dto.js';
import { normalizeReviewDecision } from '../domain/exercise-review.js';
import {
  projectExerciseReview,
  type ExerciseReviewProjection,
} from './exercise-review-projection.js';

type Transaction = Prisma.TransactionClient;

interface MutationFacts {
  requestId: string;
  idempotencyKey: string | undefined;
}

interface BatchStage {
  batchId: string;
}

export interface BatchReviewItemResult {
  itemKey: string;
  status: 'SUCCEEDED' | 'FAILED';
  data: ExerciseReviewProjection | null;
  error: {
    code: string;
    message: string;
    details: PublicErrorDetails;
    requestId: string;
    timestamp: string;
  } | null;
}

export interface BatchReviewResult {
  items: BatchReviewItemResult[];
}

@Injectable()
export class ExerciseReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly cursors: ScopedCursorService,
    private readonly digest: SecureDigestService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly scores: ScoresService,
    private readonly v81: V81Service,
  ) {}

  async list(
    principal: AuthenticatedPrincipal,
    recordId: string,
    input: ExerciseReviewListQueryDto,
  ): Promise<PagedResult<ExerciseReviewProjection>> {
    await this.assertTeacherScope(this.prisma, principal, recordId);
    const direction = input.sort === 'reviewVersion' ? 'asc' : 'desc';
    const binding = {
      resource: 'REVIEW_RECORD' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters: { recordId },
      sort: input.sort,
      limit: input.limit,
    };
    const position = this.cursors.decode(input.cursor, binding);
    const version = position === null ? null : Number(position.value);
    if (version !== null && (!Number.isSafeInteger(version) || version < 1)) {
      throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
    }
    const rows = await this.prisma.reviewRecord.findMany({
      where: {
        organizationId: principal.organizationId,
        recordId,
        ...(position === null
          ? {}
          : direction === 'asc'
            ? {
                OR: [
                  { reviewVersion: { gt: version! } },
                  { reviewVersion: version!, id: { gt: position.id } },
                ],
              }
            : {
                OR: [
                  { reviewVersion: { lt: version! } },
                  { reviewVersion: version!, id: { lt: position.id } },
                ],
              }),
      },
      orderBy: [{ reviewVersion: direction }, { id: direction }],
      take: input.limit + 1,
    });
    const hasMore = rows.length > input.limit;
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return pagedResult(page.map(projectExerciseReview), {
      hasMore,
      limit: input.limit,
      nextCursor:
        hasMore && last !== undefined
          ? this.cursors.encode(binding, { value: String(last.reviewVersion), id: last.id })
          : null,
    });
  }

  async decide(
    principal: AuthenticatedPrincipal,
    recordId: string,
    input: CreateReviewRequestDto,
    facts: MutationFacts,
  ): Promise<ExerciseReviewProjection> {
    const result = await this.decideItem(principal, recordId, input, facts, 'reviewExerciseRecord');
    await this.scores.processReviewChange(recordId);
    return result;
  }

  async reopen(
    principal: AuthenticatedPrincipal,
    recordId: string,
    input: ReopenReviewRequestDto,
    facts: MutationFacts,
  ): Promise<ExerciseReviewProjection> {
    const workflow=await this.prisma.$queryRaw<{record_id:string}[]>`SELECT record_id FROM v81_record_workflows WHERE record_id=${recordId}::uuid AND organization_id=${principal.organizationId}::uuid`;
    if(workflow.length) throw new ApplicationError('REVIEW_CHANGE_NOT_ALLOWED',409,{reason:'V81_FACT_CORRECTION_REQUIRED'});
    const reason = input.reason.trim();
    const result = await this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'reopenExerciseRecordReview',
        scope: `${principal.organizationId}:${recordId}`,
        key: facts.idempotencyKey,
        request: {
          recordId,
          reason,
          expectedReviewVersion: input.expectedReviewVersion,
          expectedVersion: input.expectedVersion,
        },
        requestId: facts.requestId,
      },
      async (transaction) => {
        try {
          await this.lockRecord(transaction, recordId);
          const record = await this.assertTeacherScope(transaction, principal, recordId);
          const current = await this.currentReview(transaction, recordId);
          if (
            record.version !== input.expectedVersion ||
            current?.reviewVersion !== input.expectedReviewVersion
          ) {
            return this.idempotency.failure(new ApplicationError('CONFLICT_VERSION_MISMATCH', 409));
          }
          if (
            record.status !== 'REVIEWED' ||
            current === null ||
            !['VALID', 'INVALID'].includes(current.result)
          ) {
            return this.idempotency.failure(new ApplicationError('REVIEW_CHANGE_NOT_ALLOWED', 409));
          }
          const now = this.clock.now();
          const review = await transaction.reviewRecord.create({
            data: {
              id: this.ids.next(),
              organizationId: record.organizationId,
              recordId,
              reviewVersion: current.reviewVersion + 1,
              previousReviewId: current.id,
              result: 'PENDING',
              reason,
              createdAt: now,
            },
          });
          const updated = await transaction.exerciseRecord.update({
            where: { id: recordId, version: input.expectedVersion, status: 'REVIEWED' },
            data: { status: 'SUBMITTED', updatedAt: now, version: { increment: 1 } },
          });
          await this.appendEvidence(
            transaction,
            updated,
            review,
            current,
            principal,
            facts,
            'REOPENED',
          );
          return this.idempotency.success(projectExerciseReview(review), {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'REVIEW_RECORD',
            resourceId: review.id,
          });
        } catch (error: unknown) {
          if (error instanceof ApplicationError) return this.idempotency.failure(error);
          throw error;
        }
      },
    );
    await this.scores.processReviewChange(recordId);
    return result;
  }

  async batch(
    principal: AuthenticatedPrincipal,
    input: BatchReviewRequestDto,
    facts: MutationFacts,
  ): Promise<BatchReviewResult> {
    const reservation = await this.idempotency.reserveStage<BatchStage, BatchReviewResult>(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'batchReviewExerciseRecords',
        scope: principal.organizationId,
        key: facts.idempotencyKey,
        request: input,
        requestId: facts.requestId,
      },
      (_transaction, context) => {
        if (
          context.isRecovery &&
          (context.resourceType !== 'REVIEW_BATCH' || context.resourceId === null)
        ) {
          return Promise.resolve(
            this.idempotency.failure(
              new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
                invariant: 'REVIEW_BATCH_STAGE_REFERENCE_REQUIRED',
              }),
            ),
          );
        }
        const batchId = context.resourceId ?? this.ids.next();
        return Promise.resolve(
          this.idempotency.stage(
            { batchId },
            {
              resourceType: 'REVIEW_BATCH',
              resourceId: batchId,
              principalId: principal.userId,
              authSessionId: principal.sessionId,
            },
          ),
        );
      },
    );
    if (reservation.kind === 'REPLAY') return reservation.value;

    const items: BatchReviewItemResult[] = [];
    for (const [index, item] of input.items.entries()) {
      try {
        const data = await this.decideItem(
          principal,
          item.recordId,
          item,
          { requestId: facts.requestId, idempotencyKey: `${reservation.value.batchId}:${index}` },
          'reviewExerciseRecord',
        );
        await this.scores.processReviewChange(item.recordId);
        items.push({ itemKey: item.itemKey, status: 'SUCCEEDED', data, error: null });
      } catch (error: unknown) {
        if (!(error instanceof ApplicationError)) throw error;
        items.push({
          itemKey: item.itemKey,
          status: 'FAILED',
          data: null,
          error: {
            code: error.code,
            message: error.message,
            details: publicErrorDetails(error.details),
            requestId: facts.requestId,
            timestamp: this.clock.now().toISOString(),
          },
        });
      }
    }
    return this.completeBatch(reservation, { items }, principal);
  }

  private async completeBatch(
    owner: IdempotencyStageOwner<BatchStage>,
    result: BatchReviewResult,
    principal: AuthenticatedPrincipal,
  ): Promise<BatchReviewResult> {
    return this.idempotency.completeStage(owner, () =>
      Promise.resolve(
        this.idempotency.success(result, {
          principalId: principal.userId,
          authSessionId: principal.sessionId,
          resourceType: 'REVIEW_BATCH',
          resourceId: owner.value.batchId,
        }),
      ),
    );
  }

  private async decideItem(
    principal: AuthenticatedPrincipal,
    recordId: string,
    input: CreateReviewRequestDto | BatchReviewItemDto,
    facts: MutationFacts,
    operationId: string,
  ): Promise<ExerciseReviewProjection> {
    const workflow=await this.prisma.$queryRaw<{record_id:string}[]>`SELECT record_id FROM v81_record_workflows WHERE record_id=${recordId}::uuid AND organization_id=${principal.organizationId}::uuid`;
    if(workflow.length){
      if(input.internalNote || input.reason || input.creditedDurationOverrideSeconds!==undefined && input.creditedDurationOverrideSeconds!==null) {
        throw new ApplicationError('VALIDATION_FAILED',422);
      }
      const response=await this.v81.review(principal,recordId,{
        action:input.result,expectedVersion:input.expectedVersion,
        ...(input.reasonCode?{reasonCode:input.reasonCode}:{}),...(input.publicComment?{publicComment:input.publicComment}:{}),
      },facts,{expectedReviewVersion:input.expectedReviewVersion});
      if(!response.review)throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR',500);
      return response.review;
    }
    const normalized = normalizeReviewDecision(input);
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId,
        scope: `${principal.organizationId}:${recordId}`,
        key: facts.idempotencyKey,
        request: {
          recordId,
          ...normalized,
          expectedReviewVersion: input.expectedReviewVersion,
          expectedVersion: input.expectedVersion,
        },
        requestId: facts.requestId,
      },
      async (transaction) => {
        try {
          if (
            input.creditedDurationOverrideSeconds !== undefined &&
            input.creditedDurationOverrideSeconds !== null
          ) {
            return this.idempotency.failure(
              new ApplicationError('REVIEW_CREDIT_OVERRIDE_NOT_APPROVED', 409),
            );
          }
          await this.lockRecord(transaction, recordId);
          const record = await this.assertTeacherScope(transaction, principal, recordId);
          const current = await this.currentReview(transaction, recordId);
          if (
            record.version !== input.expectedVersion ||
            current?.reviewVersion !== input.expectedReviewVersion
          ) {
            return this.idempotency.failure(new ApplicationError('CONFLICT_VERSION_MISMATCH', 409));
          }
          const isPendingDecision = record.status === 'SUBMITTED' && current?.result === 'PENDING';
          const isValidInvalidation =
            record.status === 'REVIEWED' &&
            current?.result === 'VALID' &&
            normalized.result === 'INVALID';
          if (!isPendingDecision && !isValidInvalidation) {
            return this.idempotency.failure(new ApplicationError('REVIEW_ALREADY_COMPLETED', 409));
          }
          const teacher = await transaction.teacherProfile.findFirst({
            where: {
              organizationId: principal.organizationId,
              userId: principal.userId,
              status: 'ACTIVE',
              deletedAt: null,
            },
            select: { id: true },
          });
          if (teacher?.id !== record.teacherId) {
            return this.idempotency.failure(new ApplicationError('EXERCISE_RECORD_NOT_FOUND', 404));
          }
          const now = this.clock.now();
          const review = await transaction.reviewRecord.create({
            data: {
              id: this.ids.next(),
              organizationId: record.organizationId,
              recordId,
              reviewVersion: current.reviewVersion + 1,
              previousReviewId: current.id,
              teacherId: teacher.id,
              result: normalized.result,
              reasonCode: normalized.reasonCode,
              reason: normalized.reason,
              publicComment: normalized.publicComment,
              internalNote: normalized.internalNote,
              reviewedAt: now,
              createdAt: now,
            },
          });
          const updated = await transaction.exerciseRecord.update({
            where: { id: recordId, version: input.expectedVersion, status: record.status },
            data: { status: 'REVIEWED', updatedAt: now, version: { increment: 1 } },
          });
          await this.appendEvidence(
            transaction,
            updated,
            review,
            current,
            principal,
            facts,
            'REVIEWED',
            record.status,
          );
          return this.idempotency.success(projectExerciseReview(review), {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'REVIEW_RECORD',
            resourceId: review.id,
          });
        } catch (error: unknown) {
          if (error instanceof ApplicationError) return this.idempotency.failure(error);
          throw error;
        }
      },
    );
  }

  private async assertTeacherScope(
    transaction: PrismaService | Transaction,
    principal: AuthenticatedPrincipal,
    recordId: string,
  ): Promise<ExerciseRecord> {
    if (principal.role !== 'TEACHER') {
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    }
    const record = await transaction.exerciseRecord.findFirst({
      where: { id: recordId, organizationId: principal.organizationId },
      include: { classSection: { include: { teacher: { select: { userId: true } } } } },
    });
    if (record?.classSection.teacher.userId !== principal.userId) {
      throw new ApplicationError('EXERCISE_RECORD_NOT_FOUND', 404);
    }
    return record;
  }

  private currentReview(transaction: Transaction, recordId: string): Promise<ReviewRecord | null> {
    return transaction.reviewRecord.findFirst({
      where: { recordId },
      orderBy: { reviewVersion: 'desc' },
    });
  }

  private async lockRecord(transaction: Transaction, recordId: string): Promise<void> {
    await transaction.$queryRaw(
      Prisma.sql`SELECT id FROM exercise_records WHERE id = ${recordId}::uuid FOR UPDATE`,
    );
  }

  private async appendEvidence(
    transaction: Transaction,
    record: ExerciseRecord,
    review: ReviewRecord,
    previous: ReviewRecord,
    principal: AuthenticatedPrincipal,
    facts: MutationFacts,
    eventType: 'REVIEWED' | 'REOPENED',
    previousRecordStatus?: ExerciseRecord['status'],
  ): Promise<void> {
    const now = this.clock.now();
    await transaction.exerciseRecordEvent.create({
      data: {
        id: this.ids.next(),
        organizationId: record.organizationId,
        recordId: record.id,
        eventVersion: record.version,
        eventType,
        fromStatus: previousRecordStatus ?? (eventType === 'REVIEWED' ? 'SUBMITTED' : 'REVIEWED'),
        toStatus: record.status,
        actorUserId: principal.userId,
        authSessionId: principal.sessionId,
        requestId: facts.requestId,
        idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
        safeMetadata: {
          reviewId: review.id,
          reviewVersion: review.reviewVersion,
          result: review.result,
        },
        occurredAt: now,
      },
    });
    await this.audit.append(transaction, {
      organizationId: record.organizationId,
      actorUserId: principal.userId,
      actorRoleSnapshot: principal.role,
      permissionId: eventType === 'REVIEWED' ? 'EXERCISE-REVIEW-CREATE' : 'EXERCISE-REVIEW-REOPEN',
      actionType: 'REVIEW_RESULT_CHANGED',
      targetType: 'REVIEW_RECORD',
      targetId: review.id,
      requestId: facts.requestId,
      idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
      outcome: 'SUCCEEDED',
      safeMetadata: {
        recordId: record.id,
        reviewId: review.id,
        reviewVersion: review.reviewVersion,
        recordVersion: record.version,
        previousResult: previous.result,
        nextResult: review.result,
        reasonCode: review.reasonCode,
      },
    });
    await this.outbox.append(transaction, {
      organizationId: record.organizationId,
      aggregateType: 'EXERCISE_RECORD',
      aggregateId: record.id,
      eventType:
        eventType === 'REVIEWED' ? 'EXERCISE_REVIEW_DECIDED_V1' : 'EXERCISE_REVIEW_REOPENED_V1',
      eventVersion: record.version,
      payload: {
        recordId: record.id,
        reviewId: review.id,
        reviewVersion: review.reviewVersion,
        previousResult: previous.result,
        currentResult: review.result,
        recordVersion: record.version,
        eventVersion: record.version,
      },
    });
  }

  private keyReference(key: string | undefined): string | null {
    return key === undefined ? null : this.digest.digest('idempotency-key-reference', key);
  }
}
