import { requireUnsettledCourse } from '../v8/v81-settlement-write-guard.js';
import { Injectable } from '@nestjs/common';
import { approveCertificationCredit } from '../v8/v81-certification-credit.js';

import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { pagedResult, type PagedResult } from '../../common/http/envelope.interceptor.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import {
  IdempotencyService,
  type IdempotentFailure,
} from '../../common/idempotency/idempotency.service.js';
import { OutboxService } from '../../common/outbox/outbox.service.js';
import { ScopedCursorService } from '../../common/pagination/scoped-cursor.service.js';
import { SecureDigestService } from '../../common/security/secure-digest.service.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  CreateExemptionApplicationRequestDto,
  ExemptionApplicationListQueryDto,
  ReviewExemptionApplicationRequestDto,
  UpdateExemptionApplicationRequestDto,
} from './client-capabilities.dto.js';

const applicationInclude = {
  student: { select: { userId: true } },
  classSection: { include: { teacher: { select: { userId: true } } } },
  media: { orderBy: { position: 'asc' as const }, select: { mediaId: true } },
} as const;

const applicationReadInclude = { media: applicationInclude.media } as const;
type ApplicationReadRow = Prisma.ExemptionApplicationGetPayload<{ include: typeof applicationReadInclude }>;
type ApplicationRow = Prisma.ExemptionApplicationGetPayload<{ include: typeof applicationInclude }>;

interface MutationFacts {
  requestId: string;
  idempotencyKey: string | undefined;
}

export interface ExemptionApplicationProjection {
  id: string;
  studentId: string;
  enrollmentId: string;
  classSectionId: string;
  applicationType: string;
  reason: string;
  mediaIds: string[];
  status: string;
  publicComment: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  version: number;
}

export interface StructuredExemptionApplicationProjection extends ExemptionApplicationProjection {
  applicationSubtype: string | null;
  organizationName: string | null;
}

@Injectable()
export class ExemptionApplicationsService {
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

  async list(
    principal: AuthenticatedPrincipal,
    input: ExemptionApplicationListQueryDto,
  ): Promise<PagedResult<ExemptionApplicationProjection>> {
    return this.listProjected(principal, input, (row) => this.project(row));
  }

  async listStructured(
    principal: AuthenticatedPrincipal,
    input: ExemptionApplicationListQueryDto,
  ): Promise<PagedResult<StructuredExemptionApplicationProjection>> {
    return this.listProjected(principal, input, (row) => this.projectStructured(row));
  }

