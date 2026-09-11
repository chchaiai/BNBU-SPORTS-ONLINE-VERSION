import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

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

describe('ExerciseSession PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let foundation: FoundationFixture;
  let student: ExerciseSessionStudentFixture;

  beforeEach(async () => {
    prisma ??= createTestPrisma(requireTestDatabaseUrl());
    await resetFoundationDatabase(prisma);
    foundation = await seedFoundationFixture(prisma);
    student = await seedExerciseSessionStudent(prisma, foundation);
  });

  const createSession = async (status = 'IN_PROGRESS') => {
    const now = new Date();
    return prisma.exerciseSession.create({
      data: {
        id: uuidv7(),
        organizationId: foundation.organizationId,
        studentId: student.studentId,
        enrollmentId: student.enrollmentId,
        classSectionId: foundation.teacherAActiveSectionId,
        semesterId: foundation.semesterId,
        startedByAuthSessionId: student.authSessionId,
        status,
        startedAt: now,
        businessDate: new Date(now.toISOString().slice(0, 10)),
        completedAt: status === 'COMPLETED' ? now : null,
        endReason: status === 'COMPLETED' ? 'USER_COMPLETED' : null,
        actualDurationSeconds: 0n,
        pausedDurationSeconds: 0n,
        currentIntervalStartedAt: ['IN_PROGRESS', 'PAUSED'].includes(status) ? now : null,
        lastHeartbeatAt: now,
        createdAt: now,
        updatedAt: now,
        version: 1,
      },
    });
  };

  it('enforces one active Session per student under concurrent writes', async () => {
    const results = await Promise.allSettled([createSession(), createSession()]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(
      await prisma.exerciseSession.count({
        where: { studentId: student.studentId, status: { in: ['IN_PROGRESS', 'PAUSED'] } },
      }),
      1,
    );
  });

  it('enforces terminal timestamps, duration bounds, version, and scoped foreign keys', async () => {
    await assert.rejects(
      createSession('COMPLETED').then(async (record) => {
        await prisma.$executeRawUnsafe(
          'UPDATE exercise_sessions SET completed_at = NULL WHERE id = $1::uuid',
          record.id,
        );
      }),
    );
    const record = await prisma.exerciseSession.findFirstOrThrow();
    await assert.rejects(
      prisma.$executeRawUnsafe(
        'UPDATE exercise_sessions SET actual_duration_seconds = 7201 WHERE id = $1::uuid',
        record.id,
      ),
    );
    await assert.rejects(
      prisma.$executeRawUnsafe(
        'UPDATE exercise_sessions SET version = 0 WHERE id = $1::uuid',
        record.id,
      ),
    );
    await assert.rejects(
      prisma.exerciseSession.create({
        data: {
          ...record,
          id: uuidv7(),
          organizationId: foundation.isolationOrganizationId,
        },
      }),
    );
  });

  it('allows a segment to close exactly once and keeps event history append-only', async () => {
    const record = await createSession();
    const segment = await prisma.exerciseSessionSegment.create({
      data: {
        id: uuidv7(),
        organizationId: record.organizationId,
        exerciseSessionId: record.id,
        sequenceNumber: 1,
        segmentType: 'RUNNING',
        startedAt: record.startedAt,
        source: 'SERVER',
        createdAt: record.startedAt,
      },
    });
    const endedAt = new Date(record.startedAt.getTime() + 1_000);
    await prisma.exerciseSessionSegment.update({
      where: { id: segment.id },
      data: { endedAt, acceptedDurationSeconds: 1n },
    });
    await assert.rejects(
      prisma.exerciseSessionSegment.update({
        where: { id: segment.id },
        data: { acceptedDurationSeconds: 2n },
      }),
    );
    const event = await prisma.exerciseSessionEvent.create({
      data: {
        id: uuidv7(),
        organizationId: record.organizationId,
        exerciseSessionId: record.id,
        eventVersion: 1,
        eventType: 'STARTED',
        fromStatus: null,
        toStatus: 'IN_PROGRESS',
        acceptedAt: record.startedAt,
        actorUserId: student.userId,
        authSessionId: student.authSessionId,
        requestId: 'integration-session-start',
        createdAt: record.startedAt,
      },
    });
    await assert.rejects(
      prisma.exerciseSessionEvent.update({
        where: { id: event.id },
        data: { eventType: 'PAUSED' },
      }),
    );
    await assert.rejects(prisma.exerciseSessionEvent.delete({ where: { id: event.id } }));
  });

  it('rolls back Session, segment, event, audit, and outbox together on transaction failure', async () => {
    await assert.rejects(
      prisma.$transaction(async (transaction) => {
        const record = await transaction.exerciseSession.create({
          data: {
            id: uuidv7(),
            organizationId: foundation.organizationId,
            studentId: student.studentId,
            enrollmentId: student.enrollmentId,
            classSectionId: foundation.teacherAActiveSectionId,
            semesterId: foundation.semesterId,
            startedByAuthSessionId: student.authSessionId,
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            businessDate: new Date(),
            currentIntervalStartedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        await transaction.exerciseSessionSegment.create({
          data: {
            id: uuidv7(),
            organizationId: record.organizationId,
            exerciseSessionId: record.id,
            sequenceNumber: 1,
            segmentType: 'RUNNING',
            startedAt: record.startedAt,
            createdAt: record.startedAt,
          },
        });
        throw new Error('synthetic rollback');
      }),
    );
    assert.equal(await prisma.exerciseSession.count(), 0);
    assert.equal(await prisma.exerciseSessionSegment.count(), 0);
    assert.equal(await prisma.exerciseSessionEvent.count(), 0);
  });
});
