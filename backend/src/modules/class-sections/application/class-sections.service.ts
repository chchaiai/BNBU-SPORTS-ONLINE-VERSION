import { endCourseMemberships } from '../../enrollments/application/course-closure-memberships.js';
import { Injectable } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import { pagedResult, type PagedResult } from '../../../common/http/envelope.interceptor.js';
import type { AuthenticatedPrincipal } from '../../../common/http/request-context.js';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { OutboxService } from '../../../common/outbox/outbox.service.js';
import { ScopedCursorService } from '../../../common/pagination/scoped-cursor.service.js';
import { SecureDigestService } from '../../../common/security/secure-digest.service.js';
import { Clock } from '../../../common/time/clock.js';
import { IdGenerator } from '../../../common/time/id-generator.js';
import { ClassSectionDomainError } from '../domain/class-section-domain.error.js';
import {
  ClassSectionRepository,
  type ClassSectionSortField,
  type TeacherReference,
} from '../domain/class-section.repository.js';
import {
  ClassSectionEntity,
  type ClassSectionState,
  type ClassSectionUpdate,
} from '../domain/class-section.js';
import type {
  ClassSectionListQueryDto,
  CloseClassSectionRequestDto,
  CreateClassSectionRequestDto,
  TeacherClassSectionListQueryDto,
  UpdateClassSectionRequestDto,
} from '../interface/http/class-sections.dto.js';
import { projectClassSection, type ClassSectionProjection } from './class-section-projection.js';

interface MutationFacts {
  requestId: string;
  idempotencyKey: string | undefined;
}

interface NormalizedListInput {
  cursor?: string;
  limit: number;
  sort?: string;
  q?: string;
  courseId?: string;
  semesterId?: string;
  status?: 'UPCOMING' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
}

const SORT_FIELDS = new Set<ClassSectionSortField>([
  'classCode',
  'displayName',
  'status',
  'createdAt',
  'updatedAt',
]);

@Injectable()
export class ClassSectionsService {
  constructor(
    private readonly repository: ClassSectionRepository,
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
    input: ClassSectionListQueryDto,
  ): Promise<PagedResult<ClassSectionProjection>> {
    const teacher =
      principal.role === 'TEACHER' ? await this.requirePrincipalTeacher(principal) : null;
    return this.listScoped(
      principal,
      input,
      teacher?.id,
      principal.role === 'STUDENT' ? principal.userId : undefined,
    );
  }

  async listForTeacher(
    principal: AuthenticatedPrincipal,
    teacherId: string,
    input: TeacherClassSectionListQueryDto,
  ): Promise<PagedResult<ClassSectionProjection>> {
    const target = await this.repository.findTeacherById(principal.organizationId, teacherId);
    if (target?.deletedAt !== null) {
      throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    }
    if (principal.role === 'TEACHER') {
      const current = await this.requirePrincipalTeacher(principal);
      if (current.id !== target.id) {
        throw new ApplicationError('PERMISSION_COURSE_SCOPE_DENIED', 403);
      }
    }
    return this.listScoped(
      principal,
      {
        limit: input.limit,
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        ...(input.sort === undefined ? {} : { sort: input.sort }),
        ...(input.semesterId === undefined ? {} : { semesterId: input.semesterId }),
      },
      target.id,
    );
  }

  async get(
    principal: AuthenticatedPrincipal,
    classSectionId: string,
  ): Promise<ClassSectionProjection> {
    const section =
      principal.role === 'STUDENT'
        ? await this.repository.findStudentVisibleById(
            principal.organizationId,
            classSectionId,
            principal.userId,
          )
        : await this.repository.findById(principal.organizationId, classSectionId);
    if (section === null) {
      throw new ApplicationError('COURSE_CLASS_SECTION_NOT_FOUND', 404);
    }
    if (principal.role === 'TEACHER') {
      const teacher = await this.requirePrincipalTeacher(principal);
      if (section.teacherId !== teacher.id) {
        throw new ApplicationError('COURSE_CLASS_SECTION_NOT_FOUND', 404);
      }
    }
    return projectClassSection(section);
  }