  private async listProjected<T>(
    principal: AuthenticatedPrincipal,
    input: ExemptionApplicationListQueryDto,
    project: (row: ApplicationReadRow) => T,
  ): Promise<PagedResult<T>> {
    const binding = {
      resource: 'EXEMPTION_APPLICATION' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters: { status: input.status ?? null, classSectionId: input.classSectionId ?? null },
      sort: '-createdAt',
      limit: input.limit,
    };
    const position = this.cursors.decode(input.cursor, binding);
    const rows = await this.prisma.exemptionApplication.findMany({
      where: {
        organizationId: principal.organizationId,
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.classSectionId === undefined ? {} : { classSectionId: input.classSectionId }),
        ...this.roleScope(principal),
        ...(position === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: new Date(position.value) } },
                { createdAt: new Date(position.value), id: { lt: position.id } },
              ],
            }),
      },
      include: applicationReadInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page.at(-1);
    return pagedResult(page.map(project), {
      nextCursor:
        hasMore && last !== undefined
          ? this.cursors.encode(binding, { value: last.createdAt.toISOString(), id: last.id })
          : null,
      hasMore,
      limit: input.limit,
    });
  }

  async get(
    principal: AuthenticatedPrincipal,
    applicationId: string,
  ): Promise<ExemptionApplicationProjection> {
    const row = await this.prisma.exemptionApplication.findFirst({
      where: {
        id: applicationId,
        organizationId: principal.organizationId,
        ...this.roleScope(principal),
      },
      include: applicationReadInclude,
    });
    if (row === null) throw new ApplicationError('EXEMPTION_APPLICATION_NOT_FOUND', 404);
    return this.project(row);
  }

  async create(
    principal: AuthenticatedPrincipal,
    input: CreateExemptionApplicationRequestDto,
    facts: MutationFacts,
  ): Promise<ExemptionApplicationProjection> {
    this.requireStudent(principal);
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'createExemptionApplication',
        scope: `enrollment:${input.enrollmentId}`,
        key: facts.idempotencyKey,
        request: input,
        requestId: facts.requestId,
      },
      async (transaction) => {
        await this.requireNormal(transaction, principal.organizationId);
        if (
          !this.hasValidApplicationDetails(
            input.applicationType,
            input.applicationSubtype,
            input.organizationName,
          )
        ) {
          return this.idempotency.failure(this.applicationDetailsFailure());
        }
        const enrollment = await transaction.enrollment.findFirst({
          where: {
            id: input.enrollmentId,
            organizationId: principal.organizationId,
            status: 'ACTIVE',
            student: { userId: principal.userId, status: 'ACTIVE' },
          },
        });
        if (enrollment === null) {
          return this.idempotency.failure(new ApplicationError('ENROLLMENT_NOT_FOUND', 404));
        }
        await requireUnsettledCourse(transaction, principal.organizationId, enrollment.classSectionId);
        const section = await transaction.classSection.findUniqueOrThrow({
          where: { id: enrollment.classSectionId },
          include: { semester: true },
        });
        if (section.closedAt || section.semester.status !== 'CURRENT')
          return this.transitionFailure();
        const mediaFailure = await this.validateMedia(
          transaction,
          principal.organizationId,
          enrollment.studentId,
          enrollment.id,
          input.mediaIds,
          false,
        );
        if (mediaFailure !== null) return this.idempotency.failure(mediaFailure);
        const now = this.clock.now();
        const application = await transaction.exemptionApplication.create({
          data: {
            id: this.ids.next(),
            organizationId: principal.organizationId,
            semesterId: enrollment.semesterId,
            studentId: enrollment.studentId,
            enrollmentId: enrollment.id,
            classSectionId: enrollment.classSectionId,
            applicationType: input.applicationType,
            applicationSubtype: input.applicationSubtype ?? null,
            organizationName: input.organizationName ?? null,
            reason: input.reason,
            status: 'DRAFT',
            createdAt: now,
            updatedAt: now,
          },
        });
        await this.replaceMedia(transaction, application, input.mediaIds, now);
        await this.appendEvent(
          transaction,
          principal,
          application,
          'CREATED',
          null,
          'DRAFT',
          facts,
        );
        await this.appendAuditAndOutbox(transaction, principal, application, null, 'DRAFT', facts);
        const row = await this.load(transaction, application.id, principal.organizationId);
        return this.idempotency.success(this.project(row), {
          principalId: principal.userId,
          authSessionId: principal.sessionId,
          resourceType: 'EXEMPTION_APPLICATION',
          resourceId: application.id,
        });
      },
    );
  }

  async update(
    principal: AuthenticatedPrincipal,
    applicationId: string,
    input: UpdateExemptionApplicationRequestDto,
    facts: MutationFacts,
  ): Promise<ExemptionApplicationProjection> {
    this.requireStudent(principal);
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'updateExemptionApplication',
        scope: `application:${applicationId}`,
        key: facts.idempotencyKey,
        request: { applicationId, ...input },
        requestId: facts.requestId,
      },
      async (transaction) => {
        await this.requireNormal(transaction, principal.organizationId);
        const current = await this.loadForStudent(transaction, principal, applicationId);
        if (current === null) return this.notFoundFailure();
        await requireUnsettledCourse(transaction, principal.organizationId, current.classSectionId);
        if (current.version !== input.expectedVersion) return this.versionFailure();
        if (current.status !== 'DRAFT' && current.status !== 'SUPPLEMENT_REQUIRED') {
          return this.transitionFailure();
        }
        if (
          input.applicationSubtype === undefined &&
          input.organizationName === undefined &&
          input.reason === undefined &&
          input.mediaIds === undefined
        ) {
          return this.idempotency.failure(new ApplicationError('VALIDATION_FAILED', 422));
        }
        const applicationSubtype = input.applicationSubtype ?? current.applicationSubtype;
        const organizationName =
          input.organizationName === undefined ? current.organizationName : input.organizationName;
        const detailsChanged =
          input.applicationSubtype !== undefined || input.organizationName !== undefined;
        if (
          detailsChanged &&
          (applicationSubtype === null ||
            !this.hasValidApplicationDetails(
              current.applicationType,
              applicationSubtype,
              organizationName,
            ))
        ) {
          return this.idempotency.failure(this.applicationDetailsFailure());
        }
        if (input.mediaIds !== undefined) {
          const mediaFailure = await this.validateMedia(
            transaction,
            current.organizationId,
            current.studentId,
            current.enrollmentId,
            input.mediaIds,
            false,
          );
          if (mediaFailure !== null) return this.idempotency.failure(mediaFailure);
        }
        const now = this.clock.now();
        const updated = await transaction.exemptionApplication.update({
          where: { id: current.id },
          data: {
            ...(input.applicationSubtype === undefined
              ? {}
              : { applicationSubtype: input.applicationSubtype }),
            ...(input.organizationName === undefined
              ? {}
              : { organizationName: input.organizationName }),
            ...(input.reason === undefined ? {} : { reason: input.reason }),
            updatedAt: now,
            version: { increment: 1 },
          },
        });
        if (input.mediaIds !== undefined)
          await this.replaceMedia(transaction, updated, input.mediaIds, now);
        await this.appendEvent(
          transaction,
          principal,
          updated,
          'UPDATED',
          current.status,
          current.status,
          facts,
        );
        await this.appendAuditAndOutbox(
          transaction,
          principal,
          updated,
          current.status,
          current.status,
          facts,
        );
        return this.idempotency.success(
          this.project(await this.load(transaction, updated.id, updated.organizationId)),
          this.references(principal, updated.id),
        );
      },
    );
  }

  async submit(
    principal: AuthenticatedPrincipal,
    applicationId: string,
    expectedVersion: number,
    facts: MutationFacts,
  ): Promise<ExemptionApplicationProjection> {
    this.requireStudent(principal);
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'submitExemptionApplication',
        scope: `application:${applicationId}`,
        key: facts.idempotencyKey,
        request: { applicationId, expectedVersion },
        requestId: facts.requestId,
      },
      async (transaction) => {
        await this.requireNormal(transaction, principal.organizationId);
        const current = await this.loadForStudent(transaction, principal, applicationId);
        if (current === null) return this.notFoundFailure();
        await requireUnsettledCourse(transaction, principal.organizationId, current.classSectionId);
        if (current.version !== expectedVersion) return this.versionFailure();
        if (current.status !== 'DRAFT' && current.status !== 'SUPPLEMENT_REQUIRED')
          return this.transitionFailure();
        if (
          (current.applicationType === 'PHYSICAL_TEST' ||
            current.applicationType === 'EXERCISE_CHECK_IN') &&
          current.media.length === 0
        ) {
          return this.idempotency.failure(
            new ApplicationError('EXEMPTION_APPLICATION_MEDIA_INVALID', 422),
          );
        }
        const mediaFailure = await this.validateMedia(
          transaction,
          current.organizationId,
          current.studentId,
          current.enrollmentId,
          current.media.map(({ mediaId }) => mediaId),
          true,
        );
        if (mediaFailure !== null) return this.idempotency.failure(mediaFailure);
        const now = this.clock.now();
        for (const item of current.media)
          await transaction.$executeRaw`INSERT INTO v81_application_materials(application_id,media_id,organization_id,accepted_at)
          VALUES(${current.id}::uuid,${item.mediaId}::uuid,${current.organizationId}::uuid,${now}) ON CONFLICT(application_id,media_id) DO NOTHING`;
        const updated = await transaction.exemptionApplication.update({
          where: { id: current.id },
          data: {
            status: 'SUBMITTED',
            submittedAt: now,
            decidedAt: null,
            updatedAt: now,
            version: { increment: 1 },
          },
        });
        await this.appendEvent(
          transaction,
          principal,
          updated,
          'SUBMITTED',
          current.status,
          'SUBMITTED',
          facts,
        );
        await this.appendAuditAndOutbox(
          transaction,
          principal,
          updated,
          current.status,
          'SUBMITTED',
          facts,
        );
        return this.idempotency.success(
          this.project(await this.load(transaction, updated.id, updated.organizationId)),
          this.references(principal, updated.id),
        );
      },
    );
  }

  async review(
    principal: AuthenticatedPrincipal,
    applicationId: string,
    input: ReviewExemptionApplicationRequestDto,
    facts: MutationFacts,
  ): Promise<ExemptionApplicationProjection> {
    if (principal.role !== 'TEACHER')
      throw new ApplicationError('PERMISSION_EXEMPTION_REVIEW_SCOPE_DENIED', 403);
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'reviewExemptionApplication',
        scope: `application:${applicationId}`,
        key: facts.idempotencyKey,
        request: { applicationId, ...input },
        requestId: facts.requestId,
      },
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
        const policy = await transaction.systemPolicy.findUnique({
          where: { organizationId: principal.organizationId },
        });
        if (policy?.systemMode !== 'NORMAL') throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
        const current = await transaction.exemptionApplication.findFirst({
          where: { id: applicationId, organizationId: principal.organizationId },
          include: applicationInclude,
        });
        if (current === null) return this.notFoundFailure();
        if (current.classSection.teacher.userId !== principal.userId) {
          return this.idempotency.failure(
            new ApplicationError('PERMISSION_EXEMPTION_REVIEW_SCOPE_DENIED', 403),
          );
        }
        if (current.version !== input.expectedVersion) return this.versionFailure();
        if (current.status !== 'SUBMITTED') return this.transitionFailure();
        await requireUnsettledCourse(transaction, principal.organizationId, current.classSectionId);
        const teacher = await transaction.teacherProfile.findUnique({
          where: { userId: principal.userId },
        });
        if (teacher?.organizationId !== principal.organizationId) {
          return this.idempotency.failure(
            new ApplicationError('PERMISSION_EXEMPTION_REVIEW_SCOPE_DENIED', 403),
          );
        }
        const previous = await transaction.exemptionReviewRecord.findFirst({
          where: { applicationId: current.id, organizationId: principal.organizationId },
          orderBy: { reviewVersion: 'desc' },
        });
        const nextStatus =
          input.decision === 'APPROVE'
            ? 'APPROVED'
            : input.decision === 'REJECT'
              ? 'REJECTED'
              : 'SUPPLEMENT_REQUIRED';
        const now = this.clock.now();
        if (current.applicationType === 'EXERCISE_CHECK_IN' && input.decision === 'APPROVE') {
          await approveCertificationCredit(transaction, {
            applicationId: current.id,
            enrollmentId: current.enrollmentId,
            organizationId: current.organizationId,
            actorId: principal.userId,
            requestId: facts.requestId,
            eventId: this.ids.next(),
            version: current.version + 1,
            courseMinutes: input.courseMinutes,
            generalMinutes: input.generalMinutes,
            reason: input.publicComment,
            now,
          });
        } else if (input.courseMinutes !== undefined || input.generalMinutes !== undefined) {
          throw new ApplicationError('VALIDATION_FAILED', 422, {
            reason: 'ALLOCATION_ONLY_FOR_CERTIFICATION_APPROVAL',
          });
        }
        await transaction.exemptionReviewRecord.create({
          data: {
            id: this.ids.next(),
            organizationId: principal.organizationId,
            applicationId: current.id,
            reviewVersion: (previous?.reviewVersion ?? 0) + 1,
            previousReviewId: previous?.id ?? null,
            teacherId: teacher.id,
            decision: input.decision,
            publicComment: input.publicComment,
            internalNote: input.internalNote ?? null,
            requestId: facts.requestId,
            reviewedAt: now,
          },
        });
        const updated = await transaction.exemptionApplication.update({
          where: { id: current.id },
          data: {
            status: nextStatus,
            publicComment: input.publicComment,
            decidedAt: nextStatus === 'APPROVED' || nextStatus === 'REJECTED' ? now : null,
            updatedAt: now,
            version: { increment: 1 },
          },
        });
        await this.appendEvent(
          transaction,
          principal,
          updated,
          'REVIEWED',
          current.status,
          nextStatus,
          facts,
        );
        await this.appendAuditAndOutbox(
          transaction,
          principal,
          updated,
          current.status,
          nextStatus,
          facts,
        );
        const preference = await transaction.userPreference.findUnique({
          where: { userId: current.student.userId },
        });
        const title =
          preference?.locale === 'en' ? 'Application decision updated' : '申请审核结果已更新';
        await transaction.notification.create({
          data: {
            id: this.ids.next(),
            organizationId: principal.organizationId,
            recipientUserId: current.student.userId,
            notificationType:
              current.applicationType === 'EXERCISE_CHECK_IN'
                ? 'ACTIVITY_CERTIFICATION_RESULT'
                : 'EXEMPTION_APPLICATION_RESULT',
            title,
            body: input.publicComment,
            targetType: 'EXEMPTION_APPLICATION',
            targetId: current.id,
            createdAt: now,
          },
        });
        return this.idempotency.success(
          this.project(await this.load(transaction, updated.id, updated.organizationId)),
          this.references(principal, updated.id),
        );
      },
    );
  }

  private async requireNormal(transaction: Prisma.TransactionClient, organizationId: string) {
    await transaction.$queryRaw`SELECT id FROM organizations WHERE id=${organizationId}::uuid FOR NO KEY UPDATE`;
    const policy = await transaction.systemPolicy.findUnique({ where: { organizationId } });
    if (policy?.systemMode !== 'NORMAL') throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
  }

  private roleScope(principal: AuthenticatedPrincipal): Prisma.ExemptionApplicationWhereInput {
    if (principal.role === 'STUDENT') return { student: { userId: principal.userId } };
    if (principal.role === 'TEACHER')
      return { classSection: { teacher: { userId: principal.userId } } };
    return {};
  }

  private requireStudent(principal: AuthenticatedPrincipal): void {
    if (principal.role !== 'STUDENT')
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
  }

  private loadForStudent(
    transaction: Prisma.TransactionClient,
    principal: AuthenticatedPrincipal,
    applicationId: string,
  ): Promise<ApplicationRow | null> {
    return transaction.exemptionApplication.findFirst({
      where: {
        id: applicationId,
        organizationId: principal.organizationId,
        student: { userId: principal.userId },
      },
      include: applicationInclude,
    });
  }

  private async load(
    transaction: Prisma.TransactionClient,
    applicationId: string,
    organizationId: string,
  ): Promise<ApplicationRow> {
    const row = await transaction.exemptionApplication.findFirst({
      where: { id: applicationId, organizationId },
      include: applicationInclude,
    });
    if (row === null)
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'EXEMPTION_APPLICATION_PROJECTION_REQUIRED',
      });
    return row;
  }

  private async validateMedia(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    studentId: string,
    enrollmentId: string,
    mediaIds: readonly string[],
    requireAvailable: boolean,
  ): Promise<ApplicationError | null> {
    if (new Set(mediaIds).size !== mediaIds.length || mediaIds.length > 3)
      return new ApplicationError('EXEMPTION_APPLICATION_MEDIA_INVALID', 422);
    if (mediaIds.length === 0) return null;
    const media = await transaction.mediaEvidence.findMany({
      where: {
        id: { in: [...mediaIds] },
        organizationId,
        ownerStudentId: studentId,
        enrollmentId,
        businessPurpose: 'EXEMPTION_APPLICATION',
      },
      select: {
        id: true,
        uploadStatus: true,
        mediaType: true,
        declaredMimeType: true,
        declaredFileSizeBytes: true,
        verifiedMimeType: true,
        verifiedFileSizeBytes: true,
        verifiedContentSha256: true,
      },
    });
    if (
      media.length !== mediaIds.length ||
      media.some(
        (item) =>
          item.mediaType !== 'IMAGE' ||
          !['image/jpeg', 'image/png', 'image/webp'].includes(item.declaredMimeType) ||
          item.declaredFileSizeBytes <= 0n ||
          item.declaredFileSizeBytes > 10485760n ||
          (requireAvailable
            ? item.uploadStatus !== 'AVAILABLE' ||
              !item.verifiedMimeType ||
              !['image/jpeg', 'image/png', 'image/webp'].includes(item.verifiedMimeType) ||
              !item.verifiedFileSizeBytes ||
              item.verifiedFileSizeBytes > 10485760n ||
              !item.verifiedContentSha256
            : !['UPLOADED', 'BOUND', 'PROCESSING', 'AVAILABLE'].includes(item.uploadStatus)),
      )
    ) {
      return new ApplicationError('EXEMPTION_APPLICATION_MEDIA_INVALID', 422);
    }
    return null;
  }

  private async replaceMedia(
    transaction: Prisma.TransactionClient,
    application: { id: string; organizationId: string },
    mediaIds: readonly string[],
    now: Date,
  ): Promise<void> {
    const accepted = await transaction.$queryRaw<
      { media_id: string }[]
    >`SELECT media_id FROM v81_application_materials WHERE application_id=${application.id}::uuid ORDER BY accepted_at,media_id`;
    const cumulative = [...new Set([...accepted.map((item) => item.media_id), ...mediaIds])];
    if (cumulative.length > 3)
      throw new ApplicationError('EXEMPTION_APPLICATION_MEDIA_INVALID', 422, {
        reason: 'APPLICATION_LIFETIME_IMAGE_LIMIT',
      });
    await transaction.exemptionApplicationMedia.deleteMany({
      where: { applicationId: application.id, organizationId: application.organizationId },
    });
    if (cumulative.length > 0) {
      await transaction.exemptionApplicationMedia.createMany({
        data: cumulative.map((mediaId, position) => ({
          organizationId: application.organizationId,
          applicationId: application.id,
          mediaId,
          position,
          createdAt: now,
        })),
      });
    }
  }

  private async appendEvent(
    transaction: Prisma.TransactionClient,
    principal: AuthenticatedPrincipal,
    application: { id: string; organizationId: string; version: number },
    eventType: string,
    fromStatus: string | null,
    toStatus: string,
    facts: MutationFacts,
  ): Promise<void> {
    await transaction.exemptionApplicationEvent.create({
      data: {
        id: this.ids.next(),
        organizationId: application.organizationId,
        applicationId: application.id,
        eventType,
        fromStatus,
        toStatus,
        actorUserId: principal.userId,
        authSessionId: principal.sessionId,
        requestId: facts.requestId,
        idempotencyKeyReference:
          facts.idempotencyKey === undefined
            ? null
            : this.digest.digest('idempotency-key-reference', facts.idempotencyKey),
        eventVersion: application.version,
        occurredAt: this.clock.now(),
      },
    });
  }

  private async appendAuditAndOutbox(
    transaction: Prisma.TransactionClient,
    principal: AuthenticatedPrincipal,
    application: { id: string; organizationId: string; classSectionId: string; version: number },
    previousStatus: string | null,
    nextStatus: string,
    facts: MutationFacts,
  ): Promise<void> {
    await this.audit.append(transaction, {
      organizationId: application.organizationId,
      actorUserId: principal.userId,
      actorRoleSnapshot: principal.role,
      permissionId: principal.role === 'TEACHER' ? 'EXEMPTION-REVIEW' : 'EXEMPTION-WRITE',
      actionType: 'EXEMPTION_APPLICATION_CHANGED',
      targetType: 'EXEMPTION_APPLICATION',
      targetId: application.id,
      requestId: facts.requestId,
      outcome: 'SUCCEEDED',
      safeMetadata: { previousStatus, nextStatus, classSectionId: application.classSectionId },
    });
    await this.outbox.append(transaction, {
      organizationId: application.organizationId,
      aggregateType: 'EXEMPTION_APPLICATION',
      aggregateId: application.id,
      eventType: 'EXEMPTION_APPLICATION_CHANGED',
      eventVersion: application.version,
      payload: {
        requestId: facts.requestId,
        applicationId: application.id,
        previousStatus,
        nextStatus,
      },
    });
  }

  private project(row: ApplicationReadRow): ExemptionApplicationProjection {
    return {
      id: row.id,
      studentId: row.studentId,
      enrollmentId: row.enrollmentId,
      classSectionId: row.classSectionId,
      applicationType: row.applicationType,
      reason: row.reason,
      mediaIds: row.media.map(({ mediaId }) => mediaId),
      status: row.status,
      publicComment: row.publicComment,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      version: row.version,
    };
  }

  private projectStructured(row: ApplicationReadRow): StructuredExemptionApplicationProjection {
    return {
      ...this.project(row),
      applicationSubtype: row.applicationSubtype,
      organizationName: row.organizationName,
    };
  }

  private hasValidApplicationDetails(
    applicationType: string,
    applicationSubtype: string | undefined,
    organizationName: string | null | undefined,
  ): boolean {
    if (applicationSubtype === undefined && organizationName === undefined) return false;
    if (applicationSubtype === undefined || organizationName === undefined) return false;
    if (applicationType === 'PHYSICAL_TEST') {
      return (
        (applicationSubtype === 'RUN_800M' || applicationSubtype === 'RUN_1000M') &&
        organizationName === null
      );
    }
    if (applicationType === 'EXERCISE_CHECK_IN') {
      return (
        (applicationSubtype === 'SCHOOL_TEAM' || applicationSubtype === 'STUDENT_CLUB') &&
        typeof organizationName === 'string' &&
        organizationName.length >= 1 &&
        organizationName.length <= 128
      );
    }
    return applicationType === 'SPECIAL_CIRCUMSTANCE' &&
      applicationSubtype === 'SPECIAL_CIRCUMSTANCE'
      ? organizationName === null
      : false;
  }

  private applicationDetailsFailure(): ApplicationError {
    return new ApplicationError('VALIDATION_FAILED', 422, {
      fieldErrors: [
        {
          field: 'applicationSubtype',
          code: 'INVALID',
          i18nKey: 'error.validation.failed',
          params: {},
        },
      ],
    });
  }

  private references(
    principal: AuthenticatedPrincipal,
    applicationId: string,
  ): {
    principalId: string;
    authSessionId: string;
    resourceType: string;
    resourceId: string;
  } {
    return {
      principalId: principal.userId,
      authSessionId: principal.sessionId,
      resourceType: 'EXEMPTION_APPLICATION',
      resourceId: applicationId,
    };
  }

  private notFoundFailure(): IdempotentFailure {
    return this.idempotency.failure(new ApplicationError('EXEMPTION_APPLICATION_NOT_FOUND', 404));
  }

  private versionFailure(): IdempotentFailure {
    return this.idempotency.failure(new ApplicationError('CONFLICT_VERSION_MISMATCH', 409));
  }

  private transitionFailure(): IdempotentFailure {
    return this.idempotency.failure(
      new ApplicationError('EXEMPTION_APPLICATION_TRANSITION_NOT_ALLOWED', 409),
    );
  }
}
