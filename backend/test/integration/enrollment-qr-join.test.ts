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

describe('PostgreSQL identity, Enrollment, and QR Join integration', () => {
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

  const createStudent = async (
    studentNumber: string,
  ): Promise<{
    userId: string;
    profileId: string;
  }> => {
    const userId = uuidv7();
    const profileId = uuidv7();
    const now = new Date();
    await prisma.user.create({
      data: {
        id: userId,
        organizationId: fixture.organizationId,
        role: 'STUDENT',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    });
    await prisma.studentProfile.create({
      data: {
        id: profileId,
        organizationId: fixture.organizationId,
        userId,
        studentNumber,
        fullName: `Synthetic Student ${studentNumber}`,
        gender: 'OTHER',
        gradeYear: 2026,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    });
    return { userId, profileId };
  };

  const createEnrollment = async (input: {
    profileId: string;
    userId: string;
    classSectionId?: string;
    status?: 'ACTIVE' | 'REMOVED' | 'WITHDRAWN';
  }): Promise<string> => {
    const now = new Date();
    const id = uuidv7();
    const status = input.status ?? 'ACTIVE';
    await prisma.enrollment.create({
      data: {
        id,
        organizationId: fixture.organizationId,
        semesterId: fixture.semesterId,
        classSectionId: input.classSectionId ?? fixture.teacherAActiveSectionId,
        studentId: input.profileId,
        source: 'MANUAL',
        sourceReferenceId: null,
        status,
        joinedAt: now,
        endedAt: status === 'ACTIVE' ? null : now,
        endReason: status === 'ACTIVE' ? null : 'Synthetic historical state',
        createdBy: input.userId,
        updatedBy: input.userId,
        createdAt: now,
        updatedAt: now,
      },
    });
    return id;
  };

  it('installs exactly the four Stage 12 tables with append-only event protection', async () => {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'course_invites',
          'join_capabilities',
          'enrollments',
          'enrollment_status_events'
        )
      ORDER BY table_name
    `;
    assert.deepEqual(
      tables.map(({ table_name }) => table_name),
      ['course_invites', 'enrollment_status_events', 'enrollments', 'join_capabilities'],
    );
    const trigger = await prisma.$queryRaw<{ trigger_name: string }[]>`
      SELECT trigger_name
      FROM information_schema.triggers
      WHERE trigger_name = 'enrollment_status_events_append_only_trigger'
    `;
    assert.deepEqual(
      [...new Set(trigger.map(({ trigger_name }) => trigger_name))],
      ['enrollment_status_events_append_only_trigger'],
    );
  });

  it('preserves leading zeros and enforces one identity per organization', async () => {
    const first = await createStudent('00000042');
    assert.equal(
      (await prisma.studentProfile.findUniqueOrThrow({ where: { id: first.profileId } }))
        .studentNumber,
      '00000042',
    );
    await assert.rejects(createStudent('00000042'));
  });

  it('enforces a permanent class relation and one ACTIVE Enrollment per semester', async () => {
    const student = await createStudent('00000043');
    await createEnrollment(student);
    await assert.rejects(createEnrollment(student));
    await assert.rejects(
      createEnrollment({
        ...student,
        classSectionId: fixture.teacherBActiveSectionId,
      }),
    );
    const historical = await createStudent('00000044');
    await createEnrollment({ ...historical, status: 'REMOVED' });
    await assert.rejects(createEnrollment({ ...historical, status: 'ACTIVE' }));
  });

  it('rejects invalid Enrollment status shapes and cross-organization references', async () => {
    const student = await createStudent('00000045');
    const now = new Date();
    await assert.rejects(
      prisma.enrollment.create({
        data: {
          id: uuidv7(),
          organizationId: fixture.organizationId,
          semesterId: fixture.semesterId,
          classSectionId: fixture.teacherAActiveSectionId,
          studentId: student.profileId,
          source: 'MANUAL',
          status: 'ACTIVE',
          joinedAt: now,
          endedAt: now,
          endReason: 'Invalid active shape',
          createdBy: student.userId,
          updatedBy: student.userId,
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
    await assert.rejects(
      prisma.enrollment.create({
        data: {
          id: uuidv7(),
          organizationId: fixture.isolationOrganizationId,
          semesterId: fixture.semesterId,
          classSectionId: fixture.teacherAActiveSectionId,
          studentId: student.profileId,
          source: 'MANUAL',
          status: 'ACTIVE',
          joinedAt: now,
          createdBy: fixture.teacherCUserId,
          updatedBy: fixture.teacherCUserId,
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
  });

  it('permits one ACTIVE invite per section while retaining revoked history', async () => {
    const now = new Date();
    const data = (id: string, versionNumber: number, tokenHash: string) => ({
      id,
      organizationId: fixture.organizationId,
      classSectionId: fixture.teacherAActiveSectionId,
      versionNumber,
      status: 'ACTIVE',
      tokenHash,
      secretKeyVersion: 1,
      createdBy: fixture.teacherUserId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 3_600_000),
    });
    const first = uuidv7();
    await prisma.courseInvite.create({ data: data(first, 1, 'a'.repeat(64)) });
    await assert.rejects(prisma.courseInvite.create({ data: data(uuidv7(), 2, 'b'.repeat(64)) }));
    const replacement = uuidv7();
    await prisma.$transaction(async (transaction) => {
      await transaction.courseInvite.update({
        where: { id: first },
        data: {
          status: 'REVOKED',
          revokedAt: now,
          revokedBy: fixture.teacherUserId,
          revokeReason: 'Synthetic rotation',
          replacedByInviteId: replacement,
          rowVersion: 2,
        },
      });
      await transaction.courseInvite.create({
        data: data(replacement, 2, 'b'.repeat(64)),
      });
    });
    assert.equal(await prisma.courseInvite.count(), 2);
  });

  it('enforces consumed capability shape and keeps EnrollmentStatusEvent append-only', async () => {
    const student = await createStudent('00000046');
    const enrollmentId = await createEnrollment(student);
    const now = new Date();
    await prisma.enrollmentStatusEvent.create({
      data: {
        id: uuidv7(),
        organizationId: fixture.organizationId,
        enrollmentId,
        fromStatus: null,
        toStatus: 'ACTIVE',
        source: 'MANUAL_ENROLLMENT',
        reason: 'Synthetic manual placement',
        actorUserId: student.userId,
        actorRoleSnapshot: 'STUDENT',
        requestId: 'synthetic-stage12-request',
        occurredAt: now,
        enrollmentVersion: 1,
      },
    });
    await assert.rejects(
      prisma.enrollmentStatusEvent.updateMany({
        where: { enrollmentId },
        data: { reason: 'Mutation must fail' },
      }),
    );
    assert.equal(await prisma.enrollmentStatusEvent.count({ where: { enrollmentId } }), 1);
  });
});
