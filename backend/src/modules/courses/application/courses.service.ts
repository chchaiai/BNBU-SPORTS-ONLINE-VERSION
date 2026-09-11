import { Injectable } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import type { PagedResult } from '../../../common/http/envelope.interceptor.js';
import { pagedResult } from '../../../common/http/envelope.interceptor.js';
import type { AuthenticatedPrincipal } from '../../../common/http/request-context.js';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { OutboxService } from '../../../common/outbox/outbox.service.js';
import { ScopedCursorService } from '../../../common/pagination/scoped-cursor.service.js';
import { SecureDigestService } from '../../../common/security/secure-digest.service.js';
import { Clock } from '../../../common/time/clock.js';
import { IdGenerator } from '../../../common/time/id-generator.js';
import { CourseDomainError } from '../domain/course-domain.error.js';
import {
  CourseRepository,
  type CourseSortField,
  type SortDirection,
} from '../domain/course.repository.js';
import { CourseEntity, type CourseState } from '../domain/course.js';
import type {
  CourseListQueryDto,
  CreateCourseRequestDto,
  UpdateCourseRequestDto,
} from '../interface/http/courses.dto.js';
import { projectCourse, type CourseProjection } from './course-projection.js';

interface MutationFacts {
  requestId: string;
  idempotencyKey: string | undefined;
}

const COURSE_SORT_FIELDS = new Set<CourseSortField>([
  'courseCode',
  'courseName',
  'status',
  'createdAt',
  'updatedAt',
]);

@Injectable()
export class CoursesService {
  constructor(
    private readonly repository: CourseRepository,
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
    input: CourseListQueryDto,
  ): Promise<PagedResult<CourseProjection>> {
    if (principal.role === 'TEACHER' && input.status !== undefined && input.status !== 'ACTIVE') {
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    }
    const { field, direction, expression } = this.parseSort(input.sort);
    const search = input.q?.trim();
    const status = principal.role === 'TEACHER' ? 'ACTIVE' : input.status;
    const binding = {
      resource: 'COURSE' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters: { q: search ?? null, status: status ?? null },
      sort: expression,
      limit: input.limit,
    };
    const page = await this.repository.list({
      organizationId: principal.organizationId,
      ...(status === undefined ? {} : { status }),
      ...(search === undefined ? {} : { search }),
      ...(principal.role === 'STUDENT' ? { studentUserId: principal.userId } : {}),
      sortField: field,
      sortDirection: direction,
      position: this.cursors.decode(input.cursor, binding),
      limit: input.limit,
    });
    const last = page.items.at(-1);
    return pagedResult(page.items.map(projectCourse), {
      nextCursor:
        page.hasMore && last !== undefined
          ? this.cursors.encode(binding, {
              value: this.sortValue(last, field),
              id: last.id,
            })
          : null,
      hasMore: page.hasMore,
      limit: input.limit,
    });
  }

  async get(principal: AuthenticatedPrincipal, courseId: string): Promise<CourseProjection> {
    const course =
      principal.role === 'STUDENT'
        ? await this.repository.findStudentVisibleById(
            principal.organizationId,
            courseId,
            principal.userId,
          )
        : await this.repository.findById(principal.organizationId, courseId);
    if (course === null || (principal.role === 'TEACHER' && course.status !== 'ACTIVE')) {
      throw new ApplicationError('COURSE_NOT_FOUND', 404);
    }
    return projectCourse(course);
  }

