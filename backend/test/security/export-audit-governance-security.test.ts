import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { operationPolicies } from '../../src/generated/operation-policies.generated.js';
import { AuditLogListQueryDto } from '../../src/modules/audit-logs/audit-logs.dto.js';
import { CreateExportRequestDto } from '../../src/modules/exports/exports.dto.js';
import {
  EmailVerificationChallengeRequestDto,
  UpdateStudentRequestDto,
} from '../../src/modules/users/users.dto.js';

describe('Stage 19 Export and audit governance security', () => {
  it('strips forged identity and persistence facts from default-deny DTOs', async () => {
    const current = plainToInstance(EmailVerificationChallengeRequestDto, {
      email: 'synthetic@invalid.test',
      locale: 'en',
      expectedVersion: 1,
      primaryPhone: '+15555555555',
      userId: 'attacker',
      organizationId: 'attacker',
      role: 'ADMIN',
    });
    assert.equal((await validate(current, { whitelist: true })).length, 0);
    for (const forbidden of ['primaryPhone', 'userId', 'organizationId', 'role']) {
      assert.equal(Object.hasOwn(current, forbidden), false);
    }

    const student = plainToInstance(UpdateStudentRequestDto, {
      fullName: 'Synthetic Student',
      expectedVersion: 1,
      studentNumber: '00000000',
      userId: 'attacker',
      organizationId: 'attacker',
      status: 'ACTIVE',
    });
    assert.equal((await validate(student, { whitelist: true })).length, 0);
    for (const forbidden of ['studentNumber', 'userId', 'organizationId', 'status']) {
      assert.equal(Object.hasOwn(student, forbidden), false);
    }

    const exportRequest = plainToInstance(CreateExportRequestDto, {
      exportType: 'AUDIT_LOGS',
      filters: {},
      purpose: 'Synthetic local verification',
      requesterId: 'attacker',
      storageKey: 'private/object',
      status: 'COMPLETED',
    });
    assert.equal((await validate(exportRequest, { whitelist: true })).length, 0);
    assert.deepEqual(Object.keys(exportRequest).sort(), ['exportType', 'filters', 'purpose']);
  });

  it('does not expose arbitrary JSON search and bounds every audit query input', async () => {
    const query = plainToInstance(AuditLogListQueryDto, {
      q: 'synthetic',
      limit: 101,
      sort: 'safeMetadata',
      metadata: { password: 'synthetic-secret' },
      organizationId: 'attacker',
    });
    const errors = await validate(query, { whitelist: true });
    assert.ok(errors.length >= 2);
    assert.equal(Object.hasOwn(query, 'metadata'), false);
    assert.equal(Object.hasOwn(query, 'organizationId'), false);
  });

  it('keeps audit ADMIN-only and all five unresolved mutations fail-closed', () => {
    assert.deepEqual(operationPolicies.listAuditLogs.allowedRoles, ['ADMIN']);
    assert.deepEqual(operationPolicies.getAuditLog.allowedRoles, ['ADMIN']);
    for (const operationId of [
      'updateStudent',
      'listExports',
      'createExport',
      'getExport',
      'createExportDownloadUrl',
    ] as const) {
      assert.equal(operationPolicies[operationId].defaultDeny, true);
    }
  });
});
