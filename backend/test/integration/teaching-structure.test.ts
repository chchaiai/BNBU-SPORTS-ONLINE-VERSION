import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { v7 as uuidv7 } from 'uuid';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  createTestPrisma,
  resetFoundationDatabase,
  seedFoundationFixture,
  type FoundationFixture,
} from '../helpers/database.js';
import { requireTestDatabaseUrl } from '../helpers/test-environment.js';

describe('PostgreSQL teaching structure integration', () => {
  let prisma: PrismaClient;
  let fixture: FoundationFixture;

  before(() => {
    prisma = createTestPrisma(requireTestDatabaseUrl());
  });

  beforeEach(async () => {
    await resetFoundationDatabase(prisma);
    fixture = await seedFoundationFixture(prisma);
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('persists the teaching fixture across forward-only Score while keeping Export absent', async () => {
    assert.equal(await prisma.course.count(), 4);
    assert.equal(await prisma.classSection.count(), 5);
    assert.equal(
      await prisma.classSection.count({ where: { organizationId: fixture.organizationId } }),
      4,
    );
    const laterTables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'score_rules',
          'student_scores',
          'export_jobs'
        )
    `;
    assert.deepEqual(laterTables.map((item) => item.table_name).sort(), [
      'score_rules',
      'student_scores',
    ]);
  });

  it('enforces organization Course codes and semester/course/class codes as unique', async () => {
    await assert.rejects(
      prisma.course.create({
        data: {
          id: uuidv7(),
          organizationId: fixture.organizationId,
          courseCode: 'SYNTH-PE-101',
          courseName: 'Synthetic Duplicate Course',
          status: 'ACTIVE',
          createdBy: fixture.adminUserId,
          updatedBy: fixture.adminUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    );
    await assert.rejects(
      prisma.classSection.create({
        data: {
          id: uuidv7(),
          organizationId: fixture.organizationId,
          courseId: fixture.activeCourseId,
          semesterId: fixture.semesterId,
          teacherId: fixture.teacherProfileId,
          classCode: 'SYNTH-A-01',
          displayName: 'Synthetic Duplicate Section',
          status: 'ACTIVE',
          createdBy: fixture.teacherUserId,
          updatedBy: fixture.teacherUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    );
  });

  it('rejects every cross-organization Course, Semester, Teacher, and actor reference', async () => {
    const base = {
      id: uuidv7(),
      organizationId: fixture.organizationId,
      courseId: fixture.activeCourseId,
      semesterId: fixture.semesterId,
      teacherId: fixture.teacherProfileId,
      classCode: 'SYNTH-CROSS-ORG',
      displayName: 'Synthetic Cross Organization Section',
      status: 'ACTIVE',
      createdBy: fixture.teacherUserId,
      updatedBy: fixture.teacherUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await assert.rejects(
      prisma.classSection.create({
        data: { ...base, courseId: fixture.isolationCourseId },
      }),
    );
    await assert.rejects(
      prisma.classSection.create({
        data: { ...base, id: uuidv7(), semesterId: fixture.isolationSemesterId },
      }),
    );
    await assert.rejects(
      prisma.classSection.create({
        data: { ...base, id: uuidv7(), teacherId: fixture.teacherCProfileId },
      }),
    );
    await assert.rejects(
      prisma.classSection.create({
        data: { ...base, id: uuidv7(), createdBy: fixture.teacherCUserId },
      }),
    );
  });

  it('enforces version, date, daily-time, and excluded-date database checks', async () => {
    await assert.rejects(
      prisma.course.create({
        data: {
          id: uuidv7(),
          organizationId: fixture.organizationId,
          courseCode: 'SYNTH-VERSION-ZERO',
          courseName: 'Synthetic Invalid Version Course',
          status: 'ACTIVE',
          createdBy: fixture.adminUserId,
          updatedBy: fixture.adminUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 0,
        },
      }),
    );
    await assert.rejects(
      prisma.classSection.update({
        where: { id: fixture.teacherAActiveSectionId },
        data: {
          checkInWindowMode: 'AVAILABLE',
          checkInStartDate: new Date('2026-08-20T00:00:00.000Z'),
          checkInEndDate: new Date('2026-08-10T00:00:00.000Z'),
        },
      }),
    );
    await assert.rejects(
      prisma.classSection.update({
        where: { id: fixture.teacherAActiveSectionId },
        data: { dailyStartTime: new Date('1970-01-01T08:00:00.000Z') },
      }),
    );
    await prisma.classSection.update({
      where: { id: fixture.teacherAActiveSectionId },
      data: {
        checkInWindowMode: 'AVAILABLE',
        checkInStartDate: new Date('2026-08-10T00:00:00.000Z'),
        checkInEndDate: new Date('2026-08-20T00:00:00.000Z'),
      },
    });
    const excluded = {
      classSectionId: fixture.teacherAActiveSectionId,
      organizationId: fixture.organizationId,
      excludedDate: new Date('2026-08-15T00:00:00.000Z'),
      createdAt: new Date(),
      createdBy: fixture.teacherUserId,
    };
    await prisma.classSectionExcludedDate.create({ data: excluded });
    await assert.rejects(prisma.classSectionExcludedDate.create({ data: excluded }));
  });

  it('prevents deleting referenced Course and preserves sections across deactivate and close', async () => {
    await assert.rejects(prisma.course.delete({ where: { id: fixture.activeCourseId } }));
    const sectionCount = await prisma.classSection.count({
      where: { courseId: fixture.activeCourseId },
    });
    await prisma.course.update({
      where: { id: fixture.activeCourseId },
      data: { status: 'INACTIVE', version: { increment: 1 } },
    });
    assert.equal(
      await prisma.classSection.count({ where: { courseId: fixture.activeCourseId } }),
      sectionCount,
    );
    await prisma.classSection.update({
      where: { id: fixture.teacherAActiveSectionId },
      data: {
        status: 'CLOSED',
        isEnrollmentOpen: false,
        closedAt: new Date(),
        closedBy: fixture.teacherUserId,
        closeReason: 'Synthetic integration close',
        updatedAt: new Date(),
        version: { increment: 1 },
      },
    });
    assert.equal(
      (
        await prisma.classSection.findUniqueOrThrow({
          where: { id: fixture.teacherAActiveSectionId },
        })
      ).status,
      'CLOSED',
    );
    assert.equal(
      await prisma.classSection.count({ where: { id: fixture.teacherAActiveSectionId } }),
      1,
    );
  });

  it('rolls back parent and excluded-date changes when the calendar invariant fails', async () => {
    await assert.rejects(
      prisma.$transaction(async (transaction) => {
        await transaction.classSection.update({
          where: { id: fixture.teacherAActiveSectionId },
          data: {
            checkInWindowMode: 'AVAILABLE',
            checkInStartDate: new Date('2026-08-10T00:00:00.000Z'),
            checkInEndDate: new Date('2026-08-20T00:00:00.000Z'),
            version: { increment: 1 },
          },
        });
        await transaction.auditLog.create({
          data: {
            id: uuidv7(),
            organizationId: fixture.organizationId,
            actorUserId: fixture.teacherUserId,
            actorRoleSnapshot: 'TEACHER',
            permissionId: 'CLASS-SECTION-UPDATE',
            actionType: 'CLASS_SECTION_UPDATED',
            targetType: 'CLASS_SECTION',
            targetId: fixture.teacherAActiveSectionId,
            requestId: 'req-rollback-teaching',
            outcome: 'SUCCEEDED',
            safeMetadata: {},
            occurredAt: new Date(),
          },
        });
        await transaction.outboxEvent.create({
          data: {
            id: uuidv7(),
            organizationId: fixture.organizationId,
            aggregateType: 'CLASS_SECTION',
            aggregateId: fixture.teacherAActiveSectionId,
            eventType: 'CLASS_SECTION_UPDATED',
            eventVersion: 2,
            payload: {},
            status: 'PENDING',
            availableAt: new Date(),
            createdAt: new Date(),
          },
        });
        await transaction.classSectionExcludedDate.create({
          data: {
            classSectionId: fixture.teacherAActiveSectionId,
            organizationId: fixture.organizationId,
            excludedDate: new Date('2026-08-21T00:00:00.000Z'),
            createdAt: new Date(),
            createdBy: fixture.teacherUserId,
          },
        });
      }),
    );
    const section = await prisma.classSection.findUniqueOrThrow({
      where: { id: fixture.teacherAActiveSectionId },
    });
    assert.equal(section.checkInWindowMode, 'UNAVAILABLE');
    assert.equal(section.version, 1);
    assert.equal(await prisma.classSectionExcludedDate.count(), 0);
    assert.equal(await prisma.auditLog.count(), 0);
    assert.equal(await prisma.outboxEvent.count(), 0);
  });

  it('accepts the Stage 11 Course audit actions while preserving append-only behavior', async () => {
    for (const actionType of ['COURSE_CREATED', 'COURSE_UPDATED', 'COURSE_STATUS_CHANGED']) {
      await prisma.auditLog.create({
        data: {
          id: uuidv7(),
          organizationId: fixture.organizationId,
          actorUserId: fixture.adminUserId,
          actorRoleSnapshot: 'ADMIN',
          permissionId: 'COURSE-UPDATE',
          actionType,
          targetType: 'COURSE',
          targetId: fixture.activeCourseId,
          requestId: `req-${actionType.toLowerCase()}`,
          outcome: 'SUCCEEDED',
          safeMetadata: {},
          occurredAt: new Date(),
        },
      });
    }
    assert.equal(await prisma.auditLog.count(), 3);
    await assert.rejects(
      prisma.auditLog.updateMany({
        where: { organizationId: fixture.organizationId },
        data: { outcome: 'FAILED' },
      }),
    );
  });
});
