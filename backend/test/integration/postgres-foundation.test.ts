import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { v7 as uuidv7 } from 'uuid';

import type { PrismaService } from '../../src/common/database/prisma.service.js';
import type { RuntimeConfig } from '../../src/common/config/environment.js';
import { ApplicationError } from '../../src/common/errors/application-error.js';
import { OutboxService } from '../../src/common/outbox/outbox.service.js';
import { PostgresRateLimitAdapter } from '../../src/common/rate-limit/postgres-rate-limit.adapter.js';
import { SecureDigestService } from '../../src/common/security/secure-digest.service.js';
import { FixedClock } from '../../src/common/time/clock.js';
import { UuidV7Generator } from '../../src/common/time/id-generator.js';
import { foundationMigrations } from '../../src/generated/migration-manifest.generated.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { studentScoreStatusWhere } from '../../src/modules/scores/application/scores.service.js';
import {
  createTestPrisma,
  resetFoundationDatabase,
  seedFoundationFixture,
  type FoundationFixture,
} from '../helpers/database.js';
import { requireTestDatabaseUrl } from '../helpers/test-environment.js';
import { seedExerciseSessionStudent } from '../helpers/exercise-session.js';

describe('PostgreSQL 18 Foundation integration', () => {
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

  it('records every exact finished Greenfield migration and checksum', async () => {
    const rows = await prisma.$queryRaw<
      { migration_name: string; checksum: string; finished_at: Date | null }[]
    >`
      SELECT migration_name, checksum, finished_at
      FROM "_prisma_migrations"
      ORDER BY migration_name
    `;
    assert.equal(rows.length, foundationMigrations.length);
    for (const [index, migration] of foundationMigrations.entries()) {
      assert.equal(rows[index]?.migration_name, migration.migrationId);
      assert.equal(rows[index]?.checksum, migration.sha256);
      assert.notEqual(rows[index]?.finished_at, null);
    }
  });

  it('enforces foreign keys and one CURRENT semester per organization', async () => {
    await assert.rejects(
      prisma.user.create({
        data: {
          id: uuidv7(),
          organizationId: uuidv7(),
          role: 'STUDENT',
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    );
    await assert.rejects(
      prisma.semester.create({
        data: {
          id: uuidv7(),
          organizationId: fixture.organizationId,
          academicYear: '2027-2028',
          termCode: 'FIRST',
          displayName: 'Conflicting Current Semester',
          startDate: new Date('2027-08-01T00:00:00.000Z'),
          endDate: new Date('2028-01-31T00:00:00.000Z'),
          status: 'CURRENT',
          createdBy: fixture.adminUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    );
  });

  it('preserves student-number leading zeros and enforces exactly one role Profile', async () => {
    const studentUserId = uuidv7();
    await prisma.$transaction(async (transaction) => {
      await transaction.user.create({
        data: {
          id: studentUserId,
          organizationId: fixture.organizationId,
          role: 'STUDENT',
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await transaction.studentProfile.create({
        data: {
          id: uuidv7(),
          organizationId: fixture.organizationId,
          userId: studentUserId,
          studentNumber: '00123456',
          fullName: 'Synthetic Student',
          gender: 'OTHER',
          gradeYear: 2026,
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    });
    const profile = await prisma.studentProfile.findUniqueOrThrow({
      where: { userId: studentUserId },
    });
    assert.equal(profile.studentNumber, '00123456');

    await assert.rejects(
      prisma.teacherProfile.create({
        data: {
          id: uuidv7(),
          organizationId: fixture.organizationId,
          userId: studentUserId,
          employeeNumber: 'INVALID-DUAL-PROFILE',
          fullName: 'Invalid Dual Profile',
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    );
  });

  it('enforces mutually exclusive StudentScore status predicates in PostgreSQL', async () => {
    const student = await seedExerciseSessionStudent(prisma, fixture, 'SCORE-STATUS');
    const now = new Date();
    const scoreRuleId = uuidv7();
    await prisma.scoreRule.create({
      data: {
        id: scoreRuleId,
        organizationId: fixture.organizationId,
        classSectionId: fixture.teacherAActiveSectionId,
        semesterId: fixture.semesterId,
        ruleCode: 'STATUS_TEST_V1',
        ruleVersion: 1,
        displayName: 'Synthetic status predicate rule',
        calculationDefinition: { formula: 'synthetic' },
        status: 'ACTIVE',
        createdBy: fixture.adminUserId,
        submittedAt: now,
        activatedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });
    const scoreId = uuidv7();
    await prisma.studentScore.create({
      data: {
        id: scoreId,
        organizationId: fixture.organizationId,
        semesterId: fixture.semesterId,
        classSectionId: fixture.teacherAActiveSectionId,
        studentId: student.studentId,
        enrollmentId: student.enrollmentId,
        createdAt: now,
        updatedAt: now,
      },
    });
    const count = (status: string) =>
      prisma.studentScore.count({
        where: studentScoreStatusWhere(status, prisma.studentScore.fields.publishedRevisionId),
      });
    assert.equal(await count('NOT_CALCULATED'), 1);
    assert.equal(await count('CALCULATED'), 0);

    const revision = async (status: 'CALCULATED' | 'ADJUSTED', calculationRevision: number) => {
      const id = uuidv7();
      await prisma.studentScoreRevision.create({
        data: {
          id,
          organizationId: fixture.organizationId,
          studentScoreId: scoreId,
          scoreRuleId,
          calculationRevision,
          totalValidCreditedSeconds: 3600n,
          scoringSeconds: 3600n,
          excessSeconds: 0n,
          qualificationStatus: 'QUALIFIED',
          calculatedScore: 5,
          adjustedScore: status === 'ADJUSTED' ? 6 : 5,
          finalScore: status === 'ADJUSTED' ? 6 : 5,
          sourceFingerprint: String(calculationRevision).repeat(64),
          status,
          calculatedAt: now,
          createdAt: now,
        },
      });
      await prisma.studentScore.update({
        where: { id: scoreId },
        data: { currentWorkingRevisionId: id, version: { increment: 1 }, updatedAt: now },
      });
      return id;
    };

    await revision('CALCULATED', 1);
    assert.equal(await count('NOT_CALCULATED'), 0);
    assert.equal(await count('CALCULATED'), 1);
    assert.equal(await count('PUBLISHED'), 0);
    const adjustedRevisionId = await revision('ADJUSTED', 2);
    assert.equal(await count('CALCULATED'), 0);
    assert.equal(await count('ADJUSTED'), 1);
    await prisma.studentScore.update({
      where: { id: scoreId },
      data: { publishedRevisionId: adjustedRevisionId, version: { increment: 1 }, updatedAt: now },
    });
    assert.equal(await count('ADJUSTED'), 0);
    assert.equal(await count('PUBLISHED'), 1);
    assert.equal(await count('LOCKED'), 0);
  });

  it('keeps AuditLog append-only at the database boundary', async () => {
    const auditId = uuidv7();
    await prisma.auditLog.create({
      data: {
        id: auditId,
        organizationId: fixture.organizationId,
        actorUserId: fixture.adminUserId,
        actorRoleSnapshot: 'ADMIN',
        permissionId: 'AUTH-LOGOUT',
        actionType: 'AUTH_SESSION_REVOKED',
        targetType: 'USER',
        targetId: fixture.adminUserId,
        requestId: 'req-integration',
        outcome: 'SUCCEEDED',
        safeMetadata: { revokeSource: 'LOGOUT' },
        occurredAt: new Date(),
      },
    });
    await assert.rejects(
      prisma.$executeRaw`UPDATE audit_logs SET outcome = 'FAILED' WHERE id = ${auditId}::uuid`,
    );
    await assert.rejects(prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${auditId}::uuid`);
    assert.equal(await prisma.auditLog.count({ where: { id: auditId } }), 1);
  });

  it('claims Outbox rows concurrently without duplicate ownership', async () => {
    const now = new Date('2026-08-02T12:00:00.000Z');
    await prisma.outboxEvent.createMany({
      data: Array.from({ length: 6 }, (_unused, index) => ({
        id: uuidv7(),
        organizationId: fixture.organizationId,
        aggregateType: 'User',
        aggregateId: fixture.teacherUserId,
        eventType: 'SYNTHETIC_INTEGRATION_EVENT',
        eventVersion: index + 1,
        payload: { sequence: index + 1 },
        status: 'PENDING',
        availableAt: now,
        createdAt: now,
      })),
    });
    const outbox = new OutboxService(
      prisma as unknown as PrismaService,
      new FixedClock(now),
      new UuidV7Generator(),
    );
    const [left, right] = await Promise.all([
      outbox.claimBatch('worker-left', 3),
      outbox.claimBatch('worker-right', 3),
    ]);
    assert.equal(left.length + right.length, 6);
    const ids = [...left, ...right].map(({ id }) => id);
    assert.equal(new Set(ids).size, 6);
  });

  it('enforces shared rate-limit windows atomically across concurrent consumers', async () => {
    const clock = new FixedClock(new Date('2026-08-02T12:00:00.000Z'));
    const limiter = new PostgresRateLimitAdapter(
      prisma as unknown as PrismaService,
      new SecureDigestService({ securityHashKey: 's'.repeat(32) } as RuntimeConfig),
      clock,
    );
    const request = {
      purpose: 'AUTHENTICATION' as const,
      keys: ['synthetic-account'],
      windowSeconds: 60,
      maximumAttempts: 3,
    };
    const decisions = await Promise.all(Array.from({ length: 4 }, () => limiter.consume(request)));
    assert.equal(decisions.filter(({ allowed }) => allowed).length, 3);
    assert.equal(decisions.filter(({ allowed }) => !allowed).length, 1);
    assert.equal((await prisma.rateLimitWindow.findFirstOrThrow()).count, 4);

    clock.advanceMilliseconds(60_000);
    assert.equal((await limiter.consume(request)).allowed, true);
    assert.equal((await prisma.rateLimitWindow.findFirstOrThrow()).count, 1);
  });

  it('persists SystemMode, rejects unknown values, and rolls transactions back', async () => {
    await prisma.systemPolicy.update({
      where: { organizationId: fixture.organizationId },
      data: {
        systemMode: 'MAINTENANCE',
        version: { increment: 1 },
        changeReason: 'Synthetic integration transition',
        updatedAt: new Date(),
      },
    });
    assert.equal(
      (
        await prisma.systemPolicy.findUniqueOrThrow({
          where: { organizationId: fixture.organizationId },
        })
      ).systemMode,
      'MAINTENANCE',
    );
    await assert.rejects(
      prisma.systemPolicy.update({
        where: { organizationId: fixture.organizationId },
        data: { systemMode: 'UNKNOWN_MODE' },
      }),
    );
    await assert.rejects(prisma.systemPolicy.update({
      where: { organizationId: fixture.organizationId }, data: { systemMode: 'READ_ONLY' },
    }));

    const rollbackOrganizationId = uuidv7();
    await assert.rejects(
      prisma.$transaction(async (transaction) => {
        await transaction.organization.create({
          data: {
            id: rollbackOrganizationId,
            organizationCode: 'ROLLBACK-TEST',
            legalName: 'Synthetic Rollback Test',
            displayName: 'Synthetic Rollback',
            timezone: 'Asia/Shanghai',
            defaultLocale: 'zh-CN',
            status: 'ACTIVE',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        throw new ApplicationError('SYSTEM_INTERNAL_ERROR', 500);
      }),
    );
    assert.equal(await prisma.organization.count({ where: { id: rollbackOrganizationId } }), 0);
  });
});
