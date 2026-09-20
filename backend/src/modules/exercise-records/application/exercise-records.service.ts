import { assertProfileReady } from '../../users/application/student-profile-quality.js';
import {isHistoricalSession,requireHistoricalSubmissionWindow} from '../../v8/v81-history-backfill.js';
import { permitsExistingCourseSession } from '../../enrollments/application/course-closure-memberships.js';
import { Injectable } from '@nestjs/common';

import { AuditService, type FoundationAuditAction } from '../../../common/audit/audit.service.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import { pagedResult, type PagedResult } from '../../../common/http/envelope.interceptor.js';
import type { AuthenticatedPrincipal } from '../../../common/http/request-context.js';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { OutboxService } from '../../../common/outbox/outbox.service.js';
import { ScopedCursorService } from '../../../common/pagination/scoped-cursor.service.js';
import type {
  ExerciseRecordCollectionScope,
  ExerciseRecordPolicyContext,
} from '../../../common/policy/exercise-record-policy-resolver.js';
import { SecureDigestService } from '../../../common/security/secure-digest.service.js';
import { Clock } from '../../../common/time/clock.js';
import { IdGenerator } from '../../../common/time/id-generator.js';
import { Prisma, type ExerciseRecord } from '../../../generated/prisma/client.js';
import { ScoresService } from '../../scores/application/scores.service.js';
import { initializeRecordWorkflow, requiredCourseThreshold } from '../../v8/v81-record-state.js';
import { projectV81Records } from '../../v8/v81-record-projection.js';
import {
  assertCreditableDuration,
  creditedDuration,
  normalizeRecordContent,
} from '../domain/exercise-record.js';
import type {
  CreateExerciseRecordRequestDto,
  ExerciseRecordListQueryDto,
  SubmitExerciseRecordRequestDto,
  UpdateExerciseRecordRequestDto,
  VersionedRecordReasonRequestDto,
} from '../interface/http/exercise-records.dto.js';
import {
  projectExerciseRecord,
  projectExerciseRecordEvidenceContext,
  type ExerciseRecordEvidenceContextProjection,
  type ExerciseRecordProjection,
  type ExerciseRecordWithReview,
} from './exercise-record-projection.js';

type Transaction = Prisma.TransactionClient;

interface MutationFacts {
  requestId: string;
  idempotencyKey: string | undefined;
}

const reviewProjection = {
  orderBy: { reviewVersion: 'desc' as const },
  take: 1,
  select: { result: true, reasonCode: true, publicComment: true, reviewVersion: true },
};

const recordProjectionRelations = {
  reviews: reviewProjection,
};