  async create(
    principal: AuthenticatedPrincipal,
    input: CreateClassSectionRequestDto,
    facts: MutationFacts,
  ): Promise<ClassSectionProjection> {
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'createClassSection',
        scope: principal.organizationId,
        key: facts.idempotencyKey,
        request: input,
        requestId: facts.requestId,
      },
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
        const teacher = await this.requirePrincipalTeacher(principal, transaction);
        const course = await this.repository.findCourse(
          principal.organizationId,
          input.courseId,
          transaction,
        );
        if (course?.deletedAt !== null) {
          return this.idempotency.failure(new ApplicationError('COURSE_NOT_FOUND', 404));
        }
        if (course.status !== 'ACTIVE') {
          return this.idempotency.failure(
            new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409, {
              resource: 'COURSE',
              requiredStatus: 'ACTIVE',
            }),
          );
        }
        const semester = await this.repository.findSemester(
          principal.organizationId,
          input.semesterId,
          transaction,
        );
        if (semester === null) {
          return this.idempotency.failure(
            new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404),
          );
        }
        if (semester.status === 'ARCHIVED') {
          return this.idempotency.failure(new ApplicationError('COURSE_SEMESTER_ARCHIVED', 409));
        }
        if (semester.status !== 'CURRENT') {
          return this.idempotency.failure(
            new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409, {
              resource: 'SEMESTER', requiredStatus: 'CURRENT',
            }),
          );
        }
        const entity = this.domain(() =>
          ClassSectionEntity.create({
            id: this.ids.next(),
            organizationId: principal.organizationId,
            courseId: course.id,
            semesterId: semester.id,
            teacherId: teacher.id,
            classCode: input.classCode,
            displayName: input.displayName,
            status: 'ACTIVE',
            isEnrollmentOpen: input.isEnrollmentOpen,
            actorUserId: principal.userId,
            now: this.clock.now(),
          }),
        );
        const created = await this.repository.create(entity.snapshot(), transaction);
        await this.audit.append(transaction, {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          actorRoleSnapshot: principal.role,
          permissionId: 'CLASS-SECTION-CREATE',
          actionType: 'CLASS_SECTION_CREATED',
          targetType: 'CLASS_SECTION',
          targetId: created.id,
          requestId: facts.requestId,
          idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
          outcome: 'SUCCEEDED',
          safeMetadata: {
            changedFields: [
              'courseId',
              'semesterId',
              'teacherId',
              'classCode',
              'displayName',
              'status',
            ],
          },
        });
        await this.outbox.append(transaction, {
          organizationId: principal.organizationId,
          aggregateType: 'CLASS_SECTION',
          aggregateId: created.id,
          eventType: 'CLASS_SECTION_CREATED',
          eventVersion: created.version,
          payload: { classSectionId: created.id, requestId: facts.requestId },
        });
        return this.idempotency.success(projectClassSection(created), {
          principalId: principal.userId,
          authSessionId: principal.sessionId,
          resourceType: 'CLASS_SECTION',
          resourceId: created.id,
        });
      },
    );
  }

  async update(
    principal: AuthenticatedPrincipal,
    classSectionId: string,
    input: UpdateClassSectionRequestDto,
    facts: MutationFacts,
  ): Promise<ClassSectionProjection> {
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'updateClassSection',
        scope: `${principal.organizationId}:${classSectionId}`,
        key: facts.idempotencyKey,
        request: { classSectionId, ...input },
        requestId: facts.requestId,
      },
      async (transaction) => {
        const teacher = await this.requirePrincipalTeacher(principal, transaction);
        const section = await this.repository.findById(
          principal.organizationId,
          classSectionId,
          transaction,
        );
        if (section === null) {
          return this.idempotency.failure(
            new ApplicationError('COURSE_CLASS_SECTION_NOT_FOUND', 404),
          );
        }
        const entity = this.domain(() => ClassSectionEntity.restore(section));
        if (!this.isOwnedBy(entity, teacher.id)) {
          return this.idempotency.failure(
            new ApplicationError('PERMISSION_COURSE_SCOPE_DENIED', 403),
          );
        }
        if (section.status === 'CLOSED' || section.status === 'ARCHIVED') {
          return this.idempotency.failure(
            new ApplicationError('COURSE_CLASS_SECTION_NOT_WRITABLE', 409),
          );
        }
        if (section.version !== input.expectedVersion) {
          return this.idempotency.failure(
            this.versionMismatch(input.expectedVersion, section.version),
          );
        }
        const semester = await this.repository.findSemester(
          principal.organizationId,
          section.semesterId,
          transaction,
        );
        if (semester === null) {
          return this.idempotency.failure(
            new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
              invariant: 'CLASS_SECTION_SEMESTER_REQUIRED',
            }),
          );
        }
        if (semester.status === 'ARCHIVED') {
          return this.idempotency.failure(new ApplicationError('COURSE_SEMESTER_ARCHIVED', 409));
        }
        await transaction.$queryRaw`SELECT id FROM class_sections WHERE id=${classSectionId}::uuid AND organization_id=${principal.organizationId}::uuid FOR UPDATE`;
        const publishedRules = await transaction.$queryRaw<{ published_at: Date | null }[]>`
          SELECT published_at FROM v81_course_rules WHERE class_section_id=${classSectionId}::uuid AND organization_id=${principal.organizationId}::uuid`;
        if (
          publishedRules[0]?.published_at &&
          [
            input.checkInStartDate,
            input.checkInEndDate,
            input.excludedDates,
            input.submissionDeadlineAt,
          ].some((value) => value !== undefined)
        ) {
          return this.idempotency.failure(
            new ApplicationError('CONFLICT_STATE_TRANSITION', 409, {
              reason: 'PUBLISHED_COURSE_RULES_LOCKED',
            }),
          );
        }
        const update = this.updateInput(input);
        const changedFields = this.domain(() =>
          entity.update(
            update,
            { startDate: semester.startDate, endDate: semester.endDate },
            principal.userId,
            this.clock.now(),
          ),
        );
        const updated = await this.repository.update(
          entity.snapshot(),
          input.expectedVersion,
          input.excludedDates !== undefined,
          transaction,
        );
        if (updated === null) {
          return this.idempotency.failure(new ApplicationError('CONFLICT_VERSION_MISMATCH', 409));
        }
        await this.audit.append(transaction, {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          actorRoleSnapshot: principal.role,
          permissionId: 'CLASS-SECTION-UPDATE',
          actionType: 'CLASS_SECTION_UPDATED',
          targetType: 'CLASS_SECTION',
          targetId: classSectionId,
          requestId: facts.requestId,
          idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
          outcome: 'SUCCEEDED',
          safeMetadata: { changedFields },
        });
        await this.outbox.append(transaction, {
          organizationId: principal.organizationId,
          aggregateType: 'CLASS_SECTION',
          aggregateId: classSectionId,
          eventType: 'CLASS_SECTION_UPDATED',
          eventVersion: updated.version,
          payload: { classSectionId, changedFields, requestId: facts.requestId },
        });
        return this.idempotency.success(projectClassSection(updated), {
          principalId: principal.userId,
          authSessionId: principal.sessionId,
          resourceType: 'CLASS_SECTION',
          resourceId: classSectionId,
        });
      },
    );
  }

  async close(
    principal: AuthenticatedPrincipal,
    classSectionId: string,
    input: CloseClassSectionRequestDto,
    facts: MutationFacts,
  ): Promise<ClassSectionProjection> {
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'closeClassSection',
        scope: `${principal.organizationId}:${classSectionId}`,
        key: facts.idempotencyKey,
        request: { classSectionId, ...input },
        requestId: facts.requestId,
      },
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
        const teacher = await this.requirePrincipalTeacher(principal, transaction);
        const section = await this.repository.findById(
          principal.organizationId,
          classSectionId,
          transaction,
        );
        if (section === null) {
          return this.idempotency.failure(
            new ApplicationError('COURSE_CLASS_SECTION_NOT_FOUND', 404),
          );
        }
        const entity = this.domain(() => ClassSectionEntity.restore(section));
        if (!this.isOwnedBy(entity, teacher.id)) {
          return this.idempotency.failure(
            new ApplicationError('PERMISSION_COURSE_SCOPE_DENIED', 403),
          );
        }
        if (section.status === 'CLOSED' || section.status === 'ARCHIVED') {
          return this.idempotency.failure(
            new ApplicationError('COURSE_CLASS_SECTION_NOT_WRITABLE', 409),
          );
        }
        if (section.version !== input.expectedVersion) {
          return this.idempotency.failure(
            this.versionMismatch(input.expectedVersion, section.version),
          );
        }
        const semester = await this.repository.findSemester(
          principal.organizationId,
          section.semesterId,
          transaction,
        );
        if (semester?.status === 'ARCHIVED') {
          return this.idempotency.failure(new ApplicationError('COURSE_SEMESTER_ARCHIVED', 409));
        }
        const previousStatus = section.status;
        const changedFields = this.domain(() =>
          entity.close(input.reason, principal.userId, this.clock.now()),
        );
        const closed = await this.repository.close(
          entity.snapshot(),
          input.expectedVersion,
          transaction,
        );
        if (closed === null) {
          return this.idempotency.failure(new ApplicationError('CONFLICT_VERSION_MISMATCH', 409));
        }
        const removedMemberCount = await endCourseMemberships(transaction, closed, principal.userId, facts.requestId, this.keyReference(facts.idempotencyKey), this.ids, this.audit, this.outbox);
        await this.audit.append(transaction, {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          actorRoleSnapshot: principal.role,
          permissionId: 'CLASS-SECTION-CLOSE',
          actionType: 'CLASS_SECTION_CLOSED',
          targetType: 'CLASS_SECTION',
          targetId: classSectionId,
          requestId: facts.requestId,
          idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
          outcome: 'SUCCEEDED',
          safeMetadata: { changedFields, previousStatus, nextStatus: closed.status, removedMemberCount },
        });
        await this.outbox.append(transaction, {
          organizationId: principal.organizationId,
          aggregateType: 'CLASS_SECTION',
          aggregateId: classSectionId,
          eventType: 'CLASS_SECTION_CLOSED',
          eventVersion: closed.version,
          payload: { classSectionId, requestId: facts.requestId },
        });
        return this.idempotency.success(projectClassSection(closed), {
          principalId: principal.userId,
          authSessionId: principal.sessionId,
          resourceType: 'CLASS_SECTION',
          resourceId: classSectionId,
        });
      },
    );
  }

  private async listScoped(
    principal: AuthenticatedPrincipal,
    input: NormalizedListInput,
    teacherId: string | undefined,
    studentUserId?: string,
  ): Promise<PagedResult<ClassSectionProjection>> {
    const { field, direction, expression } = this.parseSort(input.sort);
    const search = input.q?.trim();
    const binding = {
      resource: 'CLASS_SECTION' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters: {
        teacherId: teacherId ?? null,
        courseId: input.courseId ?? null,
        semesterId: input.semesterId ?? null,
        status: input.status ?? null,
        q: search ?? null,
      },
      sort: expression,
      limit: input.limit,
    };
    const page = await this.repository.list({
      organizationId: principal.organizationId,
      ...(teacherId === undefined ? {} : { teacherId }),
      ...(input.courseId === undefined ? {} : { courseId: input.courseId }),
      ...(input.semesterId === undefined ? {} : { semesterId: input.semesterId }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(search === undefined ? {} : { search }),
      ...(studentUserId === undefined ? {} : { studentUserId }),
      sortField: field,
      sortDirection: direction,
      position: this.cursors.decode(input.cursor, binding),
      limit: input.limit,
    });
    const last = page.items.at(-1);
    return pagedResult(page.items.map(projectClassSection), {
      nextCursor:
        page.hasMore && last !== undefined
          ? this.cursors.encode(binding, { value: this.sortValue(last, field), id: last.id })
          : null,
      hasMore: page.hasMore,
      limit: input.limit,
    });
  }

  private async requirePrincipalTeacher(
    principal: AuthenticatedPrincipal,
    transaction?: object,
  ): Promise<TeacherReference> {
    const teacher = await this.repository.findTeacherByUser(
      principal.organizationId,
      principal.userId,
      transaction,
    );
    if (teacher?.status !== 'ACTIVE' || teacher.deletedAt !== null) {
      throw new ApplicationError('PERMISSION_COURSE_SCOPE_DENIED', 403);
    }
    return teacher;
  }

  private updateInput(input: UpdateClassSectionRequestDto): ClassSectionUpdate {
    return {
      ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
      ...(input.isEnrollmentOpen === undefined ? {} : { isEnrollmentOpen: input.isEnrollmentOpen }),
      ...(input.checkInWindowMode === undefined
        ? {}
        : { checkInWindowMode: input.checkInWindowMode }),
      ...(input.checkInStartDate === undefined ? {} : { checkInStartDate: input.checkInStartDate }),
      ...(input.checkInEndDate === undefined ? {} : { checkInEndDate: input.checkInEndDate }),
      ...(input.dailyStartTime === undefined ? {} : { dailyStartTime: input.dailyStartTime }),
      ...(input.dailyEndTime === undefined ? {} : { dailyEndTime: input.dailyEndTime }),
      ...(input.submissionDeadlineAt === undefined
        ? {}
        : { submissionDeadlineAt: input.submissionDeadlineAt }),
      ...(input.excludedDates === undefined ? {} : { excludedDates: input.excludedDates }),
    };
  }

  private parseSort(input: string | undefined): {
    field: ClassSectionSortField;
    direction: 'asc' | 'desc';
    expression: string;
  } {
    const expression = input?.trim() ?? '-updatedAt';
    if (expression.includes(',')) throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
    const direction = expression.startsWith('-') ? 'desc' : 'asc';
    const field = (
      direction === 'desc' ? expression.slice(1) : expression
    ) as ClassSectionSortField;
    if (!SORT_FIELDS.has(field)) {
      throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422, { field: 'sort' });
    }
    return { field, direction, expression };
  }

  private sortValue(section: ClassSectionState, field: ClassSectionSortField): string {
    const value = section[field];
    return value instanceof Date ? value.toISOString() : value;
  }

  private domain<T>(action: () => T): T {
    try {
      return action();
    } catch (error: unknown) {
      if (error instanceof ClassSectionDomainError) {
        if (error.code === 'CLASS_SECTION_NOT_WRITABLE') {
          throw new ApplicationError('COURSE_CLASS_SECTION_NOT_WRITABLE', 409);
        }
        throw new ApplicationError('VALIDATION_FAILED', 422, {
          reason: error.code,
          fieldErrors: [
            {
              field: ({ CLASS_SECTION_DATE_RANGE_INVALID: 'checkInEndDate', CLASS_SECTION_TIME_RANGE_INVALID: 'dailyEndTime', CLASS_SECTION_EXCLUDED_DATE_INVALID: 'excludedDates' } as Record<string,string>)[error.code] ?? 'classSection',
              code: error.code,
              i18nKey: 'error.validation.failed',
              params: {},
            },
          ],
        });
      }
      throw error;
    }
  }

  private isOwnedBy(entity: ClassSectionEntity, teacherId: string): boolean {
    try {
      entity.assertOwnedBy(teacherId);
      return true;
    } catch (error: unknown) {
      if (
        error instanceof ClassSectionDomainError &&
        error.code === 'CLASS_SECTION_TEACHER_SCOPE_DENIED'
      ) {
        return false;
      }
      throw error;
    }
  }

  private versionMismatch(expectedVersion: number, currentVersion: number): ApplicationError {
    return new ApplicationError('CONFLICT_VERSION_MISMATCH', 409, {
      expectedVersion,
      currentVersion,
    });
  }

  private keyReference(key: string | undefined): string | null {
    return key === undefined ? null : this.digest.digest('idempotency-key-reference', key);
  }
}
