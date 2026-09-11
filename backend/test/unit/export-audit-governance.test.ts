import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { projectSafeAuditMetadata } from '../../src/common/audit/audit.service.js';
import { ApplicationError } from '../../src/common/errors/application-error.js';
import { ExportsService } from '../../src/modules/exports/exports.service.js';

const admin = {
  userId: '0198c74b-7dc0-7000-8000-000000000001',
  organizationId: '0198c74b-7dc0-7000-8000-000000000002',
  role: 'ADMIN' as const,
  sessionId: '0198c74b-7dc0-7000-8000-000000000003',
  tokenVersion: 0,
  jti: '0198c74b-7dc0-7000-8000-000000000004',
};

describe('Stage 19 Export and audit governance domain', () => {
  it('keeps every Export use case as an exact no-persistence default deny', () => {
    const service = new ExportsService();
    assert.throws(
      () => service.deny(admin),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === 'SYSTEM_MODE_UNSUPPORTED' &&
        error.status === 503,
    );
  });

  it('projects only action-specific audit metadata and recursively redacts sensitive keys', () => {
    assert.deepEqual(
      projectSafeAuditMetadata('AUTHENTICATION_SUCCEEDED', {
        credentialType: {
          kind: 'PASSWORD',
          accessToken: 'synthetic-secret',
          nested: { email: 'synthetic@invalid.test', safe: true },
        },
        requestBody: { password: 'synthetic-secret' },
      }),
      {
        credentialType: {
          kind: 'PASSWORD',
          accessToken: '[REDACTED]',
          nested: { email: '[REDACTED]', safe: true },
        },
      },
    );
    assert.deepEqual(projectSafeAuditMetadata('UNKNOWN_ACTION', { harmless: true }), {});
  });

  it('bounds arrays, strings, and nesting depth in the public audit projection', () => {
    const projected = projectSafeAuditMetadata('AUDIT_LOG_READ', {
      readKind: 'L'.repeat(600),
      resultCount: Array.from({ length: 60 }, (_, index) => index),
      unknown: 'not projected',
    });
    assert.equal((projected.readKind as string).length, 501);
    assert.equal((projected.resultCount as unknown[]).length, 50);
    assert.equal(Object.hasOwn(projected, 'unknown'), false);
  });
});
