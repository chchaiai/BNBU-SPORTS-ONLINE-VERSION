import { Injectable } from '@nestjs/common';
import { recomputeCredits } from '../../v8/v81-credit-store.js';
import { requireUnsettledCourse } from '../../v8/v81-settlement-write-guard.js';

import { AuditService } from '../../../common/audit/audit.service.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import { pagedResult, type PagedResult } from '../../../common/http/envelope.interceptor.js';
import type { AuthenticatedPrincipal, UserRole } from '../../../common/http/request-context.js';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { OutboxService } from '../../../common/outbox/outbox.service.js';
import type {
  EnrollmentCollectionScope,
  EnrollmentPolicyContext,
} from '../../../common/policy/enrollment-policy-resolver.js';
import { ScopedCursorService } from '../../../common/pagination/scoped-cursor.service.js';
import { SecureDigestService } from '../../../common/security/secure-digest.service.js';
import { Clock } from '../../../common/time/clock.js';
import { IdGenerator } from '../../../common/time/id-generator.js';
import { CourseInviteRepository } from '../../course-invites/domain/course-invite.repository.js';
import type { EnrollmentStatus } from '../domain/enrollment-status.js';
import { EnrollmentEntity } from '../domain/enrollment.js';
import { EnrollmentRepository, type EnrollmentView } from '../domain/enrollment.repository.js';
import type {
  EnrollmentListQueryDto,
  EnrollmentTransitionRequestDto,
  ManualEnrollmentRequestDto,
} from '../interface/http/enrollments.dto.js';
import { projectEnrollment, type EnrollmentProjection } from './enrollment-projection.js';

