import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';

import { v7 as uuidv7 } from 'uuid';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
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

describe('MediaEvidence PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let fixture: FoundationFixture;
  let student: ExerciseSessionStudentFixture;
  let sessionId: string;

  before(() => {
    prisma = createTestPrisma(requireTestDatabaseUrl());
  });

  beforeEach(async () => {
    await resetFoundationDatabase(prisma);
    fixture = await seedFoundationFixture(prisma);
    student = await seedExerciseSessionStudent(prisma, fixture, 'MEDIA');
    sessionId = uuidv7();
    const now = new Date();
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
        businessDate: now,
        completedAt: now,
        endReason: 'USER_COMPLETED',
        actualDurationSeconds: 3600n,
        pausedDurationSeconds: 0n,
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  const createMedia = async (mediaType: 'IMAGE' | 'VIDEO', suffix: string) => {
    const now = new Date();
    return prisma.mediaEvidence.create({
      data: {
        id: uuidv7(),
        organizationId: fixture.organizationId,
        ownerStudentId: student.studentId,
        sessionId,
        initiatedByUserId: student.userId,
        businessPurpose: 'EXERCISE_RECORD',
        mediaType,
        captureSource: 'IN_APP_CAMERA',
        declaredMimeType: mediaType === 'IMAGE' ? 'image/png' : 'video/mp4',
        declaredFileSizeBytes: 45n,
        declaredDurationSeconds: mediaType === 'VIDEO' ? 5 : null,
        uploadStatus: 'PENDING_UPLOAD',
        storageKey: `media/${fixture.organizationId}/${uuidv7()}/${mediaType.toLowerCase()}-${suffix}`,
        createdAt: now,
        updatedAt: now,
      },
    });
  };

  it('installs four scoped tables, immutable facts, and append-only histories', async () => {
    const names = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name
        FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name LIKE 'media_%'
       ORDER BY table_name
    `;
    assert.deepEqual(
      names.map((row) => row.table_name),
      [
        'media_evidence',
        'media_processing_attempts',
        'media_status_events',
        'media_upload_sessions',
      ],
    );
    const media = await createMedia('IMAGE', 'history');
    await prisma.mediaStatusEvent.create({
      data: {
        id: uuidv7(),
        organizationId: media.organizationId,
        mediaId: media.id,
        eventVersion: 1,
        eventType: 'INITIATED',
        fromStatus: null,
        toStatus: 'PENDING_UPLOAD',
        actorType: 'USER',
        actorUserId: student.userId,
        requestId: uuidv7(),
        occurredAt: new Date(),
      },
    });
    await assert.rejects(
      prisma.mediaStatusEvent.update({
        where: { mediaId_eventVersion: { mediaId: media.id, eventVersion: 1 } },
        data: { eventType: 'FAILED' },
      }),
    );
    await prisma.mediaProcessingAttempt.create({
      data: {
        id: uuidv7(),
        organizationId: media.organizationId,
        mediaId: media.id,
        attemptNumber: 1,
        phase: 'STARTED',
        workerId: 'synthetic-worker',
        scannerMode: 'TEST_SIGNATURE',
        occurredAt: new Date(),
      },
    });
    await assert.rejects(
      prisma.mediaProcessingAttempt.deleteMany({ where: { mediaId: media.id } }),
    );
    await assert.rejects(
      prisma.mediaEvidence.update({
        where: { id: media.id },
        data: {
          storageKey: `media/${fixture.organizationId}/${uuidv7()}/image-forged`,
          version: 2,
        },
      }),
    );
  });

  it('enforces active 6-image and 1-video quotas under database serialization', async () => {
    for (let index = 0; index < 6; index += 1) await createMedia('IMAGE', String(index));
    await assert.rejects(createMedia('IMAGE', 'seventh'));
    await createMedia('VIDEO', 'first');
    await assert.rejects(createMedia('VIDEO', 'second'));
    const failed = await createMedia('IMAGE', 'failed-replacement').catch(() => null);
    assert.equal(failed, null);
    const first = await prisma.mediaEvidence.findFirstOrThrow({
      where: { sessionId, mediaType: 'IMAGE' },
    });
    await prisma.mediaEvidence.update({
      where: { id: first.id },
      data: {
        uploadStatus: 'FAILED',
        failedAt: new Date(),
        failureCode: 'MEDIA_INTEGRITY_MISMATCH',
        updatedAt: new Date(),
        version: 2,
      },
    });
    assert.ok(await createMedia('IMAGE', 'replacement'));
  });

  it('persists the monotonic confirmed, bound, processing, and available lifecycle', async () => {
    const media = await createMedia('IMAGE', 'lifecycle');
    const uploadId = uuidv7();
    const now = new Date();
    await prisma.mediaUploadSession.create({
      data: {
        id: uploadId,
        organizationId: media.organizationId,
        mediaId: media.id,
        status: 'ACTIVE',
        capabilityExpiresAt: new Date(now.getTime() + 300_000),
        createdAt: now,
        updatedAt: now,
      },
    });
    const digest = 'a'.repeat(64);
    const uploaded = await prisma.mediaEvidence.update({
      where: { id: media.id },
      data: {
        verifiedMimeType: 'image/png',
        verifiedFileSizeBytes: 45n,
        verifiedContentSha256: digest,
        uploadStatus: 'UPLOADED',
        uploadedAt: now,
        updatedAt: now,
        version: 2,
      },
    });
    await prisma.mediaUploadSession.update({
      where: { id: uploadId },
      data: {
        status: 'CONFIRMED',
        clientEntityTag: 'synthetic-etag',
        observedEntityTag: 'synthetic-etag',
        observedFileSizeBytes: 45n,
        confirmedAt: now,
        updatedAt: now,
        version: 2,
      },
    });
    const bound = await prisma.mediaEvidence.update({
      where: { id: media.id },
      data: { uploadStatus: 'BOUND', boundAt: now, updatedAt: now, version: 3 },
    });
    const processing = await prisma.mediaEvidence.update({
      where: { id: media.id },
      data: {
        uploadStatus: 'PROCESSING',
        processingStartedAt: now,
        updatedAt: now,
        version: 4,
      },
    });
    const available = await prisma.mediaEvidence.update({
      where: { id: media.id },
      data: { uploadStatus: 'AVAILABLE', availableAt: now, updatedAt: now, version: 5 },
    });
    assert.deepEqual(
      [uploaded.uploadStatus, bound.uploadStatus, processing.uploadStatus, available.uploadStatus],
      ['UPLOADED', 'BOUND', 'PROCESSING', 'AVAILABLE'],
    );
    await assert.rejects(
      prisma.mediaEvidence.update({
        where: { id: media.id },
        data: { uploadStatus: 'BOUND', availableAt: null, updatedAt: now, version: 6 },
      }),
    );
  });
});
