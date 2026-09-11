import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import { ApplicationError } from '../../src/common/errors/application-error.js';
import { ScopedCursorService } from '../../src/common/pagination/scoped-cursor.service.js';
import type { SecureDigestService } from '../../src/common/security/secure-digest.service.js';
import { ClassSectionDomainError } from '../../src/modules/class-sections/domain/class-section-domain.error.js';
import { ClassSectionEntity } from '../../src/modules/class-sections/domain/class-section.js';
import { projectClassSection } from '../../src/modules/class-sections/application/class-section-projection.js';
import { projectCourse } from '../../src/modules/courses/application/course-projection.js';
import { CourseCode } from '../../src/modules/courses/domain/course-code.js';
import { CourseDomainError } from '../../src/modules/courses/domain/course-domain.error.js';
import { CourseEntity } from '../../src/modules/courses/domain/course.js';

const IDs = {
  organization: '00000000-0000-7000-8000-000000000001',
  actor: '00000000-0000-7000-8000-000000000002',
  course: '00000000-0000-7000-8000-000000000003',
  semester: '00000000-0000-7000-8000-000000000004',
  teacher: '00000000-0000-7000-8000-000000000005',
  section: '00000000-0000-7000-8000-000000000006',
};

const now = new Date('2026-08-03T00:00:00.000Z');

function activeSection(): ClassSectionEntity {
  return ClassSectionEntity.create({
    id: IDs.section,
    organizationId: IDs.organization,
    courseId: IDs.course,
    semesterId: IDs.semester,
    teacherId: IDs.teacher,
    classCode: ' Synthetic Section A ',
    displayName: ' Synthetic Class Section ',
    status: 'ACTIVE',
    isEnrollmentOpen: false,
    actorUserId: IDs.actor,
    now,
  });
}

describe('Course domain', () => {
  it('normalizes CourseCode and starts Course as ACTIVE version 1', () => {
    assert.equal(CourseCode.create(' pe-101 ').value, 'PE-101');
    const course = CourseEntity.create({
      id: IDs.course,
      organizationId: IDs.organization,
      courseCode: ' pe-101 ',
      courseName: ' Synthetic Course ',
      description: ' Synthetic description ',
      actorUserId: IDs.actor,
      now,
    }).snapshot();
    assert.equal(course.courseCode, 'PE-101');
    assert.equal(course.courseName, 'Synthetic Course');
    assert.equal(course.status, 'ACTIVE');
    assert.equal(course.version, 1);
  });

  it('fails closed for invalid codes and increments version only for a real update', () => {
    assert.throws(() => CourseCode.create('invalid code'), CourseDomainError);
    const entity = CourseEntity.create({
      id: IDs.course,
      organizationId: IDs.organization,
      courseCode: 'PE-101',
      courseName: 'Synthetic Course',
      actorUserId: IDs.actor,
      now,
    });
    const fields = entity.update(
      { status: 'INACTIVE', courseName: 'Synthetic Course Updated' },
      IDs.actor,
      new Date('2026-08-03T01:00:00.000Z'),
    );
    assert.deepEqual(fields, ['courseName', 'status']);
    assert.equal(entity.snapshot().version, 2);
    assert.throws(
      () => entity.update({}, IDs.actor, new Date('2026-08-03T02:00:00.000Z')),
      CourseDomainError,
    );
  });

  it('projects only the authoritative public Course fields', () => {
    const state = CourseEntity.create({
      id: IDs.course,
      organizationId: IDs.organization,
      courseCode: 'PE-101',
      courseName: 'Synthetic Course',
      actorUserId: IDs.actor,
      now,
    }).snapshot();
    assert.deepEqual(Object.keys(projectCourse(state)).sort(), [
      'courseCode',
      'courseName',
      'createdAt',
      'createdBy',
      'deletedAt',
      'description',
      'id',
      'organizationId',
      'status',
      'updatedAt',
      'version',
    ]);
  });
});