interface MutationFacts {
  requestId: string;
  idempotencyKey: string | undefined;
}

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly repository: EnrollmentRepository,
    private readonly classSections: CourseInviteRepository,
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
    scope: EnrollmentCollectionScope,
    input: EnrollmentListQueryDto,
  ): Promise<PagedResult<EnrollmentProjection>> {
    if (scope.role !== principal.role) this.scopeDenied();
    if (principal.role === 'STUDENT' && input.studentId !== undefined) this.scopeDenied();
    const sortDirection = input.sort === 'joinedAt' ? 'asc' : 'desc';
    const filters = {
      classSectionId: input.classSectionId ?? null,
      studentId: principal.role === 'STUDENT' ? null : (input.studentId ?? null),
      semesterId: input.semesterId ?? null,
      status: input.status ?? null,
    };
    const binding = {
      resource: 'ENROLLMENT' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters,
      sort: sortDirection === 'asc' ? 'joinedAt' : '-joinedAt',
      limit: input.limit,
    };
    const page = await this.repository.list({
      organizationId: principal.organizationId,
      role: principal.role,
      ...(scope.studentId === undefined ? {} : { studentId: scope.studentId }),
      ...(scope.teacherUserId === undefined ? {} : { teacherUserId: scope.teacherUserId }),
      ...(principal.role === 'STUDENT' || input.studentId === undefined
        ? {}
        : { studentId: input.studentId }),
      ...(input.classSectionId === undefined ? {} : { classSectionId: input.classSectionId }),
      ...(input.semesterId === undefined ? {} : { semesterId: input.semesterId }),
      ...(input.status === undefined ? {} : { status: input.status }),
      sortDirection,
      position: this.cursors.decode(input.cursor, binding),
      limit: input.limit,
    });
    const last = page.items.at(-1)?.enrollment;
    return pagedResult(
      page.items.map(({ enrollment }) => this.projectForRole(enrollment, principal.role)),
      {
        nextCursor:
          page.hasMore && last !== undefined
            ? this.cursors.encode(binding, {
                value: last.joinedAt.toISOString(),
                id: last.id,
              })
            : null,
        hasMore: page.hasMore,
        limit: input.limit,
      },
    );
  }

  async get(
    principal: AuthenticatedPrincipal,
    context: EnrollmentPolicyContext,
  ): Promise<EnrollmentProjection> {
    const view = await this.requiredView(principal.organizationId, context.enrollmentId);
    this.assertContext(view, context, principal);
    return this.projectForRole(view.enrollment, principal.role);
  }

  async manuallyEnroll(
    principal: AuthenticatedPrincipal,
    classSectionId: string,
    input: ManualEnrollmentRequestDto,
    facts: MutationFacts,
  ): Promise<EnrollmentProjection> {
    const reason = input.reason.trim();
    const reference = await this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'manuallyEnrollStudent',
        scope: `${principal.organizationId}:${classSectionId}:${input.studentId}`,
        key: facts.idempotencyKey,
        request: { classSectionId, studentId: input.studentId, reason },
        requestId: facts.requestId,
      },
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
        const now = this.clock.now();
        const section = await this.classSections.lockClassSection(
          principal.organizationId,
          classSectionId,
          transaction,
        );
        if (section === null) {
          return this.idempotency.failure(
            new ApplicationError('COURSE_CLASS_SECTION_NOT_FOUND', 404),
          );
        }
        if (section.teacher.userId !== principal.userId) {
          return this.idempotency.failure(
            new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404),
          );
        }
        await requireUnsettledCourse(transaction, principal.organizationId, classSectionId);
        this.assertWritable(section, now, false);
        const student = await this.repository.findStudentById(
          principal.organizationId,
          input.studentId,
          transaction,
        );
        if (student?.status !== 'ACTIVE' || student.deletedAt !== null) {
          return this.idempotency.failure(new ApplicationError('USER_NOT_FOUND', 404));
        }
        const permanent = await this.repository.findForClassStudent(
          classSectionId,
          student.id,
          transaction,
        );
        if (permanent !== null) {
          return this.idempotency.failure(
            permanent.status === 'ACTIVE'
              ? new ApplicationError('ENROLLMENT_ALREADY_ACTIVE', 409)
              : new ApplicationError('ENROLLMENT_REJOIN_DISABLED', 409),
          );
        }
        const semesterActive = await this.repository.findActiveForSemesterStudent(
          principal.organizationId,
          section.semesterId,
          student.id,
          transaction,
        );
        if (semesterActive !== null) {
          return this.idempotency.failure(
            new ApplicationError('ENROLLMENT_SEMESTER_CONFLICT', 409),
          );
        }
        const enrollment = EnrollmentEntity.create({
          id: this.ids.next(),
          organizationId: principal.organizationId,
          semesterId: section.semesterId,
          classSectionId,
          studentId: student.id,
          source: 'MANUAL',
          sourceReferenceId: null,
          joinedAt: now,
          createdBy: principal.userId,
          updatedBy: principal.userId,
          createdAt: now,
          updatedAt: now,
        }).snapshot();
        await this.repository.create(enrollment, transaction);
        await this.appendEvent(transaction, enrollment, {
          fromStatus: null,
          source: 'MANUAL_ENROLLMENT',
          reason,
          actorUserId: principal.userId,
          actorRole: principal.role,
          requestId: facts.requestId,
          idempotencyKey: facts.idempotencyKey,
          occurredAt: now,
        });
        await this.recordCreated(transaction, enrollment, principal, facts, 'MANUAL');
        return this.idempotency.success(
          { enrollmentId: enrollment.id },
          {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'ENROLLMENT',
            resourceId: enrollment.id,
          },
        );
      },
    );
    return projectEnrollment(
      (await this.requiredView(principal.organizationId, reference.enrollmentId)).enrollment,
    );
  }

  async remove(
    principal: AuthenticatedPrincipal,
    context: EnrollmentPolicyContext,
    input: EnrollmentTransitionRequestDto,
    facts: MutationFacts,
  ): Promise<EnrollmentProjection> {
    return this.transition(principal, context, input, facts, 'REMOVED');
  }

  async restore(
    principal: AuthenticatedPrincipal,
    context: EnrollmentPolicyContext,
    input: EnrollmentTransitionRequestDto,
    facts: MutationFacts,
  ): Promise<EnrollmentProjection> {
    return this.transition(principal, context, input, facts, 'ACTIVE');
  }

  withdraw(principal: AuthenticatedPrincipal, context: EnrollmentPolicyContext): never {
    if (
      principal.role !== 'STUDENT' ||
      context.studentUserId !== principal.userId ||
      context.organizationId !== principal.organizationId
    ) {
      this.scopeDenied();
    }
    throw new ApplicationError('ENROLLMENT_WITHDRAWAL_DISABLED', 409);
  }

  private async transition(
    principal: AuthenticatedPrincipal,
    context: EnrollmentPolicyContext,
    input: EnrollmentTransitionRequestDto,
    facts: MutationFacts,
    target: 'ACTIVE' | 'REMOVED',
  ): Promise<EnrollmentProjection> {
    const reason = input.reason.trim();
    const operationId = target === 'ACTIVE' ? 'restoreEnrollment' : 'removeEnrollment';
    const reference = await this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId,
        scope: `${principal.organizationId}:${context.enrollmentId}`,
        key: facts.idempotencyKey,
        request: {
          enrollmentId: context.enrollmentId,
          reason,
          expectedVersion: input.expectedVersion,
        },
        requestId: facts.requestId,
      },
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
        const current = await this.repository.lockViewById(
          principal.organizationId,
          context.enrollmentId,
          transaction,
        );
        if (current === null) {
          return this.idempotency.failure(new ApplicationError('ENROLLMENT_NOT_FOUND', 404));
        }
        if (current.classSection.teacherUserId !== principal.userId) {
          return this.idempotency.failure(
            new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404),
          );
        }
        await requireUnsettledCourse(transaction, principal.organizationId, current.enrollment.classSectionId);
        if (current.enrollment.version !== input.expectedVersion) {
          return this.idempotency.failure(
            new ApplicationError('CONFLICT_VERSION_MISMATCH', 409, {
              expectedVersion: input.expectedVersion,
              currentVersion: current.enrollment.version,
            }),
          );
        }
        const now = this.clock.now();
        const entity = EnrollmentEntity.restore(current.enrollment);
        const previousStatus = current.enrollment.status;
        if (target === 'REMOVED') {
          if (previousStatus !== 'ACTIVE') {
            return this.idempotency.failure(new ApplicationError('ENROLLMENT_NOT_ACTIVE', 409));
          }
          entity.remove(reason, principal.userId, now);
        } else {
          if (previousStatus !== 'REMOVED' && previousStatus !== 'WITHDRAWN') {
            return this.idempotency.failure(
              new ApplicationError('ENROLLMENT_TRANSITION_NOT_ALLOWED', 409),
            );
          }
          const section = await this.classSections.lockClassSection(
            principal.organizationId,
            current.enrollment.classSectionId,
            transaction,
          );
          if (section?.teacher.userId !== principal.userId) {
            return this.idempotency.failure(
              new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404),
            );
          }
          this.assertWritable(section, now, false, true);
          const active = await this.repository.findActiveForSemesterStudent(
            principal.organizationId,
            current.enrollment.semesterId,
            current.enrollment.studentId,
            transaction,
          );
          if (active !== null && active.id !== current.enrollment.id) {
            return this.idempotency.failure(
              new ApplicationError('ENROLLMENT_SEMESTER_CONFLICT', 409),
            );
          }
          entity.activate(reason, principal.userId, now);
        }
        const next = entity.snapshot();
        const changed = await this.repository.update(next, input.expectedVersion, transaction);
        if (changed === null) {
          return this.idempotency.failure(new ApplicationError('CONFLICT_VERSION_MISMATCH', 409));
        }
        const published = await transaction.$queryRaw<{ id: string }[]>`SELECT class_section_id AS id FROM v81_course_rules WHERE class_section_id=${changed.classSectionId}::uuid AND published_at IS NOT NULL`;
        if (published.length) await recomputeCredits(transaction, changed.id, now);
        await this.appendEvent(transaction, changed, {
          fromStatus: previousStatus,
          source: target === 'ACTIVE' ? 'TEACHER_RESTORE' : 'TEACHER_REMOVAL',
          reason,
          actorUserId: principal.userId,
          actorRole: principal.role,
          requestId: facts.requestId,
          idempotencyKey: facts.idempotencyKey,
          occurredAt: now,
        });
        await this.audit.append(transaction, {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          actorRoleSnapshot: principal.role,
          permissionId: target === 'ACTIVE' ? 'ENROLLMENT-RESTORE' : 'ENROLLMENT-REMOVE',
          actionType: 'ENROLLMENT_STATUS_CHANGED',
          targetType: 'ENROLLMENT',
          targetId: changed.id,
          requestId: facts.requestId,
          idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
          outcome: 'SUCCEEDED',
          safeMetadata: {
            classSectionId: changed.classSectionId,
            previousStatus,
            nextStatus: changed.status,
            reasonCode: 'TEACHER_REQUEST',
          },
        });
        await this.outbox.append(transaction, {
          organizationId: principal.organizationId,
          aggregateType: 'ENROLLMENT',
          aggregateId: changed.id,
          eventType: target === 'ACTIVE' ? 'ENROLLMENT_RESTORED_V1' : 'ENROLLMENT_REMOVED_V1',
          eventVersion: changed.version,
          payload: {
            enrollmentId: changed.id,
            classSectionId: changed.classSectionId,
            requestId: facts.requestId,
          },
        });
        return this.idempotency.success(
          { enrollmentId: changed.id },
          {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'ENROLLMENT',
            resourceId: changed.id,
          },
        );
      },
    );
    return projectEnrollment(
      (await this.requiredView(principal.organizationId, reference.enrollmentId)).enrollment,
    );
  }

  private async recordCreated(
    transaction: Parameters<AuditService['append']>[0],
    enrollment: ReturnType<EnrollmentEntity['snapshot']>,
    principal: AuthenticatedPrincipal,
    facts: MutationFacts,
    source: 'MANUAL' | 'QR_CODE',
  ): Promise<void> {
    await this.audit.append(transaction, {
      organizationId: enrollment.organizationId,
      actorUserId: principal.userId,
      actorRoleSnapshot: principal.role,
      permissionId: source === 'MANUAL' ? 'ENROLLMENT-MANUAL-ADD' : 'ENROLLMENT-JOIN',
      actionType: 'ENROLLMENT_CREATED',
      targetType: 'ENROLLMENT',
      targetId: enrollment.id,
      requestId: facts.requestId,
      idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
      outcome: 'SUCCEEDED',
      safeMetadata: { classSectionId: enrollment.classSectionId, source },
    });
    await this.outbox.append(transaction, {
      organizationId: enrollment.organizationId,
      aggregateType: 'ENROLLMENT',
      aggregateId: enrollment.id,
      eventType: 'ENROLLMENT_CREATED_V1',
      eventVersion: 1,
      payload: {
        enrollmentId: enrollment.id,
        classSectionId: enrollment.classSectionId,
        source,
        requestId: facts.requestId,
      },
    });
  }

  private async appendEvent(
    transaction: Parameters<AuditService['append']>[0],
    enrollment: ReturnType<EnrollmentEntity['snapshot']>,
    input: {
      fromStatus: EnrollmentStatus | null;
      source: 'QR_JOIN' | 'MANUAL_ENROLLMENT' | 'TEACHER_REMOVAL' | 'TEACHER_RESTORE';
      reason: string | null;
      actorUserId: string;
      actorRole: UserRole;
      requestId: string;
      idempotencyKey: string | undefined;
      occurredAt: Date;
    },
  ): Promise<void> {
    await this.repository.appendEvent(
      {
        id: this.ids.next(),
        organizationId: enrollment.organizationId,
        enrollmentId: enrollment.id,
        fromStatus: input.fromStatus,
        toStatus: enrollment.status,
        source: input.source,
        reason: input.reason,
        actorUserId: input.actorUserId,
        actorRoleSnapshot: input.actorRole,
        requestId: input.requestId,
        idempotencyKeyReference: this.keyReference(input.idempotencyKey),
        occurredAt: input.occurredAt,
        enrollmentVersion: enrollment.version,
      },
      transaction,
    );
  }

  private assertWritable(
    section: {
      status: string;
      isEnrollmentOpen: boolean;
      course: { status: string; deletedAt: Date | null };
      semester: { status: string; endDate: Date };
      teacher: { status?: string; deletedAt?: Date | null };
    },
    now: Date,
    requireEnrollmentOpen: boolean,
    requireActive = false,
  ): void {
    if (
      (requireActive
        ? section.status !== 'ACTIVE'
        : !['ACTIVE', 'UPCOMING'].includes(section.status)) ||
      (requireEnrollmentOpen && !section.isEnrollmentOpen) ||
      section.course.status !== 'ACTIVE' ||
      section.course.deletedAt !== null ||
      section.semester.status !== 'CURRENT' ||
      section.teacher.status !== 'ACTIVE' ||
      section.teacher.deletedAt !== null ||
      now > new Date(section.semester.endDate.getTime() + 86_400_000 - 1)
    ) {
      throw new ApplicationError('COURSE_CLASS_SECTION_NOT_JOINABLE', 409);
    }
  }

  private async requiredView(
    organizationId: string,
    enrollmentId: string,
  ): Promise<EnrollmentView> {
    const view = await this.repository.findViewById(organizationId, enrollmentId);
    if (view === null) throw new ApplicationError('ENROLLMENT_NOT_FOUND', 404);
    return view;
  }

  private assertContext(
    view: EnrollmentView,
    context: EnrollmentPolicyContext,
    principal: AuthenticatedPrincipal,
  ): void {
    if (
      view.enrollment.id !== context.enrollmentId ||
      view.enrollment.organizationId !== principal.organizationId ||
      (principal.role === 'STUDENT' && view.student.userId !== principal.userId) ||
      (principal.role === 'TEACHER' && view.classSection.teacherUserId !== principal.userId)
    ) {
      this.scopeDenied();
    }
  }

  private projectForRole(
    enrollment: EnrollmentView['enrollment'],
    role: UserRole,
  ): EnrollmentProjection {
    const projection = projectEnrollment(enrollment);
    return role === 'STUDENT' ? { ...projection, endReason: null } : projection;
  }

  private keyReference(key: string | undefined): string | null {
    return key === undefined ? null : this.digest.digest('idempotency-key-reference', key);
  }

  private scopeDenied(): never {
    throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
  }
}
