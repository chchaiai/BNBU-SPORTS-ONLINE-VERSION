import { v7 as uuidv7 } from 'uuid';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { FoundationFixture } from './database.js';
import { seedExerciseSessionStudent } from './exercise-session.js';

export async function seedSubmittedExerciseRecord(
  prisma: PrismaClient,
  fixture: FoundationFixture,
  suffix: string,
  initialResult: 'PENDING' | 'VALID' = 'PENDING',
  duration: { actualSeconds: number; maximumSeconds: number | null; configureCourse?: boolean } = {
    actualSeconds: 3600,
    maximumSeconds: null,
  },
): Promise<{
  recordId: string;
  sessionId: string;
  studentId: string;
  studentUserId: string;
  studentAuthSessionId: string;
  studentEmail: string;
}> {
  const student = await seedExerciseSessionStudent(prisma, fixture, `REVIEW-${suffix}`, 'ACTIVE', duration.configureCourse ?? true);
  const now = new Date();
  const businessDate = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const sessionId = uuidv7();
  const recordId = uuidv7();
  await prisma.exerciseSession.create({
    data: {
      id: sessionId,
      organizationId: fixture.organizationId,
      studentId: student.studentId,
      enrollmentId: student.enrollmentId,
      classSectionId: fixture.teacherAActiveSectionId,
      semesterId: fixture.semesterId,
      startedByAuthSessionId: student.authSessionId,
      status: 'COMPLETED',
      startedAt: new Date(now.getTime() - duration.actualSeconds * 1000),
      businessDate,
      completedAt: now,
      endReason: 'USER_COMPLETED',
      actualDurationSeconds: BigInt(duration.actualSeconds),
      maximumDurationSeconds: duration.maximumSeconds,
      pausedDurationSeconds: 0n,
      createdAt: now,
      updatedAt: now,
    },
  });
  await prisma.exerciseRecord.create({
    data: {
      id: recordId,
      organizationId: fixture.organizationId,
      semesterId: fixture.semesterId,
      studentId: student.studentId,
      enrollmentId: student.enrollmentId,
      classSectionId: fixture.teacherAActiveSectionId,
      courseId: fixture.activeCourseId,
      teacherId: fixture.teacherProfileId,
      sessionId,
      businessDate,
      creditType: 'GENERAL',
      sportType: 'RUNNING',
      description: `Synthetic review record ${suffix}`,
      actualDurationSeconds: BigInt(duration.actualSeconds),
      pausedDurationSeconds: 0n,
      creditedDurationSeconds: BigInt(Math.min(duration.actualSeconds, duration.maximumSeconds ?? 3600)),
      status: initialResult === 'VALID' ? 'REVIEWED' : 'SUBMITTED',
      submittedAt: now,
      clientRequestId: `review-record-${suffix}-${uuidv7()}`,
      version: 2,
      createdAt: now,
      updatedAt: now,
    },
  });
  await prisma.reviewRecord.create({
    data: {
      id: uuidv7(),
      organizationId: fixture.organizationId,
      recordId,
      reviewVersion: 1,
      result: initialResult,
      reviewedAt: initialResult === 'VALID' ? now : null,
      createdAt: now,
    },
  });
  return {
    recordId,
    sessionId,
    studentId: student.studentId,
    studentUserId: student.userId,
    studentAuthSessionId: student.authSessionId,
    studentEmail: student.email,
  };
}