@Injectable()
export class ExerciseRecordsService {
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
  ) {}

  async list(
    principal: AuthenticatedPrincipal,
    scope: ExerciseRecordCollectionScope,
    input: ExerciseRecordListQueryDto,
  ): Promise<PagedResult<ExerciseRecordProjection>> {
    if (
      scope.organizationId !== principal.organizationId ||
      scope.role !== principal.role ||
      (principal.role === 'STUDENT' && scope.studentId === undefined) ||
      (principal.role === 'TEACHER' && scope.teacherUserId !== principal.userId)
    ) {
      this.scopeDenied();
    }
    const direction = input.sort === 'businessDate' ? 'asc' : 'desc';
    if (input.aiReview && principal.role !== 'TEACHER') this.scopeDenied();
    const filters = {
      search: input.q === undefined || input.q.trim() === '' ? null : input.q.trim(),
      classSectionId: input.classSectionId ?? null,
      enrollmentId: input.enrollmentId ?? null,
      status: input.status ?? null,
      reviewResult: input.reviewResult ?? null,
      aiReview: input.aiReview ?? null,
      businessDateFrom: input.businessDateFrom ?? null,
      businessDateTo: input.businessDateTo ?? null,
    };
    const binding = {
      resource: 'EXERCISE_RECORD' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters,
      sort: direction === 'asc' ? 'businessDate' : '-businessDate',
      limit: input.limit,
    };
    const position = this.cursors.decode(input.cursor, binding);
    const businessDatePosition =
      position === null ? null : new Date(`${position.value}T00:00:00.000Z`);
    return this.prisma.$transaction(async tx => {
    const currentReviewIds = input.reviewResult === undefined ? null : await tx.$queryRaw<{record_id: string}[]>`
      SELECT r.record_id FROM review_records r JOIN exercise_records scoped ON scoped.id=r.record_id
      WHERE r.organization_id=${principal.organizationId}::uuid AND r.result=${input.reviewResult}
        ${scope.studentId === undefined ? Prisma.empty : Prisma.sql`AND scoped.student_id=${scope.studentId}::uuid`}
        ${input.classSectionId === undefined ? Prisma.empty : Prisma.sql`AND scoped.class_section_id=${input.classSectionId}::uuid`}
        AND NOT EXISTS (SELECT 1 FROM review_records newer WHERE newer.record_id=r.record_id AND newer.review_version>r.review_version)`;
    const records = await tx.exerciseRecord.findMany({
      where: {
        organizationId: principal.organizationId,
        ...(scope.studentId === undefined ? {} : { studentId: scope.studentId }),
        ...(scope.teacherUserId === undefined
          ? {}
          : { classSection: { teacher: { userId: scope.teacherUserId }, retiredAt: null },
              enrollment: { status: 'ACTIVE' } }),
        ...(input.classSectionId === undefined ? {} : { classSectionId: input.classSectionId }),
        ...(input.enrollmentId === undefined ? {} : { enrollmentId: input.enrollmentId }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.reviewResult === undefined
          ? {}
          : { id: { in: currentReviewIds!.map(row => row.record_id) } }),
        ...(input.businessDateFrom === undefined && input.businessDateTo === undefined
          ? {}
          : {
              businessDate: {
                ...(input.businessDateFrom === undefined
                  ? {}
                  : { gte: new Date(`${input.businessDateFrom}T00:00:00.000Z`) }),
                ...(input.businessDateTo === undefined
                  ? {}
                  : { lte: new Date(`${input.businessDateTo}T00:00:00.000Z`) }),
              },
            }),
        AND: [
          ...(input.aiReview === undefined ? [] : [{ OR: [1, 2].map(materialVersion => ({
            v81RecordWorkflow_record: { materialVersion },
            aiReviewJobs: { some: { materialVersion,
              ...(['QUEUED', 'RUNNING', 'FAILED'].includes(input.aiReview!)
                ? { status: input.aiReview! } : { status: 'SUCCEEDED', recommendation: input.aiReview! }) } },
          })) }]),
          ...(filters.search === null
            ? []
            : [
                {
                  OR: [
                    { description: { contains: filters.search, mode: 'insensitive' as const } },
                    { sportName: { contains: filters.search, mode: 'insensitive' as const } },
                    ...(principal.role==='ADMIN'?[{student:{OR:[{fullName:{contains:filters.search,mode:'insensitive' as const}},{studentNumber:{contains:filters.search,mode:'insensitive' as const}}]}}]:[]),
                  ],
                },
              ]),
          ...(position === null || businessDatePosition === null
            ? []
            : [
                {
                  OR: [
                    {
                      businessDate:
                        direction === 'asc'
                          ? { gt: businessDatePosition }
                          : { lt: businessDatePosition },
                    },
                    {
                      businessDate: businessDatePosition,
                      id: direction === 'asc' ? { gt: position.id } : { lt: position.id },
                    },
                  ],
                },
              ]),
        ],
      },
      include: {...recordProjectionRelations,student:{select:{fullName:true,studentNumber:true}},classSection:{select:{displayName:true}}},
      orderBy: [{ businessDate: direction }, { id: direction }],
      take: input.limit + 1,
    });
    const hasMore = records.length > input.limit;
    const items = records.slice(0, input.limit);
    const last = items.at(-1);
    return pagedResult(
      (await projectV81Records(tx,items, principal.role !== 'STUDENT')).map((row,index)=>({...row,...(principal.role==='ADMIN'?{studentName:items[index]!.student.fullName,studentNumber:items[index]!.student.studentNumber,className:items[index]!.classSection.displayName}:{})})),
      {
        nextCursor:
          hasMore && last !== undefined
            ? this.cursors.encode(binding, {
                value: last.businessDate.toISOString().slice(0, 10),
                id: last.id,
              })
            : null,
        hasMore,
        limit: input.limit,
      },
    );
    }, {isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead});
  }

  async get(
    principal: AuthenticatedPrincipal,
    context: ExerciseRecordPolicyContext,
  ): Promise<ExerciseRecordProjection> {
    this.assertContext(principal, context);
    return (await projectV81Records(this.prisma,[await this.requiredRecord(context.recordId)], principal.role === 'TEACHER'))[0]!;
  }

  async getEvidenceContext(
    principal: AuthenticatedPrincipal,
    context: ExerciseRecordPolicyContext,
  ): Promise<ExerciseRecordEvidenceContextProjection> {
    this.assertContext(principal, context);
    const record = await this.prisma.exerciseRecord.findUnique({
      where: { id: context.recordId },
      select: {
        id: true,
        status: true,
        studentId: true,
        sessionId: true,
        session: { select: { startedAt: true, completedAt: true } },
        media: { orderBy: { position: 'asc' }, select: { mediaId: true } },
      },
    });
    if (record === null) throw new ApplicationError('EXERCISE_RECORD_NOT_FOUND', 404);
    // Drafts have no record-media associations yet. Recover the verified
    // session evidence that submission already requires, within the same scope.
    if (record.status === 'DRAFT' && principal.role === 'STUDENT') {
      const media = await this.prisma.mediaEvidence.findMany({
        where: {
          organizationId: principal.organizationId,
          ownerStudentId: record.studentId,
          sessionId: record.sessionId,
          businessPurpose: 'EXERCISE_RECORD',
          uploadStatus: 'AVAILABLE',
        },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      record.media = media.map(({ id }) => ({ mediaId: id }));
    }
    return projectExerciseRecordEvidenceContext(record);
  }

  async create(
    principal: AuthenticatedPrincipal,
    input: CreateExerciseRecordRequestDto,
    facts: MutationFacts,
  ): Promise<ExerciseRecordProjection> {
    this.assertStudent(principal);
    const content = normalizeRecordContent(input);
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'createExerciseRecordDraft',
        scope: `${principal.organizationId}:${input.sessionId}`,
        key: facts.idempotencyKey,
        request: { ...content, sessionId: input.sessionId, clientRequestId: input.clientRequestId },
        requestId: facts.requestId,
      },
      async (transaction) => {
        try {
          await this.lock(transaction, 'exercise_sessions', input.sessionId);
          const session = await transaction.exerciseSession.findFirst({
            where: { id: input.sessionId, organizationId: principal.organizationId },
            include: {
              student: { include: { user: true } },
              enrollment: true,
              classSection: { include: { course: true, teacher: true } },
            },
          });
          if (session?.student.userId !== principal.userId) {
            return this.idempotency.failure(new ApplicationError('SESSION_NOT_FOUND', 404));
          }
          if (session.status !== 'COMPLETED') {
            return this.idempotency.failure(new ApplicationError('CONFLICT_STATE_TRANSITION', 409));
          }
          // The session row lock serializes every draft creation for this
          // session. Detect the invariant before INSERT so PostgreSQL does not
          // abort the idempotency transaction on a unique-key violation.
          const existing = await transaction.exerciseRecord.findUnique({
            where: { sessionId: session.id },
            select: { id: true },
          });
          if (existing !== null) {
            return this.idempotency.failure(
              new ApplicationError('EXERCISE_RECORD_ALREADY_EXISTS_FOR_SESSION', 409),
            );
          }
          const recordId = this.ids.next();
          const now = this.clock.now();
          const minimumMinutes = await requiredCourseThreshold(transaction, session.classSectionId);
          assertCreditableDuration(session.actualDurationSeconds, minimumMinutes, (session.maximumDurationSeconds ?? 3600) / 60);
          const created = await transaction.exerciseRecord.create({
            data: {
              id: recordId,
              organizationId: principal.organizationId,
              semesterId: session.semesterId,
              studentId: session.studentId,
              enrollmentId: session.enrollmentId,
              classSectionId: session.classSectionId,
              courseId: session.classSection.courseId,
              teacherId: session.classSection.teacherId,
              sessionId: session.id,
              businessDate: session.businessDate,
              ...content,
              actualDurationSeconds: session.actualDurationSeconds,
              pausedDurationSeconds: session.pausedDurationSeconds,
              creditedDurationSeconds: creditedDuration(session.actualDurationSeconds, minimumMinutes, (session.maximumDurationSeconds ?? 3600) / 60),
              status: 'DRAFT',
              clientRequestId: input.clientRequestId,
              createdAt: now,
              updatedAt: now,
              version: 1,
            },
          });
          await this.appendEvent(transaction, created, principal, facts, {
            eventType: 'CREATED',
            fromStatus: null,
            toStatus: 'DRAFT',
          });
          await this.appendEvidence(transaction, created, principal, facts, {
            permissionId: 'EXERCISE-RECORD-CREATE',
            actionType: 'EXERCISE_RECORD_DRAFT_CREATED',
            eventType: 'EXERCISE_RECORD_DRAFT_CREATED_V1',
            safeMetadata: {
              classSectionId: created.classSectionId,
              sessionId: created.sessionId,
              nextStatus: created.status,
            },
          });
          return this.idempotency.success(projectExerciseRecord({ ...created, reviews: [] }), {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'EXERCISE_RECORD',
            resourceId: created.id,
          });
        } catch (error: unknown) {
          if (this.isUniqueViolation(error)) {
            return this.idempotency.failure(
              new ApplicationError('EXERCISE_RECORD_ALREADY_EXISTS_FOR_SESSION', 409),
            );
          }
          if (error instanceof ApplicationError) return this.idempotency.failure(error);
          throw error;
        }
      },
    );
  }

  async update(
    principal: AuthenticatedPrincipal,
    context: ExerciseRecordPolicyContext,
    input: UpdateExerciseRecordRequestDto,
    facts: MutationFacts,
  ): Promise<ExerciseRecordProjection> {
    this.assertStudentContext(principal, context);
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'updateExerciseRecordDraft',
        scope: `${principal.organizationId}:${context.recordId}`,
        key: facts.idempotencyKey,
        request: { recordId: context.recordId, ...input },
        requestId: facts.requestId,
      },
      async (transaction) => {
        await this.lock(transaction, 'exercise_records', context.recordId);
        const current = await transaction.exerciseRecord.findUnique({
          where: { id: context.recordId },
          include: recordProjectionRelations,
        });
        if (current === null) {
          return this.idempotency.failure(new ApplicationError('EXERCISE_RECORD_NOT_FOUND', 404));
        }
        if (current.version !== input.expectedVersion) {
          return this.idempotency.failure(new ApplicationError('CONFLICT_VERSION_MISMATCH', 409));
        }
        if (current.status !== 'DRAFT') {
          return this.idempotency.failure(new ApplicationError('CONFLICT_STATE_TRANSITION', 409));
        }
        const content = normalizeRecordContent({
          creditType: input.creditType ?? (current.creditType as 'COURSE_RELATED' | 'GENERAL'),
          sportType: input.sportType ?? current.sportType,
          sportName: input.sportName === undefined ? current.sportName : input.sportName,
          description: input.description === undefined ? current.description : input.description,
        });
        const changedFields = Object.entries(content)
          .filter(([key, value]) => current[key as keyof ExerciseRecord] !== value)
          .map(([key]) => key);
        const now = this.clock.now();
        const updated = await transaction.exerciseRecord.update({
          where: { id: current.id, version: input.expectedVersion, status: 'DRAFT' },
          data: { ...content, updatedAt: now, version: { increment: 1 } },
        });
        await this.appendEvent(transaction, updated, principal, facts, {
          eventType: 'UPDATED',
          fromStatus: 'DRAFT',
          toStatus: 'DRAFT',
          safeMetadata: { changedFields },
        });
        await this.appendEvidence(transaction, updated, principal, facts, {
          permissionId: 'EXERCISE-RECORD-UPDATE',
          actionType: 'EXERCISE_RECORD_DRAFT_UPDATED',
          eventType: 'EXERCISE_RECORD_DRAFT_UPDATED_V1',
          safeMetadata: {
            classSectionId: updated.classSectionId,
            sessionId: updated.sessionId,
            previousStatus: current.status,
            nextStatus: updated.status,
            changedFields,
          },
        });
        return this.idempotency.success(
          projectExerciseRecord({
            ...updated,
            reviews: current.reviews,
          }),
          {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'EXERCISE_RECORD',
            resourceId: updated.id,
          },
        );
      },
    );
  }

  async submit(
    principal: AuthenticatedPrincipal,
    context: ExerciseRecordPolicyContext,
    input: SubmitExerciseRecordRequestDto,
    facts: MutationFacts,
  ): Promise<ExerciseRecordProjection> {
    this.assertStudentContext(principal, context);
    const mediaIds = [...input.mediaIds].sort();
    const delayReason = input.swimDelayReason?.trim() ?? '';
    const result = await this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'submitExerciseRecord',
        scope: `${principal.organizationId}:${context.recordId}`,
        key: facts.idempotencyKey,
        request: { recordId: context.recordId, mediaIds, expectedVersion: input.expectedVersion,
          swimDelayReason: delayReason.length > 0 ? delayReason : null },
        requestId: facts.requestId,
      },
      async (transaction) => {
        // Keep a replayable failure while rolling back any submission writes.
        await transaction.$executeRaw`SAVEPOINT exercise_record_submit`;
        await transaction.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR SHARE`;
        await assertProfileReady(transaction,principal.organizationId,principal.userId);
        try {
          await this.lock(transaction, 'enrollments', context.enrollmentId);
          await this.lock(transaction, 'exercise_records', context.recordId);
          const current = await transaction.exerciseRecord.findUnique({
            where: { id: context.recordId },
            include: {
              session: true,
              enrollment: { include: { student: { include: { user: true } } } },
              classSection: { include: { course: true, teacher: true, semester: true } },
            },
          });
          if (current === null) {
            return this.idempotency.failure(new ApplicationError('EXERCISE_RECORD_NOT_FOUND', 404));
          }
          if (current.version !== input.expectedVersion) {
            return this.idempotency.failure(new ApplicationError('CONFLICT_VERSION_MISMATCH', 409));
          }
          if (current.status !== 'DRAFT') {
            return this.idempotency.failure(new ApplicationError('CONFLICT_STATE_TRANSITION', 409));
          }
          await this.lock(transaction, 'exercise_sessions', current.sessionId);
          const now = this.clock.now();
          await this.assertSubmissionScope(transaction, current, now);
          await requireHistoricalSubmissionWindow(transaction,current.sessionId,now);
          const historical = await isHistoricalSession(transaction,current.sessionId);
          const minimumMinutes = await requiredCourseThreshold(transaction, current.classSectionId, current.id);
          const credit = assertCreditableDuration(current.session.actualDurationSeconds, minimumMinutes, (current.session.maximumDurationSeconds ?? 3600) / 60);
          if (
            current.actualDurationSeconds !== current.session.actualDurationSeconds ||
            current.pausedDurationSeconds !== current.session.pausedDurationSeconds ||
            current.creditedDurationSeconds !== credit
          ) {
            return this.idempotency.failure(
              new ApplicationError('EXERCISE_RECORD_DURATION_NOT_CREDITABLE', 422),
            );
          }
          // Only AVAILABLE evidence is eligible for submission. An abandoned or
          // still-uploading object must not block a complete, explicitly selected
          // evidence set from the same session.
          const activeStatuses = ['AVAILABLE'];
          const discoveredMedia = await transaction.mediaEvidence.findMany({
            where: {
              organizationId: principal.organizationId,
              ownerStudentId: current.studentId,
              sessionId: current.sessionId,
              businessPurpose: 'EXERCISE_RECORD',
              captureSource: historical ? { in: ['IN_APP_CAMERA','FILE_PICKER'] } : 'IN_APP_CAMERA',
              uploadStatus: { in: activeStatuses },
            },
            select: { id: true },
            orderBy: { id: 'asc' },
          });
          const lockedMediaIds = [
            ...new Set([...mediaIds, ...discoveredMedia.map(({ id }) => id)]),
          ].sort();
          for (const mediaId of lockedMediaIds)
            await this.lock(transaction, 'media_evidence', mediaId);
          const media = await transaction.mediaEvidence.findMany({
            where: {
              organizationId: principal.organizationId,
              ownerStudentId: current.studentId,
              sessionId: current.sessionId,
              businessPurpose: 'EXERCISE_RECORD',
              captureSource: historical ? { in: ['IN_APP_CAMERA','FILE_PICKER'] } : 'IN_APP_CAMERA',
              uploadStatus: { in: activeStatuses },
            },
            orderBy: { id: 'asc' },
          });
          if (media.some(({ uploadStatus }) => uploadStatus !== 'AVAILABLE')) {
            return this.idempotency.failure(new ApplicationError('MEDIA_NOT_AVAILABLE', 409));
          }
          if (
            media.length !== mediaIds.length ||
            media.some((item, index) => item.id !== mediaIds[index])
          ) {
            return this.idempotency.failure(
              new ApplicationError('EXERCISE_RECORD_MEDIA_INCOMPLETE', 422),
            );
          }
          let imageCount = 0;
          let videoCount = 0;
          for (const item of media) {
            if (item.mediaType === 'IMAGE') imageCount += 1;
            if (item.mediaType === 'VIDEO') videoCount += 1;
          }
          if (imageCount > 6 || videoCount > 1 || imageCount + videoCount < 1) {
            return this.idempotency.failure(
              new ApplicationError('MEDIA_COUNT_LIMIT_EXCEEDED', 422),
            );
          }
          // Daily and weekly quotas constrain credit selection, never submission.
          await transaction.exerciseRecordMedia.createMany({
            data: media.map((item, index) => ({
              organizationId: current.organizationId,
              recordId: current.id,
              mediaId: item.id,
              sessionId: current.sessionId,
              ownerStudentId: current.studentId,
              position: index + 1,
              createdAt: now,
            })),
          });
          const updated = await transaction.exerciseRecord.update({
            where: { id: current.id, version: input.expectedVersion, status: 'DRAFT' },
            data: {
              status: 'SUBMITTED',
              submittedAt: now,
              updatedAt: now,
              version: { increment: 1 },
            },
          });
          const review = await transaction.reviewRecord.create({
            data: {
              id: this.ids.next(),
              organizationId: updated.organizationId,
              recordId: updated.id,
              reviewVersion: 1,
              result: 'PENDING',
              createdAt: now,
            },
          });
          await initializeRecordWorkflow(transaction, { recordId: updated.id, organizationId: updated.organizationId, now, mediaIds,
            ...(input.swimDelayReason === undefined ? {} : { swimDelayReason: input.swimDelayReason }) });
          await this.appendEvent(transaction, updated, principal, facts, {
            eventType: 'SUBMITTED',
            fromStatus: 'DRAFT',
            toStatus: 'SUBMITTED',
            safeMetadata: {
              mediaCount: media.length,
              reviewId: review.id,
              ...(input.swimDelayReason?.trim() ? { swimDelayReason: input.swimDelayReason.trim() } : {}),
              reviewVersion: review.reviewVersion,
              reviewResult: review.result,
            },
          });
          await this.appendEvidence(transaction, updated, principal, facts, {
            permissionId: 'EXERCISE-RECORD-SUBMIT',
            actionType: 'EXERCISE_RECORD_SUBMITTED',
            eventType: 'EXERCISE_RECORD_SUBMITTED_V1',
            safeMetadata: {
              classSectionId: updated.classSectionId,
              sessionId: updated.sessionId,
              previousStatus: current.status,
              nextStatus: updated.status,
              mediaCount: media.length,
              creditedDurationSeconds: Number(updated.creditedDurationSeconds),
            },
          });
          return this.idempotency.success(
            (await projectV81Records(transaction, [{
              ...await transaction.exerciseRecord.findUniqueOrThrow({where:{id:updated.id}}),
              reviews: await transaction.reviewRecord.findMany({where:{recordId:updated.id},orderBy:{reviewVersion:'desc'},take:1}),
            }]))[0]!,
            {
              principalId: principal.userId,
              authSessionId: principal.sessionId,
              resourceType: 'EXERCISE_RECORD',
              resourceId: updated.id,
            },
          );
        } catch (error: unknown) {
          if (error instanceof ApplicationError) {
            // Roll back the idempotency reservation too, so temporary compute
            // exhaustion can be retried with the same submission key.
            if (error.code === 'SYSTEM_SERVICE_UNAVAILABLE') throw error;
            await transaction.$executeRaw`ROLLBACK TO SAVEPOINT exercise_record_submit`;
            return this.idempotency.failure(error);
          }
          if (this.isUniqueViolation(error)) {
            await transaction.$executeRaw`ROLLBACK TO SAVEPOINT exercise_record_submit`;
            return this.idempotency.failure(
              new ApplicationError('EXERCISE_RECORD_DUPLICATE_SUBMISSION', 409),
            );
          }
          throw error;
        }
      },
    );
    // initializeRecordWorkflow already publishes V8.1 credit atomically.
    // No fallible post-commit work may change the accepted submit response.
    return result;
  }

  async discard(
    principal: AuthenticatedPrincipal,
    context: ExerciseRecordPolicyContext,
    input: VersionedRecordReasonRequestDto,
    facts: MutationFacts,
  ): Promise<ExerciseRecordProjection> {
    this.assertStudentContext(principal, context);
    const reason = input.reason.trim();
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'discardExerciseRecord',
        scope: `${principal.organizationId}:${context.recordId}`,
        key: facts.idempotencyKey,
        request: { recordId: context.recordId, reason, expectedVersion: input.expectedVersion },
        requestId: facts.requestId,
      },
      async (transaction) => {
        await this.lock(transaction, 'exercise_records', context.recordId);
        const current = await transaction.exerciseRecord.findUnique({
          where: { id: context.recordId },
          include: recordProjectionRelations,
        });
        if (current === null) {
          return this.idempotency.failure(new ApplicationError('EXERCISE_RECORD_NOT_FOUND', 404));
        }
        if (current.version !== input.expectedVersion) {
          return this.idempotency.failure(new ApplicationError('CONFLICT_VERSION_MISMATCH', 409));
        }
        if (current.status !== 'DRAFT') {
          return this.idempotency.failure(new ApplicationError('CONFLICT_STATE_TRANSITION', 409));
        }
        const now = this.clock.now();
        const updated = await transaction.exerciseRecord.update({
          where: { id: current.id, version: input.expectedVersion, status: 'DRAFT' },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
            updatedAt: now,
            version: { increment: 1 },
          },
        });
        await this.appendEvent(transaction, updated, principal, facts, {
          eventType: 'DISCARDED',
          fromStatus: 'DRAFT',
          toStatus: 'CANCELLED',
          safeMetadata: { reasonCode: 'STUDENT_DISCARD' },
        });
        await this.appendEvidence(transaction, updated, principal, facts, {
          permissionId: 'EXERCISE-RECORD-DISCARD',
          actionType: 'EXERCISE_RECORD_DISCARDED',
          eventType: 'EXERCISE_RECORD_DISCARDED_V1',
          safeMetadata: {
            classSectionId: updated.classSectionId,
            sessionId: updated.sessionId,
            previousStatus: current.status,
            nextStatus: updated.status,
            reasonCode: 'STUDENT_DISCARD',
          },
        });
        return this.idempotency.success(
          projectExerciseRecord({
            ...updated,
            reviews: current.reviews,
          }),
          {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'EXERCISE_RECORD',
            resourceId: updated.id,
          },
        );
      },
    );
  }

  async withdraw(
    principal: AuthenticatedPrincipal,
    context: ExerciseRecordPolicyContext,
    input: VersionedRecordReasonRequestDto,
  ): Promise<never> {
    this.assertStudentContext(principal, context);
    const record = await this.prisma.exerciseRecord.findFirst({
      where: { id: context.recordId, organizationId: principal.organizationId },
      select: { version: true },
    });
    if (record === null) throw new ApplicationError('EXERCISE_RECORD_NOT_FOUND', 404);
    if (record.version !== input.expectedVersion) {
      throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
    }
    throw new ApplicationError('EXERCISE_RECORD_WITHDRAWAL_NOT_ALLOWED', 409);
  }

  private async requiredRecord(recordId: string): Promise<ExerciseRecordWithReview> {
    const record = await this.prisma.exerciseRecord.findUnique({
      where: { id: recordId },
      include: recordProjectionRelations,
    });
    if (record === null) throw new ApplicationError('EXERCISE_RECORD_NOT_FOUND', 404);
    return record;
  }

  private async assertSubmissionScope(
    transaction: Transaction,
    record: ExerciseRecord & {
      session: { status: string; startedAt: Date; actualDurationSeconds: bigint; pausedDurationSeconds: bigint };
      enrollment: {
        status: string;
        endReason?: string | null;
        endedAt?: Date | null;
        student: {
          status: string;
          deletedAt: Date | null;
          user: { status: string; deletedAt: Date | null };
        };
      };
      classSection: {
        status: string;
        closedAt: Date | null;
        submissionDeadlineAt: Date | null;
        course: { status: string; deletedAt: Date | null };
        teacher: { status: string; deletedAt: Date | null };
        semester: { status: string; endDate: Date };
      };
    },
    now: Date,
  ): Promise<void> {
    if (
      record.session.status !== 'COMPLETED' ||
      !permitsExistingCourseSession(record.enrollment, record.classSection, record.session.startedAt) ||
      record.enrollment.student.status !== 'ACTIVE' ||
      record.enrollment.student.deletedAt !== null ||
      record.enrollment.student.user.status !== 'ACTIVE' ||
      record.enrollment.student.user.deletedAt !== null ||
      !(record.classSection.status === 'ACTIVE' ||
        (record.classSection.status === 'CLOSED' && record.classSection.closedAt !== null &&
          record.session.startedAt <= record.classSection.closedAt)) ||
      record.classSection.course.status !== 'ACTIVE' ||
      record.classSection.course.deletedAt !== null ||
      record.classSection.teacher.status !== 'ACTIVE' ||
      record.classSection.teacher.deletedAt !== null ||
      record.classSection.semester.status === 'ARCHIVED'
    ) {
      throw new ApplicationError('ENROLLMENT_NOT_ACTIVE', 409);
    }
    // A makeup admission is frozen when the server starts the session. Revoking
    // the grant later stops new starts; submission of an admitted session remains available.
    const makeup = await transaction.$queryRaw<{
      closing_deadline: Date; admitted: boolean;
    }[]>`SELECT rules.closing_deadline,
        (${record.session.startedAt} >= makeup_window.starts_at AND ${record.session.startedAt} < makeup_window.ends_at
         AND ${record.session.startedAt} >= makeup_window.created_at
         AND (revocation.created_at IS NULL OR ${record.session.startedAt} < revocation.created_at)) AS admitted
      FROM v81_makeup_session_sources source
      JOIN v81_makeup_windows makeup_window ON makeup_window.id=source.window_id
      JOIN v81_course_rules rules ON rules.class_section_id=makeup_window.class_section_id
        AND rules.organization_id=makeup_window.organization_id AND rules.published_at IS NOT NULL
      LEFT JOIN v81_makeup_revocations revocation ON revocation.window_id=makeup_window.id
      WHERE source.session_id=${record.sessionId}::uuid AND makeup_window.organization_id=${record.organizationId}::uuid
        AND makeup_window.class_section_id=${record.classSectionId}::uuid AND makeup_window.enrollment_id=${record.enrollmentId}::uuid`;
    if (makeup[0]) {
      if (!makeup[0].admitted)
        throw new ApplicationError('COURSE_DEADLINE_PASSED', 409);
      return;
    }
  }

  private async appendEvent(
    transaction: Transaction,
    record: ExerciseRecord,
    principal: AuthenticatedPrincipal,
    facts: MutationFacts,
    input: {
      eventType: 'CREATED' | 'UPDATED' | 'SUBMITTED' | 'DISCARDED';
      fromStatus: string | null;
      toStatus: string;
      safeMetadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await transaction.exerciseRecordEvent.create({
      data: {
        id: this.ids.next(),
        organizationId: record.organizationId,
        recordId: record.id,
        eventVersion: record.version,
        eventType: input.eventType,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorUserId: principal.userId,
        authSessionId: principal.sessionId,
        requestId: facts.requestId,
        idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
        safeMetadata: (input.safeMetadata ?? {}) as Prisma.InputJsonValue,
        occurredAt: this.clock.now(),
      },
    });
  }

  private async appendEvidence(
    transaction: Transaction,
    record: ExerciseRecord,
    principal: AuthenticatedPrincipal,
    facts: MutationFacts,
    input: {
      permissionId: string;
      actionType: FoundationAuditAction;
      eventType: string;
      safeMetadata: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.audit.append(transaction, {
      organizationId: record.organizationId,
      actorUserId: principal.userId,
      actorRoleSnapshot: principal.role,
      permissionId: input.permissionId,
      actionType: input.actionType,
      targetType: 'EXERCISE_RECORD',
      targetId: record.id,
      requestId: facts.requestId,
      idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
      outcome: 'SUCCEEDED',
      safeMetadata: input.safeMetadata,
    });
    await this.outbox.append(transaction, {
      organizationId: record.organizationId,
      aggregateType: 'EXERCISE_RECORD',
      aggregateId: record.id,
      eventType: input.eventType,
      eventVersion: record.version,
      payload: {
        recordId: record.id,
        classSectionId: record.classSectionId,
        status: record.status,
        requestId: facts.requestId,
      },
    });
  }

  private async lock(transaction: Transaction, table: string, id: string): Promise<void> {
    if (table === 'exercise_records') {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM exercise_records WHERE id = ${id}::uuid FOR UPDATE`,
      );
      return;
    }
    if (table === 'exercise_sessions') {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM exercise_sessions WHERE id = ${id}::uuid FOR UPDATE`,
      );
      return;
    }
    if (table === 'enrollments') {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM enrollments WHERE id = ${id}::uuid FOR UPDATE`,
      );
      return;
    }
    if (table === 'media_evidence') {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM media_evidence WHERE id = ${id}::uuid FOR UPDATE`,
      );
      return;
    }
    throw new Error('Unsupported lock table');
  }

  private assertContext(
    principal: AuthenticatedPrincipal,
    context: ExerciseRecordPolicyContext,
  ): void {
    if (context.organizationId !== principal.organizationId) this.scopeDenied();
    if (principal.role === 'STUDENT' && context.studentUserId !== principal.userId)
      this.scopeDenied();
    if (principal.role === 'TEACHER' && context.teacherUserId !== principal.userId)
      this.scopeDenied();
  }

  private assertStudentContext(
    principal: AuthenticatedPrincipal,
    context: ExerciseRecordPolicyContext,
  ): void {
    this.assertStudent(principal);
    this.assertContext(principal, context);
  }

  private assertStudent(principal: AuthenticatedPrincipal): void {
    if (principal.role !== 'STUDENT') this.scopeDenied();
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private keyReference(key: string | undefined): string | null {
    return key === undefined ? null : this.digest.digest('idempotency-key-reference', key);
  }

  private scopeDenied(): never {
    throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
  }
}
