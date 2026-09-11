import { Injectable } from '@nestjs/common';
import { requireUnsettledCourse } from '../../v8/v81-settlement-write-guard.js';

import { AuditService } from '../../../common/audit/audit.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import { pagedResult, type PagedResult } from '../../../common/http/envelope.interceptor.js';
import type { AuthenticatedPrincipal } from '../../../common/http/request-context.js';
import {
  IdempotencyService,
  validateIdempotencyKey,
} from '../../../common/idempotency/idempotency.service.js';
import { OutboxService } from '../../../common/outbox/outbox.service.js';
import { ScopedCursorService } from '../../../common/pagination/scoped-cursor.service.js';
import { SecureDigestService } from '../../../common/security/secure-digest.service.js';
import { Clock } from '../../../common/time/clock.js';
import { IdGenerator } from '../../../common/time/id-generator.js';
import {
  computeRosterAlignment,
  normalizeRosterStudentNumber,
  platformSnapshotFingerprint,
  ROSTER_ALIGNMENT_ALGORITHM_VERSION,
} from '../domain/roster-alignment-algorithm.js';
import type {
  ResolveRosterAlignmentRequestDto,
  RosterAlignmentListQueryDto,
  RunAlignmentRequestDto,
  VersionedRosterReasonRequestDto,
} from '../interface/http/roster.dto.js';
import {
  projectAlignmentResult,
  projectAlignmentRun,
  type RosterAlignmentResultProjection,
  type RosterAlignmentRunProjection,
} from './roster-projection.js';

interface MutationFacts {
  requestId: string;
  idempotencyKey: string | undefined;
}

type Transaction = Prisma.TransactionClient;
type ResultWithCurrentRun = Prisma.RosterAlignmentResultGetPayload<{
  include: { alignmentRun: { select: { isCurrent: true } } };
}>;