describe('ClassSection domain', () => {
  it('normalizes fields and atomically validates the complete calendar value object', () => {
    const entity = activeSection();
    const changed = entity.update(
      {
        checkInWindowMode: 'AVAILABLE',
        checkInStartDate: '2026-08-10',
        checkInEndDate: '2026-08-20',
        dailyStartTime: '08:30',
        dailyEndTime: '10:00',
        excludedDates: ['2026-08-16', '2026-08-15', '2026-08-16'],
      },
      { startDate: '2026-08-01', endDate: '2027-01-31' },
      IDs.actor,
      new Date('2026-08-03T01:00:00.000Z'),
    );
    const state = entity.snapshot();
    assert.ok(changed.includes('excludedDates'));
    assert.deepEqual(state.excludedDates, ['2026-08-15', '2026-08-16']);
    assert.equal(state.dailyStartTime, '08:30:00');
    assert.equal(state.version, 2);
  });

  it('rejects invalid class codes, incomplete daily time pairs, and non-owner teachers', () => {
    assert.throws(
      () =>
        ClassSectionEntity.create({
          id: IDs.section,
          organizationId: IDs.organization,
          courseId: IDs.course,
          semesterId: IDs.semester,
          teacherId: IDs.teacher,
          classCode: ' ',
          displayName: 'Synthetic Section',
          status: 'ACTIVE',
          isEnrollmentOpen: false,
          actorUserId: IDs.actor,
          now,
        }),
      ClassSectionDomainError,
    );
    assert.throws(
      () =>
        activeSection().update(
          { dailyStartTime: '08:00' },
          { startDate: '2026-08-01', endDate: '2027-01-31' },
          IDs.actor,
          now,
        ),
      ClassSectionDomainError,
    );
    assert.throws(() => activeSection().assertOwnedBy(IDs.actor), ClassSectionDomainError);
  });

  it('rejects invalid windows and excluded dates outside the section range', () => {
    assert.throws(
      () =>
        activeSection().update(
          {
            checkInWindowMode: 'AVAILABLE',
            checkInStartDate: '2026-08-20',
            checkInEndDate: '2026-08-10',
          },
          { startDate: '2026-08-01', endDate: '2027-01-31' },
          IDs.actor,
          now,
        ),
      ClassSectionDomainError,
    );
    assert.throws(
      () =>
        activeSection().update(
          {
            checkInStartDate: '2026-08-10',
            checkInEndDate: '2026-08-20',
            excludedDates: ['2026-08-21'],
          },
          { startDate: '2026-08-01', endDate: '2027-01-31' },
          IDs.actor,
          now,
        ),
      ClassSectionDomainError,
    );
  });

  it('closes without deleting history and rejects a second close', () => {
    const entity = activeSection();
    entity.close(' Synthetic lifecycle close ', IDs.actor, now);
    const closed = entity.snapshot();
    assert.equal(closed.status, 'CLOSED');
    assert.equal(closed.isEnrollmentOpen, false);
    assert.equal(closed.closeReason, 'Synthetic lifecycle close');
    assert.equal(closed.version, 2);
    assert.throws(() => entity.close('again', IDs.actor, now), ClassSectionDomainError);
  });

  it('rejects ordinary writes to an archived section and projects no close internals', () => {
    const archivedState = activeSection().snapshot();
    archivedState.status = 'ARCHIVED';
    archivedState.closedAt = now;
    archivedState.closedBy = IDs.actor;
    archivedState.closeReason = 'Synthetic archived state';
    const archived = ClassSectionEntity.restore(archivedState);
    assert.throws(
      () =>
        archived.update(
          { displayName: 'Not writable' },
          { startDate: '2026-08-01', endDate: '2027-01-31' },
          IDs.actor,
          now,
        ),
      ClassSectionDomainError,
    );
    const projection = projectClassSection(archived.snapshot());
    assert.equal('closeReason' in projection, false);
    assert.equal('closedBy' in projection, false);
    assert.equal('updatedBy' in projection, false);
  });
});

describe('Scoped cursor', () => {
  it('binds opaque cursors to organization, principal, filters, sort, and limit', () => {
    const digest = {
      digest: (domain: string, value: string) =>
        createHash('sha256').update(`${domain}\0${value}`).digest('hex'),
    } as SecureDigestService;
    const cursors = new ScopedCursorService(digest);
    const binding = {
      resource: 'COURSE' as const,
      organizationId: IDs.organization,
      principalId: IDs.actor,
      role: 'TEACHER',
      filters: { status: 'ACTIVE' },
      sort: 'courseCode',
      limit: 20,
    };
    const position = { value: 'PE-101', id: IDs.course };
    const cursor = cursors.encode(binding, position);
    assert.notEqual(cursor.includes('PE-101'), true);
    assert.deepEqual(cursors.decode(cursor, binding), position);
    assert.throws(
      () => cursors.decode(cursor, { ...binding, principalId: IDs.teacher }),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'VALIDATION_FORMAT_INVALID',
    );
    assert.throws(
      () => cursors.decode(cursor, { ...binding, filters: { status: 'INACTIVE' } }),
      ApplicationError,
    );
  });
});
