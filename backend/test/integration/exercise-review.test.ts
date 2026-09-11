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
import { seedSubmittedExerciseRecord } from '../helpers/exercise-review.js';
import { requireTestDatabaseUrl } from '../helpers/test-environment.js';

describe('ExerciseReview PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let fixture: FoundationFixture;

  before(() => {
    prisma = createTestPrisma(requireTestDatabaseUrl());
  });

  beforeEach(async () => {
    await resetFoundationDatabase(prisma);
    fixture = await seedFoundationFixture(prisma);
  });

  it('accepts only an immediate append-only review chain including reopen PENDING reason', async () => {
    const { recordId } = await seedSubmittedExerciseRecord(prisma, fixture, 'CHAIN');
    const first = await prisma.reviewRecord.findFirstOrThrow({ where: { recordId } });
    const decision = await prisma.reviewRecord.create({
      data: {
        id: uuidv7(),
        organizationId: fixture.organizationId,
        recordId,
        reviewVersion: 2,
        previousReviewId: first.id,
        teacherId: fixture.teacherProfileId,
        result: 'VALID',
        reviewedAt: new Date(),
        createdAt: new Date(),
      },
    });
    const reopened = await prisma.reviewRecord.create({
      data: {
        id: uuidv7(),
        organizationId: fixture.organizationId,
        recordId,
        reviewVersion: 3,
        previousReviewId: decision.id,
        result: 'PENDING',
        reason: 'Synthetic correction request',
        createdAt: new Date(),
      },
    });
    assert.equal(reopened.teacherId, null);
    await assert.rejects(
      prisma.reviewRecord.create({
        data: {
          id: uuidv7(),
          organizationId: fixture.organizationId,
          recordId,
          reviewVersion: 5,
          previousReviewId: reopened.id,
          teacherId: fixture.teacherProfileId,
          result: 'VALID',
          reviewedAt: new Date(),
          createdAt: new Date(),
        },
      }),
    );
    await assert.rejects(prisma.reviewRecord.delete({ where: { id: first.id } }));
  });

  it('accepts a system VALID first review and a reviewed-to-reviewed invalidation', async () => {
    const { recordId } = await seedSubmittedExerciseRecord(prisma, fixture, 'AUTO-VALID', 'VALID');
    const first = await prisma.reviewRecord.findFirstOrThrow({ where: { recordId } });
    assert.equal(first.result, 'VALID');
    assert.equal(first.teacherId, null);
    const invalid = await prisma.reviewRecord.create({
      data: {
        id: uuidv7(),
        organizationId: fixture.organizationId,
        recordId,
        reviewVersion: 2,
        previousReviewId: first.id,
        teacherId: fixture.teacherProfileId,
        result: 'INVALID',
        reasonCode: 'INVALID_MEDIA',
        reason: 'Synthetic media mismatch',
        reviewedAt: new Date(),
        createdAt: new Date(),
      },
    });
    assert.equal(invalid.result, 'INVALID');
    const reviewed = await prisma.exerciseRecord.update({
      where: { id: recordId },
      data: { status: 'REVIEWED', version: 3, updatedAt: new Date() },
    });
    assert.equal(reviewed.status, 'REVIEWED');
  });

  it('enforces INVALID reason shape and permanently denies credited override', async () => {
    const { recordId } = await seedSubmittedExerciseRecord(prisma, fixture, 'SHAPE');
    const first = await prisma.reviewRecord.findFirstOrThrow({ where: { recordId } });
    await assert.rejects(
      prisma.reviewRecord.create({
        data: {
          id: uuidv7(),
          organizationId: fixture.organizationId,
          recordId,
          reviewVersion: 2,
          previousReviewId: first.id,
          teacherId: fixture.teacherProfileId,
          result: 'INVALID',
          reviewedAt: new Date(),
          createdAt: new Date(),
        },
      }),
    );
    await assert.rejects(
      prisma.reviewRecord.create({
        data: {
          id: uuidv7(),
          organizationId: fixture.organizationId,
          recordId,
          reviewVersion: 2,
          previousReviewId: first.id,
          teacherId: fixture.teacherProfileId,
          result: 'VALID',
          creditedDurationOverrideSeconds: 3600n,
          reviewedAt: new Date(),
          createdAt: new Date(),
        },
      }),
    );
  });

  it('permits only the Stage 17 review and reopen record transitions', async () => {
    const { recordId } = await seedSubmittedExerciseRecord(prisma, fixture, 'STATE');
    const reviewed = await prisma.exerciseRecord.update({
      where: { id: recordId },
      data: { status: 'REVIEWED', version: 3, updatedAt: new Date() },
    });
    assert.equal(reviewed.status, 'REVIEWED');
    const reopened = await prisma.exerciseRecord.update({
      where: { id: recordId },
      data: { status: 'SUBMITTED', version: 4, updatedAt: new Date() },
    });
    assert.equal(reopened.status, 'SUBMITTED');
    await assert.rejects(
      prisma.exerciseRecord.update({
        where: { id: recordId },
        data: { status: 'CANCELLED', version: 5, updatedAt: new Date() },
      }),
    );
  });

  it('keeps Stage 17 review facts intact after forward-only Score migration', async () => {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('score_rules', 'student_scores', 'score_contributions', 'score_adjustments')
       ORDER BY table_name
    `;
    assert.deepEqual(
      tables.map((item) => item.table_name),
      ['score_adjustments', 'score_contributions', 'score_rules', 'student_scores'],
    );
    const exportTables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'export_jobs'
    `;
    assert.deepEqual(exportTables, []);
  });
});
