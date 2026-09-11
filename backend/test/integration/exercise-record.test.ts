import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';

import { v7 as uuidv7 } from 'uuid';

import type { ExerciseRecord, PrismaClient } from '../../src/generated/prisma/client.js';
import {
  createTestPrisma,
  resetFoundationDatabase,
  seedFoundationFixture,
  type FoundationFixture,
} from '../helpers/database.js';
import {
  seedExerciseSessionStudent,
  type ExerciseSessionStudentFixture,
} from '../helpers/exercise-session.js';
import { requireTestDatabaseUrl } from '../helpers/test-environment.js';

describe('ExerciseRecord PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let fixture: FoundationFixture;
  let student: ExerciseSessionStudentFixture;
  let sessionId: string;
  let businessDate: Date;

  before(() => {
    prisma = createTestPrisma(requireTestDatabaseUrl());
  });

  beforeEach(async () => {
    await resetFoundationDatabase(prisma);
    fixture = await seedFoundationFixture(prisma);
    student = await seedExerciseSessionStudent(prisma, fixture, 'RECORD');
    const now = new Date();
    businessDate = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
    sessionId = uuidv7();
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
        startedAt: new Date(now.getTime() - 3_600_000),
        businessDate,
        completedAt: now,
        endReason: 'USER_COMPLETED',
        actualDurationSeconds: 3600n,
        pausedDurationSeconds: 0n,
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  const createRecord = async (
    overrides: { creditType?: 'COURSE_RELATED' | 'GENERAL'; description?: string | null } = {},
  ): Promise<ExerciseRecord> => {
    const now = new Date();
    return prisma.exerciseRecord.create({
      data: {
        id: uuidv7(),
        organizationId: fixture.organizationId,
        semesterId: fixture.semesterId,
        studentId: student.studentId,
        enrollmentId: student.enrollmentId,
        classSectionId: fixture.teacherAActiveSectionId,
        courseId: fixture.activeCourseId,
        teacherId: fixture.teacherProfileId,
        sessionId,
        businessDate,
        creditType: overrides.creditType ?? 'GENERAL',
        sportType: 'RUNNING',
        description:
          overrides.description === undefined ? 'Synthetic record' : overrides.description,
        actualDurationSeconds: 3600n,
        pausedDurationSeconds: 0n,
        creditedDurationSeconds: 3600n,
        status: 'DRAFT',
        clientRequestId: `record-${uuidv7()}`,
        createdAt: now,
        updatedAt: now,
      },
    });
  };

  const createAvailableMedia = async () => {
    const now = new Date();
    return prisma.mediaEvidence.create({
      data: {
        id: uuidv7(),
        organizationId: fixture.organizationId,
        ownerStudentId: student.studentId,
        sessionId,
        initiatedByUserId: student.userId,
        businessPurpose: 'EXERCISE_RECORD',
        mediaType: 'IMAGE',
        captureSource: 'IN_APP_CAMERA',
        declaredMimeType: 'image/png',
        verifiedMimeType: 'image/png',
        declaredFileSizeBytes: 45n,
        verifiedFileSizeBytes: 45n,
        declaredContentSha256: 'a'.repeat(64),
        verifiedContentSha256: 'a'.repeat(64),
        uploadStatus: 'AVAILABLE',
        storageKey: `media/${fixture.organizationId}/${uuidv7()}/image`,
        uploadedAt: now,
        boundAt: now,
        processingStartedAt: now,
        availableAt: now,
        createdAt: now,
        updatedAt: now,
        version: 5,
      },
    });
  };

  it('installs only the five Stage 16 tables and the one-record-per-session key', async () => {
    const names = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name
        FROM information_schema.tables
       WHERE table_schema = 'public'
         AND (table_name LIKE 'exercise_record%' OR table_name = 'review_records')
       ORDER BY table_name
    `;
    assert.deepEqual(
      names.map((row) => row.table_name),
      [
        'exercise_record_daily_slots',
        'exercise_record_events',
        'exercise_record_media',
        'exercise_records',
        'review_records',
      ],
    );
    await createRecord();
    await assert.rejects(createRecord());
  });

  it('enforces the conditional description rule in PostgreSQL', async () => {
    const courseRecord = await createRecord({ creditType: 'COURSE_RELATED', description: null });
    assert.equal(courseRecord.description, null);
    const generalRecord = await prisma.exerciseRecord.update({
      where: { id: courseRecord.id },
      data: {
        creditType: 'GENERAL',
        description: 'Required autonomous exercise detail',
        version: { increment: 1 },
      },
    });
    assert.equal(generalRecord.description, 'Required autonomous exercise detail');
    await assert.rejects(
      prisma.exerciseRecord.update({
        where: { id: courseRecord.id },
        data: { description: null, version: { increment: 1 } },
      }),
    );
  });

  it('enforces media ownership, availability, global uniqueness, and daily uniqueness', async () => {
    const record = await createRecord();
    const media = await createAvailableMedia();
    await prisma.exerciseRecordMedia.create({
      data: {
        organizationId: fixture.organizationId,
        recordId: record.id,
        mediaId: media.id,
        sessionId,
        ownerStudentId: student.studentId,
        position: 1,
        createdAt: new Date(),
      },
    });
    await assert.rejects(
      prisma.exerciseRecordMedia.create({
        data: {
          organizationId: fixture.organizationId,
          recordId: record.id,
          mediaId: media.id,
          sessionId,
          ownerStudentId: student.studentId,
          position: 2,
          createdAt: new Date(),
        },
      }),
    );
    await prisma.exerciseRecordDailySlot.create({
      data: {
        organizationId: fixture.organizationId,
        enrollmentId: student.enrollmentId,
        businessDate,
        recordId: record.id,
        createdAt: new Date(),
      },
    });
    await assert.rejects(
      prisma.exerciseRecordDailySlot.create({
        data: {
          organizationId: fixture.organizationId,
          enrollmentId: student.enrollmentId,
          businessDate,
          recordId: record.id,
          createdAt: new Date(),
        },
      }),
    );
  });

  it('keeps association, daily slot, event, and review histories append-only', async () => {
    const record = await createRecord();
    const media = await createAvailableMedia();
    const association = await prisma.exerciseRecordMedia.create({
      data: {
        organizationId: fixture.organizationId,
        recordId: record.id,
        mediaId: media.id,
        sessionId,
        ownerStudentId: student.studentId,
        position: 1,
        createdAt: new Date(),
      },
    });
    const event = await prisma.exerciseRecordEvent.create({
      data: {
        id: uuidv7(),
        organizationId: fixture.organizationId,
        recordId: record.id,
        eventVersion: 1,
        eventType: 'CREATED',
        fromStatus: null,
        toStatus: 'DRAFT',
        actorUserId: student.userId,
        authSessionId: student.authSessionId,
        requestId: uuidv7(),
        occurredAt: new Date(),
      },
    });
    const review = await prisma.reviewRecord.create({
      data: {
        id: uuidv7(),
        organizationId: fixture.organizationId,
        recordId: record.id,
        reviewVersion: 1,
        result: 'PENDING',
        createdAt: new Date(),
      },
    });
    await assert.rejects(
      prisma.exerciseRecordMedia.delete({ where: { recordId_mediaId: association } }),
    );
    await assert.rejects(prisma.exerciseRecordEvent.delete({ where: { id: event.id } }));
    await assert.rejects(
      prisma.reviewRecord.update({ where: { id: review.id }, data: { result: 'VALID' } }),
    );
    await assert.rejects(prisma.exerciseRecord.delete({ where: { id: record.id } }));
    await assert.rejects(
      prisma.exerciseRecord.update({
        where: { id: record.id },
        data: {
          status: 'SUBMITTED',
          description: 'Forged during submit',
          submittedAt: new Date(),
          version: 2,
        },
      }),
    );
  });
});
