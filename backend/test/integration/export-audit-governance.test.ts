import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';

import { v7 as uuidv7 } from 'uuid';

import { validateEnvironment, type RuntimeConfig } from '../../src/common/config/environment.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  bootstrapFixture,
  STAGING_FIXTURE_AUDIT_ACTION,
  STAGING_FIXTURE_EMAIL,
  STAGING_FIXTURE_PERMISSION_ID,
} from '../../src/tools/staging-health-operator.js';
import {
  createTestPrisma,
  resetFoundationDatabase,
  seedFoundationFixture,
  type FoundationFixture,
} from '../helpers/database.js';
import {
  foundationEnvironment,
  requireTestDatabaseUrl,
  TEST_PASSWORD,
} from '../helpers/test-environment.js';

describe('Stage 19 Export and audit governance PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let fixture: FoundationFixture;

  before(() => {
    prisma = createTestPrisma(requireTestDatabaseUrl());
  });

  beforeEach(async () => {
    await resetFoundationDatabase(prisma);
    fixture = await seedFoundationFixture(prisma);
  });

  it('adds AUDIT_LOG_READ without creating Export persistence', async () => {
    await prisma.auditLog.create({
      data: {
        id: uuidv7(),
        organizationId: fixture.organizationId,
        actorUserId: fixture.adminUserId,
        actorRoleSnapshot: 'ADMIN',
        permissionId: 'AUDIT-LOG-LIST',
        actionType: 'AUDIT_LOG_READ',
        targetType: 'AUDIT_LOG_COLLECTION',
        requestId: uuidv7(),
        outcome: 'SUCCEEDED',
        safeMetadata: { readKind: 'LIST', resultCount: 1 },
        occurredAt: new Date(),
      },
    });
    assert.equal(await prisma.auditLog.count({ where: { actionType: 'AUDIT_LOG_READ' } }), 1);
    const exportTables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name LIKE 'export%'
    `;
    assert.deepEqual(exportTables, []);
  });

  it('accepts the isolated staging fixture bootstrap audit action', async () => {
    const config = validateEnvironment(foundationEnvironment(requireTestDatabaseUrl(), 0))
      .RUNTIME_CONFIG as RuntimeConfig;

    await bootstrapFixture(config, TEST_PASSWORD);
    await bootstrapFixture(config, TEST_PASSWORD);

    assert.equal(
      await prisma.auditLog.count({ where: { actionType: STAGING_FIXTURE_AUDIT_ACTION } }),
      1,
    );
    assert.equal(
      await prisma.auditLog.count({ where: { permissionId: STAGING_FIXTURE_PERMISSION_ID } }),
      1,
    );
    assert.equal(
      await prisma.user.count({ where: { primaryEmailNormalized: STAGING_FIXTURE_EMAIL } }),
      1,
    );
  });

  it('keeps the audit action constraint closed and the append-only trigger effective', async () => {
    const id = uuidv7();
    await prisma.auditLog.create({
      data: {
        id,
        organizationId: fixture.organizationId,
        actorUserId: fixture.adminUserId,
        actorRoleSnapshot: 'ADMIN',
        permissionId: 'AUDIT-LOG-READ',
        actionType: 'AUDIT_LOG_READ',
        targetType: 'AUDIT_LOG',
        targetId: uuidv7(),
        requestId: uuidv7(),
        outcome: 'SUCCEEDED',
        safeMetadata: { readKind: 'GET', resultCount: 1 },
        occurredAt: new Date(),
      },
    });
    await assert.rejects(
      prisma.$executeRawUnsafe(`UPDATE audit_logs SET outcome = 'FAILED' WHERE id = '${id}'::uuid`),
    );
    await assert.rejects(
      prisma.$executeRawUnsafe(`
        INSERT INTO audit_logs (
          id, organization_id, permission_id, action_type, target_type,
          request_id, outcome, safe_metadata, occurred_at
        ) VALUES (
          '${uuidv7()}'::uuid, '${fixture.organizationId}'::uuid, 'INVALID',
          'UNKNOWN_ACTION', 'AUDIT_LOG', '${uuidv7()}', 'SUCCEEDED', '{}'::jsonb, now()
        )
      `),
    );
  });
});