  async create(
    principal: AuthenticatedPrincipal,
    input: CreateCourseRequestDto,
    facts: MutationFacts,
  ): Promise<CourseProjection> {
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'createCourse',
        scope: principal.organizationId,
        key: facts.idempotencyKey,
        request: input,
        requestId: facts.requestId,
      },
      async (transaction) => {
        const now = this.clock.now();
        const entity = this.domain(() =>
          CourseEntity.create({
            id: this.ids.next(),
            organizationId: principal.organizationId,
            courseCode: input.courseCode,
            courseName: input.courseName,
            description: input.description ?? null,
            actorUserId: principal.userId,
            now,
          }),
        );
        const created = await this.repository.create(entity.snapshot(), transaction);
        await this.audit.append(transaction, {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          actorRoleSnapshot: principal.role,
          permissionId: 'COURSE-CREATE',
          actionType: 'COURSE_CREATED',
          targetType: 'COURSE',
          targetId: created.id,
          requestId: facts.requestId,
          idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
          outcome: 'SUCCEEDED',
          safeMetadata: { changedFields: ['courseCode', 'courseName', 'description', 'status'] },
        });
        await this.outbox.append(transaction, {
          organizationId: principal.organizationId,
          aggregateType: 'COURSE',
          aggregateId: created.id,
          eventType: 'COURSE_CREATED',
          eventVersion: created.version,
          payload: { courseId: created.id, requestId: facts.requestId },
        });
        return this.idempotency.success(projectCourse(created), {
          principalId: principal.userId,
          authSessionId: principal.sessionId,
          resourceType: 'COURSE',
          resourceId: created.id,
        });
      },
    );
  }

  async update(
    principal: AuthenticatedPrincipal,
    courseId: string,
    input: UpdateCourseRequestDto,
    facts: MutationFacts,
  ): Promise<CourseProjection> {
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'updateCourse',
        scope: `${principal.organizationId}:${courseId}`,
        key: facts.idempotencyKey,
        request: { courseId, ...input },
        requestId: facts.requestId,
      },
      async (transaction) => {
        const current = await this.repository.findById(
          principal.organizationId,
          courseId,
          transaction,
        );
        if (current === null) {
          return this.idempotency.failure(new ApplicationError('COURSE_NOT_FOUND', 404));
        }
        if (current.version !== input.expectedVersion) {
          return this.idempotency.failure(
            new ApplicationError('CONFLICT_VERSION_MISMATCH', 409, {
              expectedVersion: input.expectedVersion,
              currentVersion: current.version,
            }),
          );
        }
        const previousStatus = current.status;
        const entity = this.domain(() => CourseEntity.restore(current));
        const changedFields = this.domain(() =>
          entity.update(
            {
              ...(input.courseName === undefined ? {} : { courseName: input.courseName }),
              ...(input.description === undefined ? {} : { description: input.description }),
              ...(input.status === undefined ? {} : { status: input.status }),
            },
            principal.userId,
            this.clock.now(),
          ),
        );
        const next = entity.snapshot();
        const updated = await this.repository.update(next, input.expectedVersion, transaction);
        if (updated === null) {
          return this.idempotency.failure(new ApplicationError('CONFLICT_VERSION_MISMATCH', 409));
        }
        const nonStatusFields = changedFields.filter((field) => field !== 'status');
        if (nonStatusFields.length > 0) {
          await this.audit.append(transaction, {
            organizationId: principal.organizationId,
            actorUserId: principal.userId,
            actorRoleSnapshot: principal.role,
            permissionId: 'COURSE-UPDATE',
            actionType: 'COURSE_UPDATED',
            targetType: 'COURSE',
            targetId: courseId,
            requestId: facts.requestId,
            idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
            outcome: 'SUCCEEDED',
            safeMetadata: { changedFields: nonStatusFields },
          });
          await this.outbox.append(transaction, {
            organizationId: principal.organizationId,
            aggregateType: 'COURSE',
            aggregateId: courseId,
            eventType: 'COURSE_UPDATED',
            eventVersion: updated.version,
            payload: { courseId, changedFields: nonStatusFields, requestId: facts.requestId },
          });
        }
        if (changedFields.includes('status')) {
          await this.audit.append(transaction, {
            organizationId: principal.organizationId,
            actorUserId: principal.userId,
            actorRoleSnapshot: principal.role,
            permissionId: 'COURSE-UPDATE',
            actionType: 'COURSE_STATUS_CHANGED',
            targetType: 'COURSE',
            targetId: courseId,
            requestId: facts.requestId,
            idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
            outcome: 'SUCCEEDED',
            safeMetadata: {
              changedFields: ['status'],
              previousStatus,
              nextStatus: updated.status,
            },
          });
          await this.outbox.append(transaction, {
            organizationId: principal.organizationId,
            aggregateType: 'COURSE',
            aggregateId: courseId,
            eventType: 'COURSE_STATUS_CHANGED',
            eventVersion: updated.version,
            payload: {
              courseId,
              previousStatus,
              nextStatus: updated.status,
              requestId: facts.requestId,
            },
          });
        }
        return this.idempotency.success(projectCourse(updated), {
          principalId: principal.userId,
          authSessionId: principal.sessionId,
          resourceType: 'COURSE',
          resourceId: courseId,
        });
      },
    );
  }

  private parseSort(input: string | undefined): {
    field: CourseSortField;
    direction: SortDirection;
    expression: string;
  } {
    const expression = input?.trim() ?? 'courseCode';
    if (expression.includes(',')) throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
    const direction: SortDirection = expression.startsWith('-') ? 'desc' : 'asc';
    const field = (direction === 'desc' ? expression.slice(1) : expression) as CourseSortField;
    if (!COURSE_SORT_FIELDS.has(field)) {
      throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422, { field: 'sort' });
    }
    return { field, direction, expression };
  }

  private sortValue(course: CourseState, field: CourseSortField): string {
    const value = course[field];
    return value instanceof Date ? value.toISOString() : value;
  }

  private domain<T>(action: () => T): T {
    try {
      return action();
    } catch (error: unknown) {
      if (error instanceof CourseDomainError) {
        throw new ApplicationError('VALIDATION_FAILED', 422, {
          fieldErrors: [
            {
              field: 'course',
              code: 'INVALID',
              i18nKey: 'error.validation.failed',
              params: {},
            },
          ],
        });
      }
      throw error;
    }
  }

  private keyReference(key: string | undefined): string | null {
    return key === undefined ? null : this.digest.digest('idempotency-key-reference', key);
  }
}
