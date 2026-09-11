import { argon2id, hash } from 'argon2';
import { v7 as uuidv7 } from 'uuid';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { FoundationFixture } from './database.js';
import { TEST_PASSWORD } from './test-environment.js';

export interface ExerciseSessionStudentFixture {
  userId: string;
  studentId: string;
  enrollmentId: string;
  authSessionId: string;
  email: string;
}

export async function seedExerciseSessionStudent(
  prisma: PrismaClient,
  fixture: FoundationFixture,
  suffix = 'A',
  enrollmentStatus: 'ACTIVE' | 'REMOVED' = 'ACTIVE',
  configureCourse = true,
): Promise<ExerciseSessionStudentFixture> {
  const now = new Date();
  const userId = uuidv7();
  const studentId = uuidv7();
  const enrollmentId = uuidv7();
  const authSessionId = uuidv7();
  const email = `session.student.${suffix.toLowerCase()}.synthetic@bnbu.invalid`;
  const passwordHash = await hash(TEST_PASSWORD, { type: argon2id });
  await prisma.$transaction(async (transaction) => {
    if (configureCourse) await transaction.classSection.update({
      where: { id: fixture.teacherAActiveSectionId },
      data: {
        status: 'ACTIVE',
        checkInWindowMode: 'AVAILABLE',
        checkInStartDate: new Date('2026-08-01T00:00:00.000Z'),
        checkInEndDate: new Date('2027-01-31T00:00:00.000Z'),
        dailyStartTime: null,
        dailyEndTime: null,
        submissionDeadlineAt: new Date('2027-02-01T00:00:00.000Z'),
      },
    });
    await transaction.user.create({
      data: {
        id: userId,
        organizationId: fixture.organizationId,
        role: 'STUDENT',
        status: 'ACTIVE',
        primaryEmail: email,
        primaryEmailNormalized: email,
        emailVerifiedAt: now,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      },
    });
    await transaction.studentProfile.create({
      data: {
        id: studentId,
        organizationId: fixture.organizationId,
        userId,
        studentNumber: `SYNTH-SESSION-${suffix.padStart(4, '0')}`,
        fullName: `Synthetic Session Student ${suffix}`,
        gender: 'OTHER',
        gradeYear: 2026,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    });
    await transaction.enrollment.create({
      data: {
        id: enrollmentId,
        organizationId: fixture.organizationId,
        semesterId: fixture.semesterId,
        classSectionId: fixture.teacherAActiveSectionId,
        studentId,
        source: 'MANUAL',
        status: enrollmentStatus,
        joinedAt: now,
        endedAt: enrollmentStatus === 'REMOVED' ? now : null,
        endReason: enrollmentStatus === 'REMOVED' ? 'Synthetic removed fixture' : null,
        createdBy: fixture.teacherUserId,
        updatedBy: fixture.teacherUserId,
        createdAt: now,
        updatedAt: now,
      },
    });
    await transaction.authSession.create({
      data: {
        id: authSessionId,
        organizationId: fixture.organizationId,
        userId,
        status: 'ACTIVE',
        tokenFamilyId: uuidv7(),
        createdAt: now,
        lastSeenAt: now,
        absoluteExpiresAt: new Date(now.getTime() + 3_600_000),
        idleExpiresAt: new Date(now.getTime() + 3_600_000),
      },
    });
  });
  return { userId, studentId, enrollmentId, authSessionId, email };
}