@Injectable()
export class RosterAlignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly cursors: ScopedCursorService,
    private readonly digest: SecureDigestService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async align(
    principal: AuthenticatedPrincipal,
    rosterImportId: string,
    input: RunAlignmentRequestDto,
    facts: MutationFacts,
  ): Promise<RosterAlignmentRunProjection> {
    this.assertTeacher(principal);
    try {
      return await this.idempotency.execute(
        {
          organizationId: principal.organizationId,
          principalId: principal.userId,
          authSessionId: principal.sessionId,
          operationId: 'alignRosterImport',
          scope: `${principal.organizationId}:${rosterImportId}`,
          key: facts.idempotencyKey,
          request: {
            rosterImportId,
            expectedRosterImportVersion: input.expectedRosterImportVersion,
          },
          requestId: facts.requestId,
          retrySerializationFailure: false,
        },
        async (transaction) => {
          await transaction.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
          const rosterImport = await transaction.officialRosterImport.findFirst({
            where: { id: rosterImportId, organizationId: principal.organizationId },
          });
          if (rosterImport === null) {
            return this.idempotency.failure(new ApplicationError('ROSTER_IMPORT_NOT_FOUND', 404));
          }
          const lock = await transaction.$queryRaw<{ acquired: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtextextended(${rosterImport.classSectionId}, 0)) AS acquired
        `;
          if (lock[0]?.acquired !== true) {
            return this.idempotency.failure(
              new ApplicationError('ROSTER_ALIGNMENT_IN_PROGRESS', 409, { retryAfterSeconds: 1 }),
            );
          }
          const section = await transaction.classSection.findFirst({
            where: {
              id: rosterImport.classSectionId,
              organizationId: principal.organizationId,
            },
            select: { semesterId: true, teacher: { select: { userId: true } } },
          });
          if (section?.teacher.userId !== principal.userId) {
            return this.idempotency.failure(
              new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404),
            );
          }
          await requireUnsettledCourse(transaction, principal.organizationId, rosterImport.classSectionId);
          if (
            rosterImport.status !== 'VALIDATED' ||
            !rosterImport.isCurrent ||
            rosterImport.validRowCount + rosterImport.duplicatedRowCount < 1
          ) {
            return this.idempotency.failure(new ApplicationError('ROSTER_IMPORT_NOT_READY', 409));
          }
          if (rosterImport.version !== input.expectedRosterImportVersion) {
            return this.idempotency.failure(
              new ApplicationError('ROSTER_ALIGNMENT_INPUT_VERSION_CONFLICT', 409, {
                expectedVersion: input.expectedRosterImportVersion,
                currentVersion: rosterImport.version,
              }),
            );
          }
          const running = await transaction.rosterAlignmentRun.findFirst({
            where: { classSectionId: rosterImport.classSectionId, status: 'RUNNING' },
          });
          if (running !== null) {
            return this.idempotency.failure(
              new ApplicationError('ROSTER_ALIGNMENT_IN_PROGRESS', 409, { retryAfterSeconds: 1 }),
            );
          }

          const [officialEntries, activeEnrollments, latest] = await Promise.all([
            transaction.officialRosterEntry.findMany({
              where: { rosterImportId, rowValidationStatus: { in: ['VALID', 'DUPLICATED'] } },
              orderBy: [{ normalizedStudentNumber: 'asc' }, { id: 'asc' }],
            }),
            transaction.enrollment.findMany({
              where: {
                organizationId: principal.organizationId,
                semesterId: section.semesterId,
                status: 'ACTIVE',
              },
              include: { student: true },
              orderBy: [{ student: { studentNumber: 'asc' } }, { id: 'asc' }],
            }),
            transaction.rosterAlignmentRun.findFirst({
              where: { classSectionId: rosterImport.classSectionId },
              orderBy: { comparisonRevision: 'desc' },
              select: { comparisonRevision: true },
            }),
          ]);
          if (officialEntries.length !== rosterImport.validRowCount + rosterImport.duplicatedRowCount) {
            return this.idempotency.failure(
              new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
                invariant: 'ROSTER_ACCEPTED_ENTRY_COUNT_MISMATCH',
              }),
            );
          }
          const platformInputs = activeEnrollments.map((enrollment) => ({
            id: this.ids.next(),
            enrollmentId: enrollment.id,
            studentId: enrollment.studentId,
            classSectionId: enrollment.classSectionId,
            normalizedStudentNumber: normalizeRosterStudentNumber(enrollment.student.studentNumber),
            fullName: enrollment.student.fullName,
            gender: enrollment.student.gender,
            gradeYear: enrollment.student.gradeYear,
          }));
          const officialInputs = officialEntries.map((entry) => ({
            id: entry.id,
            normalizedStudentNumber: entry.normalizedStudentNumber ?? '',
            fullName: entry.fullName ?? '',
            gender: entry.gender,
            gradeYear: entry.gradeYear,
          }));
          const now = this.clock.now();
          const runId = this.ids.next();
          const comparisonRevision = (latest?.comparisonRevision ?? 0) + 1;
          const snapshotFingerprint = platformSnapshotFingerprint({
            organizationId: principal.organizationId,
            semesterId: section.semesterId,
            entries: platformInputs,
          });
          await transaction.rosterAlignmentRun.create({
            data: {
              id: runId,
              organizationId: principal.organizationId,
              semesterId: section.semesterId,
              classSectionId: rosterImport.classSectionId,
              rosterImportId,
              comparisonRevision,
              algorithmVersion: ROSTER_ALIGNMENT_ALGORITHM_VERSION,
              platformSnapshotFingerprint: snapshotFingerprint,
              platformSnapshotAt: now,
              status: 'RUNNING',
              startedBy: principal.userId,
              startedAt: now,
              resultCount: 0,
              isCurrent: false,
            },
          });
          if (platformInputs.length > 0) {
            await transaction.rosterAlignmentPlatformEntry.createMany({
              data: platformInputs.map((entry) => ({
                id: entry.id,
                alignmentRunId: runId,
                organizationId: principal.organizationId,
                enrollmentId: entry.enrollmentId,
                studentId: entry.studentId,
                classSectionId: entry.classSectionId,
                semesterId: section.semesterId,
                normalizedStudentNumber: entry.normalizedStudentNumber,
                fullNameSnapshot: entry.fullName,
                genderSnapshot: entry.gender ?? 'OTHER',
                gradeYearSnapshot: entry.gradeYear ?? 2000,
                enrollmentStatusSnapshot: 'ACTIVE',
                createdAt: now,
              })),
            });
          }
          let computation: ReturnType<typeof computeRosterAlignment>;
          try {
            computation = computeRosterAlignment({
              organizationId: principal.organizationId,
              semesterId: section.semesterId,
              targetClassSectionId: rosterImport.classSectionId,
              officialEntries: officialInputs,
              platformEntries: platformInputs,
            });
          } catch {
            const failedAt = this.clock.now();
            await transaction.rosterAlignmentRun.update({
              where: { id: runId },
              data: {
                status: 'FAILED',
                completedAt: failedAt,
                failureCode: 'ROSTER_ALIGNMENT_EXCEPTION',
                failureDetailsSafe: { category: 'DOMAIN_COMPUTATION' },
                resultCount: 0,
                isCurrent: false,
              },
            });
            await this.audit.append(transaction, {
              organizationId: principal.organizationId,
              actorUserId: principal.userId,
              actorRoleSnapshot: principal.role,
              permissionId: 'ROSTER-IMPORT-ALIGN',
              actionType: 'ROSTER_ALIGNED',
              targetType: 'ROSTER_ALIGNMENT_RUN',
              targetId: runId,
              requestId: facts.requestId,
              idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
              outcome: 'FAILED',
              reasonCode: 'ROSTER_ALIGNMENT_EXCEPTION',
              safeMetadata: {
                classSectionId: rosterImport.classSectionId,
                rosterImportId,
                comparisonRevision,
                resultCount: 0,
              },
            });
            await this.outbox.append(transaction, {
              organizationId: principal.organizationId,
              aggregateType: 'ROSTER_ALIGNMENT_RUN',
              aggregateId: runId,
              eventType: 'ROSTER_ALIGNMENT_FAILED_V1',
              eventVersion: comparisonRevision,
              payload: {
                alignmentRunId: runId,
                rosterImportId,
                classSectionId: rosterImport.classSectionId,
                comparisonRevision,
                failureCode: 'ROSTER_ALIGNMENT_EXCEPTION',
                requestId: facts.requestId,
              },
            });
            return this.idempotency.failure(
              new ApplicationError('ROSTER_ALIGNMENT_EXCEPTION', 409, {
                alignmentRunId: runId,
              }),
              {
                principalId: principal.userId,
                authSessionId: principal.sessionId,
              },
            );
          }
          await transaction.rosterAlignmentRun.updateMany({
            where: { classSectionId: rosterImport.classSectionId, isCurrent: true },
            data: { isCurrent: false },
          });
          await transaction.rosterAlignmentResult.updateMany({
            where: { classSectionId: rosterImport.classSectionId, supersededAt: null },
            data: { supersededAt: now },
          });
          if (computation.results.length > 0) {
            await transaction.rosterAlignmentResult.createMany({
              data: computation.results.map((alignment) => ({
                id: this.ids.next(),
                organizationId: principal.organizationId,
                alignmentRunId: runId,
                rosterImportId,
                classSectionId: rosterImport.classSectionId,
                subjectKey: alignment.subjectKey,
                rosterEntryId: alignment.rosterEntryId,
                enrollmentId: alignment.enrollmentId,
                studentId: alignment.studentId,
                comparisonRevision,
                status: alignment.status,
                differences: alignment.differences as unknown as Prisma.InputJsonValue,
                reasonCode: `ROSTER_${alignment.status}`,
                resolutionStatus: alignment.status === 'MATCHED' ? 'RESOLVED' : 'PENDING',
                lastResolutionAction: null,
                currentResolutionVersion: 0,
                resolutionNote: null,
                resolvedAt: alignment.status === 'MATCHED' ? now : null,
                resolvedBy: null,
                lastReconciledAt: now,
                supersededAt: null,
                createdAt: now,
                version: 1,
              })),
            });
          }
          const completed = await transaction.rosterAlignmentRun.update({
            where: { id: runId },
            data: {
              status: 'COMPLETED',
              completedAt: now,
              resultCount: computation.results.length,
              isCurrent: true,
            },
          });
          await this.audit.append(transaction, {
            organizationId: principal.organizationId,
            actorUserId: principal.userId,
            actorRoleSnapshot: principal.role,
            permissionId: 'ROSTER-IMPORT-ALIGN',
            actionType: 'ROSTER_ALIGNED',
            targetType: 'ROSTER_ALIGNMENT_RUN',
            targetId: completed.id,
            requestId: facts.requestId,
            idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
            outcome: 'SUCCEEDED',
            safeMetadata: {
              classSectionId: completed.classSectionId,
              rosterImportId: completed.rosterImportId,
              comparisonRevision: completed.comparisonRevision,
              resultCount: completed.resultCount,
            },
          });
          await this.outbox.append(transaction, {
            organizationId: principal.organizationId,
            aggregateType: 'ROSTER_ALIGNMENT_RUN',
            aggregateId: completed.id,
            eventType: 'ROSTER_ALIGNMENT_COMPLETED_V1',
            eventVersion: completed.comparisonRevision,
            payload: {
              alignmentRunId: completed.id,
              rosterImportId,
              classSectionId: completed.classSectionId,
              comparisonRevision: completed.comparisonRevision,
              resultCount: completed.resultCount,
              requestId: facts.requestId,
            },
          });
          return this.idempotency.success(projectAlignmentRun(completed), {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'ROSTER_ALIGNMENT_RUN',
            resourceId: completed.id,
          });
        },
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ApplicationError('ROSTER_ALIGNMENT_SNAPSHOT_STALE', 409);
      }
      throw error;
    }
  }

  async list(
    principal: AuthenticatedPrincipal,
    input: RosterAlignmentListQueryDto,
  ): Promise<PagedResult<RosterAlignmentResultProjection>> {
    if (principal.role === 'STUDENT') this.scopeDenied();
    if (principal.role === 'ADMIN' && input.q !== undefined) this.scopeDenied();
    if (input.classSectionId !== undefined) {
      await this.assertReadSection(principal, input.classSectionId);
    }
    const ascending = input.sort === 'createdAt';
    const search = input.q?.trim();
    const binding = {
      resource: 'ROSTER_ALIGNMENT_RESULT' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters: {
        classSectionId: input.classSectionId ?? null,
        rosterImportId: input.rosterImportId ?? null,
        alignmentRunId: input.alignmentRunId ?? null,
        currentOnly: input.currentOnly,
        status: input.status ?? null,
        resolutionStatus: input.resolutionStatus ?? null,
        search: search ?? null,
      },
      sort: ascending ? 'createdAt' : '-createdAt',
      limit: input.limit,
    };
    const position = this.cursors.decode(input.cursor, binding);
    const createdAt = position === null ? null : new Date(position.value);
    if (createdAt !== null && Number.isNaN(createdAt.getTime())) this.invalidCursor();
    const where: Prisma.RosterAlignmentResultWhereInput = {
      organizationId: principal.organizationId,
      ...(principal.role === 'TEACHER'
        ? { classSection: { teacher: { userId: principal.userId } } }
        : {}),
      ...(input.classSectionId === undefined ? {} : { classSectionId: input.classSectionId }),
      ...(input.rosterImportId === undefined ? {} : { rosterImportId: input.rosterImportId }),
      ...(input.alignmentRunId === undefined ? {} : { alignmentRunId: input.alignmentRunId }),
      ...(input.currentOnly ? { supersededAt: null, alignmentRun: { isCurrent: true } } : {}),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.resolutionStatus === undefined ? {} : { resolutionStatus: input.resolutionStatus }),
      ...(search === undefined || search.length === 0
        ? {}
        : {
            OR: [
              { subjectKey: { contains: search.toLowerCase() } },
              { rosterEntry: { normalizedStudentNumber: { contains: search.toUpperCase() } } },
            ],
          }),
      ...(position === null
        ? {}
        : {
            OR: [
              { createdAt: ascending ? { gt: createdAt! } : { lt: createdAt! } },
              {
                createdAt: createdAt!,
                id: ascending ? { gt: position.id } : { lt: position.id },
              },
            ],
          }),
    };
    const items = await this.prisma.rosterAlignmentResult.findMany({
      where,
      orderBy: [{ createdAt: ascending ? 'asc' : 'desc' }, { id: ascending ? 'asc' : 'desc' }],
      take: input.limit + 1,
    });
    const page = items.slice(0, input.limit);
    const last = page.at(-1);
    return pagedResult(
      page.map((item) => projectAlignmentResult(item, principal.role)),
      {
        nextCursor:
          items.length > input.limit && last !== undefined
            ? this.cursors.encode(binding, { value: last.createdAt.toISOString(), id: last.id })
            : null,
        hasMore: items.length > input.limit,
        limit: input.limit,
      },
    );
  }

  async get(
    principal: AuthenticatedPrincipal,
    alignmentResultId: string,
  ): Promise<RosterAlignmentResultProjection> {
    const result = await this.requiredResult(principal.organizationId, alignmentResultId);
    await this.assertReadSection(principal, result.classSectionId);
    return projectAlignmentResult(result, principal.role);
  }

  confirm(
    principal: AuthenticatedPrincipal,
    alignmentResultId: string,
    input: VersionedRosterReasonRequestDto,
    facts: MutationFacts,
  ): Promise<RosterAlignmentResultProjection> {
    return this.transition(principal, alignmentResultId, input, facts, 'CONFIRM');
  }

  reopen(
    principal: AuthenticatedPrincipal,
    alignmentResultId: string,
    input: VersionedRosterReasonRequestDto,
    facts: MutationFacts,
  ): Promise<RosterAlignmentResultProjection> {
    return this.transition(principal, alignmentResultId, input, facts, 'REOPEN');
  }

  resolve(
    principal: AuthenticatedPrincipal,
    alignmentResultId: string,
    input: ResolveRosterAlignmentRequestDto,
    facts: MutationFacts,
  ): Promise<RosterAlignmentResultProjection> {
    return this.transition(
      principal,
      alignmentResultId,
      { reason: input.resolutionNote, expectedVersion: input.expectedVersion },
      facts,
      'RESOLVE',
      { type: input.evidenceType, id: input.evidenceReferenceId },
    );
  }

  async ignore(
    principal: AuthenticatedPrincipal,
    alignmentResultId: string,
    input: VersionedRosterReasonRequestDto,
    idempotencyKey: string | undefined,
  ): Promise<never> {
    validateIdempotencyKey(idempotencyKey);
    this.assertTeacher(principal);
    if (input.reason.trim().length === 0) this.invalidText('reason');
    const result = await this.requiredResult(principal.organizationId, alignmentResultId);
    await this.assertTeacherSection(principal, result.classSectionId);
    if (result.supersededAt !== null || !result.alignmentRun.isCurrent) {
      throw new ApplicationError('ROSTER_ALIGNMENT_RESULT_SUPERSEDED', 409);
    }
    if (result.version !== input.expectedVersion) {
      throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409, {
        expectedVersion: input.expectedVersion,
        currentVersion: result.version,
      });
    }
    throw new ApplicationError('ROSTER_IGNORE_NOT_ALLOWED', 409);
  }

  private async transition(
    principal: AuthenticatedPrincipal,
    alignmentResultId: string,
    input: { reason: string; expectedVersion: number },
    facts: MutationFacts,
    action: 'CONFIRM' | 'RESOLVE' | 'REOPEN',
    evidence?: { type: string; id: string },
  ): Promise<RosterAlignmentResultProjection> {
    this.assertTeacher(principal);
    const reason = input.reason.trim();
    if (reason.length === 0) {
      this.invalidText(action === 'RESOLVE' ? 'resolutionNote' : 'reason');
    }
    const operationId =
      action === 'CONFIRM'
        ? 'confirmRosterAlignmentResult'
        : action === 'RESOLVE'
          ? 'resolveRosterAlignmentResult'
          : 'reopenRosterAlignmentResult';
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId,
        scope: `${principal.organizationId}:${alignmentResultId}`,
        key: facts.idempotencyKey,
        request: {
          alignmentResultId,
          reason,
          expectedVersion: input.expectedVersion,
          evidence: evidence ?? null,
        },
        requestId: facts.requestId,
      },
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
        const result = await transaction.rosterAlignmentResult.findFirst({
          where: { id: alignmentResultId, organizationId: principal.organizationId },
          include: {
            alignmentRun: { select: { isCurrent: true } },
            classSection: { select: { teacher: { select: { userId: true } } } },
          },
        });
        if (result?.classSection.teacher.userId !== principal.userId) {
          return this.idempotency.failure(
            new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404),
          );
        }
        await requireUnsettledCourse(transaction, principal.organizationId, result.classSectionId);
        if (result.supersededAt !== null || !result.alignmentRun.isCurrent) {
          return this.idempotency.failure(
            new ApplicationError('ROSTER_ALIGNMENT_RESULT_SUPERSEDED', 409),
          );
        }
        if (result.version !== input.expectedVersion) {
          return this.idempotency.failure(
            new ApplicationError('CONFLICT_VERSION_MISMATCH', 409, {
              expectedVersion: input.expectedVersion,
              currentVersion: result.version,
            }),
          );
        }
        const fromStatus = result.resolutionStatus;
        const toStatus = this.nextResolutionStatus(action, fromStatus, result.status);
        if (action === 'RESOLVE') {
          if (evidence === undefined) {
            return this.idempotency.failure(
              new ApplicationError('ROSTER_RESOLUTION_EVIDENCE_REQUIRED', 422),
            );
          }
          const validEvidence = await this.validateEvidence(
            transaction,
            result,
            evidence.type,
            evidence.id,
          );
          if (!validEvidence) {
            return this.idempotency.failure(
              new ApplicationError('ROSTER_RESOLUTION_EVIDENCE_REQUIRED', 422),
            );
          }
        }
        const now = this.clock.now();
        const nextVersion = result.currentResolutionVersion + 1;
        await transaction.rosterResolutionEvent.create({
          data: {
            id: this.ids.next(),
            organizationId: principal.organizationId,
            alignmentResultId: result.id,
            resolutionVersion: nextVersion,
            action,
            fromStatus,
            toStatus,
            reason,
            evidenceType: evidence?.type ?? null,
            evidenceReferenceId: evidence?.id ?? null,
            actorUserId: principal.userId,
            actorRoleSnapshot: principal.role,
            requestId: facts.requestId,
            idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
            createdAt: now,
          },
        });
        const changed = await transaction.rosterAlignmentResult.updateMany({
          where: { id: result.id, version: input.expectedVersion, supersededAt: null },
          data: {
            resolutionStatus: toStatus,
            lastResolutionAction: action,
            currentResolutionVersion: nextVersion,
            resolutionNote: reason,
            resolvedAt: toStatus === 'RESOLVED' ? now : null,
            resolvedBy: toStatus === 'RESOLVED' ? principal.userId : null,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
        }
        await this.audit.append(transaction, {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          actorRoleSnapshot: principal.role,
          permissionId: `ROSTER-ALIGNMENT-${action}`,
          actionType: 'ROSTER_RESOLUTION_CHANGED',
          targetType: 'ROSTER_ALIGNMENT_RESULT',
          targetId: result.id,
          requestId: facts.requestId,
          idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
          outcome: 'SUCCEEDED',
          safeMetadata: {
            classSectionId: result.classSectionId,
            previousStatus: fromStatus,
            nextStatus: toStatus,
            action,
            evidenceType: evidence?.type ?? null,
          },
        });
        await this.outbox.append(transaction, {
          organizationId: principal.organizationId,
          aggregateType: 'ROSTER_ALIGNMENT_RESULT',
          aggregateId: result.id,
          eventType:
            action === 'CONFIRM'
              ? 'ROSTER_ALIGNMENT_CONFIRMED_V1'
              : action === 'RESOLVE'
                ? 'ROSTER_ALIGNMENT_RESOLVED_V1'
                : 'ROSTER_ALIGNMENT_REOPENED_V1',
          eventVersion: result.version + 1,
          payload: {
            alignmentResultId: result.id,
            classSectionId: result.classSectionId,
            resolutionStatus: toStatus,
            resolutionVersion: nextVersion,
            requestId: facts.requestId,
          },
        });
        const updated = await transaction.rosterAlignmentResult.findUniqueOrThrow({
          where: { id: result.id },
        });
        return this.idempotency.success(projectAlignmentResult(updated, principal.role), {
          principalId: principal.userId,
          authSessionId: principal.sessionId,
          resourceType: 'ROSTER_ALIGNMENT_RESULT',
          resourceId: result.id,
        });
      },
    );
  }

  private async validateEvidence(
    transaction: Transaction,
    result: {
      organizationId: string;
      classSectionId: string;
      alignmentRunId: string;
      rosterImportId: string;
      comparisonRevision: number;
      rosterEntryId: string | null;
      enrollmentId: string | null;
      studentId: string | null;
    },
    evidenceType: string,
    evidenceReferenceId: string,
  ): Promise<boolean> {
    if (evidenceType === 'NEW_ALIGNMENT_RESULT') {
      // A newer comparison revision necessarily supersedes the older result. The mutation
      // guard rejects superseded results before evidence evaluation, so this reserved V1
      // evidence branch must remain fail closed instead of weakening current-run ownership.
      return false;
    }
    if (evidenceType === 'ENROLLMENT_STATUS_EVENT') {
      if (result.enrollmentId === null) return false;
      return (
        (await transaction.enrollmentStatusEvent.findFirst({
          where: {
            id: evidenceReferenceId,
            organizationId: result.organizationId,
            enrollmentId: result.enrollmentId,
            ...(result.studentId === null ? {} : { enrollment: { studentId: result.studentId } }),
          },
          select: { id: true },
        })) !== null
      );
    }
    if (evidenceType === 'OFFICIAL_ROSTER_VERSION') {
      if (evidenceReferenceId === result.rosterImportId) return false;
      const officialSubject =
        result.rosterEntryId === null
          ? null
          : await transaction.officialRosterEntry.findFirst({
              where: {
                id: result.rosterEntryId,
                organizationId: result.organizationId,
                rowValidationStatus: 'VALID',
              },
              select: { normalizedStudentNumber: true },
            });
      const platformSubject =
        officialSubject !== null || result.enrollmentId === null || result.studentId === null
          ? null
          : await transaction.rosterAlignmentPlatformEntry.findFirst({
              where: {
                alignmentRunId: result.alignmentRunId,
                organizationId: result.organizationId,
                enrollmentId: result.enrollmentId,
                studentId: result.studentId,
              },
              select: { normalizedStudentNumber: true },
            });
      const normalizedStudentNumber =
        officialSubject?.normalizedStudentNumber ??
        platformSubject?.normalizedStudentNumber ??
        null;
      if (normalizedStudentNumber === null) return false;
      return (
        (await transaction.officialRosterImport.findFirst({
          where: {
            id: evidenceReferenceId,
            organizationId: result.organizationId,
            classSectionId: result.classSectionId,
            status: 'VALIDATED',
            entries: {
              some: {
                rowValidationStatus: 'VALID',
                normalizedStudentNumber,
              },
            },
          },
          select: { id: true },
        })) !== null
      );
    }
    return false;
  }

  private nextResolutionStatus(
    action: 'CONFIRM' | 'RESOLVE' | 'REOPEN',
    current: string,
    alignmentStatus: string,
  ): 'PENDING' | 'CONFIRMED' | 'RESOLVED' {
    if (action === 'CONFIRM') {
      if (current !== 'PENDING' || alignmentStatus === 'MATCHED') this.invalidResolution();
      return 'CONFIRMED';
    }
    if (action === 'RESOLVE') {
      if (!['PENDING', 'CONFIRMED'].includes(current)) this.invalidResolution();
      return 'RESOLVED';
    }
    if (!['RESOLVED', 'IGNORED'].includes(current) || alignmentStatus === 'MATCHED') {
      this.invalidResolution();
    }
    return 'PENDING';
  }

  private async requiredResult(
    organizationId: string,
    alignmentResultId: string,
  ): Promise<ResultWithCurrentRun> {
    const result = await this.prisma.rosterAlignmentResult.findFirst({
      where: { id: alignmentResultId, organizationId },
      include: { alignmentRun: { select: { isCurrent: true } } },
    });
    if (result === null) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    return result;
  }

  private async assertReadSection(
    principal: AuthenticatedPrincipal,
    classSectionId: string,
  ): Promise<void> {
    if (principal.role === 'STUDENT') this.scopeDenied();
    const section = await this.prisma.classSection.findFirst({
      where: { id: classSectionId, organizationId: principal.organizationId },
      select: { teacher: { select: { userId: true } } },
    });
    if (section === null) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    if (principal.role === 'TEACHER' && section.teacher.userId !== principal.userId) {
      throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    }
  }

  private async assertTeacherSection(
    principal: AuthenticatedPrincipal,
    classSectionId: string,
  ): Promise<void> {
    this.assertTeacher(principal);
    await this.assertReadSection(principal, classSectionId);
  }

  private assertTeacher(principal: AuthenticatedPrincipal): void {
    if (principal.role !== 'TEACHER') this.scopeDenied();
  }

  private keyReference(key: string | undefined): string | null {
    return key === undefined ? null : this.digest.digest('idempotency-key-reference', key);
  }

  private invalidResolution(): never {
    throw new ApplicationError('ROSTER_RESOLUTION_INVALID', 422);
  }

  private invalidCursor(): never {
    throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
  }

  private invalidText(field: 'reason' | 'resolutionNote'): never {
    throw new ApplicationError('VALIDATION_FAILED', 422, {
      fieldErrors: [
        {
          field,
          code: 'INVALID',
          i18nKey: 'error.validation.failed',
          params: {},
        },
      ],
    });
  }

  private scopeDenied(): never {
    throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
  }

  private integrity(invariant: string): never {
    throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, { invariant });
  }
}
