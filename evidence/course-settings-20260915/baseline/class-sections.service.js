var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { endCourseMemberships } from '../../enrollments/application/course-closure-memberships.js';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../common/audit/audit.service.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import { pagedResult } from '../../../common/http/envelope.interceptor.js';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { OutboxService } from '../../../common/outbox/outbox.service.js';
import { ScopedCursorService } from '../../../common/pagination/scoped-cursor.service.js';
import { SecureDigestService } from '../../../common/security/secure-digest.service.js';
import { Clock } from '../../../common/time/clock.js';
import { IdGenerator } from '../../../common/time/id-generator.js';
import { ClassSectionDomainError } from '../domain/class-section-domain.error.js';
import { ClassSectionRepository, } from '../domain/class-section.repository.js';
import { ClassSectionEntity, } from '../domain/class-section.js';
import { projectClassSection } from './class-section-projection.js';
const SORT_FIELDS = new Set([
    'classCode',
    'displayName',
    'status',
    'createdAt',
    'updatedAt',
]);
let ClassSectionsService = class ClassSectionsService {
    repository;
    idempotency;
    audit;
    outbox;
    cursors;
    digest;
    clock;
    ids;
    constructor(repository, idempotency, audit, outbox, cursors, digest, clock, ids) {
        this.repository = repository;
        this.idempotency = idempotency;
        this.audit = audit;
        this.outbox = outbox;
        this.cursors = cursors;
        this.digest = digest;
        this.clock = clock;
        this.ids = ids;
    }
    async list(principal, input) {
        const teacher = principal.role === 'TEACHER' ? await this.requirePrincipalTeacher(principal) : null;
        return this.listScoped(principal, input, teacher?.id, principal.role === 'STUDENT' ? principal.userId : undefined);
    }
    async listForTeacher(principal, teacherId, input) {
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
        return this.listScoped(principal, {
            limit: input.limit,
            ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
            ...(input.sort === undefined ? {} : { sort: input.sort }),
            ...(input.semesterId === undefined ? {} : { semesterId: input.semesterId }),
        }, target.id);
    }
    async get(principal, classSectionId) {
        const section = principal.role === 'STUDENT'
            ? await this.repository.findStudentVisibleById(principal.organizationId, classSectionId, principal.userId)
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
    async create(principal, input, facts) {
        return this.idempotency.execute({
            organizationId: principal.organizationId,
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            operationId: 'createClassSection',
            scope: principal.organizationId,
            key: facts.idempotencyKey,
            request: input,
            requestId: facts.requestId,
        }, async (transaction) => {
            await transaction.$queryRaw `SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
            const teacher = await this.requirePrincipalTeacher(principal, transaction);
            const course = await this.repository.findCourse(principal.organizationId, input.courseId, transaction);
            if (course?.deletedAt !== null) {
                return this.idempotency.failure(new ApplicationError('COURSE_NOT_FOUND', 404));
            }
            if (course.status !== 'ACTIVE') {
                return this.idempotency.failure(new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409, {
                    resource: 'COURSE',
                    requiredStatus: 'ACTIVE',
                }));
            }
            const semester = await this.repository.findSemester(principal.organizationId, input.semesterId, transaction);
            if (semester === null) {
                return this.idempotency.failure(new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404));
            }
            if (semester.status === 'ARCHIVED') {
                return this.idempotency.failure(new ApplicationError('COURSE_SEMESTER_ARCHIVED', 409));
            }
            if (semester.status !== 'CURRENT') {
                return this.idempotency.failure(new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409, {
                    resource: 'SEMESTER', requiredStatus: 'CURRENT',
                }));
            }
            const entity = this.domain(() => ClassSectionEntity.create({
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
            }));
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
        });
    }
    async update(principal, classSectionId, input, facts) {
        return this.idempotency.execute({
            organizationId: principal.organizationId,
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            operationId: 'updateClassSection',
            scope: `${principal.organizationId}:${classSectionId}`,
            key: facts.idempotencyKey,
            request: { classSectionId, ...input },
            requestId: facts.requestId,
        }, async (transaction) => {
            const teacher = await this.requirePrincipalTeacher(principal, transaction);
            const section = await this.repository.findById(principal.organizationId, classSectionId, transaction);
            if (section === null) {
                return this.idempotency.failure(new ApplicationError('COURSE_CLASS_SECTION_NOT_FOUND', 404));
            }
            const entity = this.domain(() => ClassSectionEntity.restore(section));
            if (!this.isOwnedBy(entity, teacher.id)) {
                return this.idempotency.failure(new ApplicationError('PERMISSION_COURSE_SCOPE_DENIED', 403));
            }
            if (section.status === 'CLOSED' || section.status === 'ARCHIVED') {
                return this.idempotency.failure(new ApplicationError('COURSE_CLASS_SECTION_NOT_WRITABLE', 409));
            }
            if (section.version !== input.expectedVersion) {
                return this.idempotency.failure(this.versionMismatch(input.expectedVersion, section.version));
            }
            const semester = await this.repository.findSemester(principal.organizationId, section.semesterId, transaction);
            if (semester === null) {
                return this.idempotency.failure(new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
                    invariant: 'CLASS_SECTION_SEMESTER_REQUIRED',
                }));
            }
            if (semester.status === 'ARCHIVED') {
                return this.idempotency.failure(new ApplicationError('COURSE_SEMESTER_ARCHIVED', 409));
            }
            await transaction.$queryRaw `SELECT id FROM class_sections WHERE id=${classSectionId}::uuid AND organization_id=${principal.organizationId}::uuid FOR UPDATE`;
            const publishedRules = await transaction.$queryRaw `
          SELECT published_at FROM v81_course_rules WHERE class_section_id=${classSectionId}::uuid AND organization_id=${principal.organizationId}::uuid`;
            if (publishedRules[0]?.published_at &&
                [
                    input.checkInStartDate,
                    input.checkInEndDate,
                    input.dailyStartTime,
                    input.dailyEndTime,
                    input.excludedDates,
                    input.checkInWindowMode,
                    input.submissionDeadlineAt,
                ].some((value) => value !== undefined)) {
                return this.idempotency.failure(new ApplicationError('CONFLICT_STATE_TRANSITION', 409, {
                    reason: 'PUBLISHED_COURSE_RULES_LOCKED',
                }));
            }
            const update = this.updateInput(input);
            const changedFields = this.domain(() => entity.update(update, { startDate: semester.startDate, endDate: semester.endDate }, principal.userId, this.clock.now()));
            const updated = await this.repository.update(entity.snapshot(), input.expectedVersion, input.excludedDates !== undefined, transaction);
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
        });
    }
    async close(principal, classSectionId, input, facts) {
        return this.idempotency.execute({
            organizationId: principal.organizationId,
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            operationId: 'closeClassSection',
            scope: `${principal.organizationId}:${classSectionId}`,
            key: facts.idempotencyKey,
            request: { classSectionId, ...input },
            requestId: facts.requestId,
        }, async (transaction) => {
            await transaction.$queryRaw `SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
            const teacher = await this.requirePrincipalTeacher(principal, transaction);
            const section = await this.repository.findById(principal.organizationId, classSectionId, transaction);
            if (section === null) {
                return this.idempotency.failure(new ApplicationError('COURSE_CLASS_SECTION_NOT_FOUND', 404));
            }
            const entity = this.domain(() => ClassSectionEntity.restore(section));
            if (!this.isOwnedBy(entity, teacher.id)) {
                return this.idempotency.failure(new ApplicationError('PERMISSION_COURSE_SCOPE_DENIED', 403));
            }
            if (section.status === 'CLOSED' || section.status === 'ARCHIVED') {
                return this.idempotency.failure(new ApplicationError('COURSE_CLASS_SECTION_NOT_WRITABLE', 409));
            }
            if (section.version !== input.expectedVersion) {
                return this.idempotency.failure(this.versionMismatch(input.expectedVersion, section.version));
            }
            const semester = await this.repository.findSemester(principal.organizationId, section.semesterId, transaction);
            if (semester?.status === 'ARCHIVED') {
                return this.idempotency.failure(new ApplicationError('COURSE_SEMESTER_ARCHIVED', 409));
            }
            const previousStatus = section.status;
            const changedFields = this.domain(() => entity.close(input.reason, principal.userId, this.clock.now()));
            const closed = await this.repository.close(entity.snapshot(), input.expectedVersion, transaction);
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
        });
    }
    async listScoped(principal, input, teacherId, studentUserId) {
        const { field, direction, expression } = this.parseSort(input.sort);
        const search = input.q?.trim();
        const binding = {
            resource: 'CLASS_SECTION',
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
            nextCursor: page.hasMore && last !== undefined
                ? this.cursors.encode(binding, { value: this.sortValue(last, field), id: last.id })
                : null,
            hasMore: page.hasMore,
            limit: input.limit,
        });
    }
    async requirePrincipalTeacher(principal, transaction) {
        const teacher = await this.repository.findTeacherByUser(principal.organizationId, principal.userId, transaction);
        if (teacher?.status !== 'ACTIVE' || teacher.deletedAt !== null) {
            throw new ApplicationError('PERMISSION_COURSE_SCOPE_DENIED', 403);
        }
        return teacher;
    }
    updateInput(input) {
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
    parseSort(input) {
        const expression = input?.trim() ?? '-updatedAt';
        if (expression.includes(','))
            throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
        const direction = expression.startsWith('-') ? 'desc' : 'asc';
        const field = (direction === 'desc' ? expression.slice(1) : expression);
        if (!SORT_FIELDS.has(field)) {
            throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422, { field: 'sort' });
        }
        return { field, direction, expression };
    }
    sortValue(section, field) {
        const value = section[field];
        return value instanceof Date ? value.toISOString() : value;
    }
    domain(action) {
        try {
            return action();
        }
        catch (error) {
            if (error instanceof ClassSectionDomainError) {
                if (error.code === 'CLASS_SECTION_NOT_WRITABLE') {
                    throw new ApplicationError('COURSE_CLASS_SECTION_NOT_WRITABLE', 409);
                }
                throw new ApplicationError('VALIDATION_FAILED', 422, {
                    reason: error.code,
                    fieldErrors: [
                        {
                            field: { CLASS_SECTION_DATE_RANGE_INVALID: 'checkInEndDate', CLASS_SECTION_TIME_RANGE_INVALID: 'dailyEndTime', CLASS_SECTION_EXCLUDED_DATE_INVALID: 'excludedDates' }[error.code] ?? 'classSection',
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
    isOwnedBy(entity, teacherId) {
        try {
            entity.assertOwnedBy(teacherId);
            return true;
        }
        catch (error) {
            if (error instanceof ClassSectionDomainError &&
                error.code === 'CLASS_SECTION_TEACHER_SCOPE_DENIED') {
                return false;
            }
            throw error;
        }
    }
    versionMismatch(expectedVersion, currentVersion) {
        return new ApplicationError('CONFLICT_VERSION_MISMATCH', 409, {
            expectedVersion,
            currentVersion,
        });
    }
    keyReference(key) {
        return key === undefined ? null : this.digest.digest('idempotency-key-reference', key);
    }
};
ClassSectionsService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [ClassSectionRepository,
        IdempotencyService,
        AuditService,
        OutboxService,
        ScopedCursorService,
        SecureDigestService,
        Clock,
        IdGenerator])
], ClassSectionsService);
export { ClassSectionsService };
//# sourceMappingURL=class-sections.service.js.map
