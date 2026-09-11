import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';

import { v7 as uuidv7 } from 'uuid';

import { Prisma, type PrismaClient } from '../../src/generated/prisma/client.js';
import {
  createTestPrisma,
  resetFoundationDatabase,
  seedFoundationFixture,
  type FoundationFixture,
} from '../helpers/database.js';
import { seedExerciseSessionStudent } from '../helpers/exercise-session.js';
import { requireTestDatabaseUrl } from '../helpers/test-environment.js';

describe('Stage 18 Score PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let fixture: FoundationFixture;

  before(() => {
    prisma = createTestPrisma(requireTestDatabaseUrl());
  });

  beforeEach(async () => {
    await resetFoundationDatabase(prisma);
    fixture = await seedFoundationFixture(prisma);
  });

  const createRule = async (status: 'DRAFT' | 'ACTIVE' = 'DRAFT') => {
    const now = new Date();
    return prisma.scoreRule.create({
      data: {
        id: uuidv7(),
        organizationId: fixture.organizationId,
        classSectionId: fixture.teacherAActiveSectionId,
        semesterId: fixture.semesterId,
        ruleCode: `FIXED_${uuidv7().slice(0, 8).toUpperCase()}`,
        ruleVersion: (await prisma.scoreRule.count()) + 1,
        displayName: 'Synthetic fixed score rule',
        totalRequiredSeconds: 72_000n,
        calculationDefinition: {
          formulaType: 'LINEAR_CAPPED',
          maximumScore: 100,
          categoryAllocationMode: 'TOTAL_ONLY',
        },
        roundingMode: 'HALF_UP',
        roundingScale: 2,
        status,
        createdBy: fixture.adminUserId,
        submittedAt: status === 'ACTIVE' ? now : null,
        activatedAt: status === 'ACTIVE' ? now : null,
        createdAt: now,
        updatedAt: now,
      },
    });
  };

  it('creates exactly the nine 0009 tables while leaving Export absent', async () => {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name LIKE 'score_%'
          OR table_schema = 'public' AND table_name = 'student_scores'
       ORDER BY table_name
    `;
    assert.deepEqual(
      rows.map((row) => row.table_name),
      [
        'score_adjustment_approval_events',
        'score_adjustments',
        'score_contributions',
        'score_publication_events',
        'score_recalculation_attempts',
        'score_rule_approval_events',
        'score_rules',
        'student_scores',
      ],
    );
    const revisions = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'student_score_revisions'
      ) AS exists
    `;
    assert.equal(revisions[0]?.exists, true);
    assert.equal(
      await prisma
        .$queryRawUnsafe<unknown[]>(
          "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'export_jobs'",
        )
        .then((result) => result.length),
      0,
    );
  });

  it('enforces one ACTIVE rule and protects the frozen rule definition', async () => {
    const active = await createRule('ACTIVE');
    await assert.rejects(createRule('ACTIVE'));
    await assert.rejects(
      prisma.scoreRule.update({
        where: { id: active.id },
        data: { totalRequiredSeconds: 1n, updatedAt: new Date() },
      }),
    );
  });

  it('keeps approvals and score revisions append-only and source-idempotent', async () => {
    const student = await seedExerciseSessionStudent(prisma, fixture, 'SCORE-INT');
    const rule = await createRule();
    const now = new Date();
    const approval = await prisma.scoreRuleApprovalEvent.create({
      data: {
        id: uuidv7(),
        organizationId: fixture.organizationId,
        scoreRuleId: rule.id,
        action: 'APPROVE',
        actorUserId: fixture.teacherBUserId,
        requestId: uuidv7(),
        createdAt: now,
      },
    });
    await assert.rejects(
      prisma.scoreRuleApprovalEvent.update({
        where: { id: approval.id },
        data: { reason: 'Mutation denied' },
      }),
    );
    await assert.rejects(prisma.scoreRuleApprovalEvent.delete({ where: { id: approval.id } }));

    const score = await prisma.studentScore.create({
      data: {
        id: uuidv7(),
        organizationId: fixture.organizationId,
        semesterId: fixture.semesterId,
        classSectionId: fixture.teacherAActiveSectionId,
        studentId: student.studentId,
        enrollmentId: student.enrollmentId,
        createdAt: now,
        updatedAt: now,
      },
    });
    const revision = await prisma.studentScoreRevision.create({
      data: {
        id: uuidv7(),
        organizationId: fixture.organizationId,
        studentScoreId: score.id,
        scoreRuleId: rule.id,
        calculationRevision: 1,
        totalValidCreditedSeconds: 3600n,
        scoringSeconds: 3600n,
        excessSeconds: 0n,
        qualificationStatus: 'NOT_QUALIFIED',
        calculatedScore: new Prisma.Decimal('5.00'),
        adjustedScore: new Prisma.Decimal('5.00'),
        finalScore: new Prisma.Decimal('5.00'),
        sourceFingerprint: 'a'.repeat(64),
        status: 'CALCULATED',
        calculatedAt: now,
        createdAt: now,
      },
    });
    await assert.rejects(
      prisma.studentScoreRevision.update({
        where: { id: revision.id },
        data: { finalScore: new Prisma.Decimal('6.00') },
      }),
    );
    await assert.rejects(prisma.studentScoreRevision.delete({ where: { id: revision.id } }));
    await assert.rejects(
      prisma.studentScoreRevision.create({
        data: {
          ...revision,
          id: uuidv7(),
          calculationRevision: 2,
        },
      }),
    );
  });
});
