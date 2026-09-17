import { argon2id, hash } from 'argon2';
import { createHash } from 'node:crypto';
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
  const syntheticNumber=(BigInt('0x'+createHash('sha256').update(suffix).digest('hex').slice(0,12))%1_000_000_000n).toString().padStart(9,'0');
  const email = `a${syntheticNumber}@mail.bnbu.edu.cn`;
  const passwordHash = await hash(TEST_PASSWORD, { type: argon2id });
  await prisma.$transaction(async (transaction) => {
    if (configureCourse) await transaction.classSection.update({
      where: { id: fixture.teacherAActiveSectionId },
      data: {
        status: 'ACTIVE',
        checkInWindowMode: 'AVAILABLE',
        checkInStartDate: new Date('2026-08-01T00:00:00.000Z'),
        // Leave the published seven-day closing period inside the semester.
        checkInEndDate: new Date('2027-01-23T00:00:00.000Z'),
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
        studentNumber: `2${syntheticNumber}`,
        fullName: 'Synthetic Session Student',
        collegeName: 'SCC',
        majorName: 'JC',
        dateOfBirth: new Date('2004-01-01'),
        regionCode: 'HK',
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
