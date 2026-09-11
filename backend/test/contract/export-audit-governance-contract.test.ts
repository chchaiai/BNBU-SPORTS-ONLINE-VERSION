import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { parse } from 'yaml';

import { OPERATION_ID_METADATA } from '../../src/common/policy/operation-policy.decorator.js';
import { operationPolicies } from '../../src/generated/operation-policies.generated.js';
import { AuditLogsController } from '../../src/modules/audit-logs/audit-logs.controller.js';
import { ExportsController } from '../../src/modules/exports/exports.controller.js';
import { ProfilesController } from '../../src/modules/users/profiles.controller.js';

type JsonObject = Record<string, unknown>;

function object(value: unknown, label: string): JsonObject {
  assert.equal(typeof value, 'object', `${label} must be an object`);
  assert.notEqual(value, null, `${label} must not be null`);
  assert.equal(Array.isArray(value), false, `${label} must not be an array`);
  return value as JsonObject;
}

const contract = object(
  parse(
    readFileSync(new URL('../../../docs/backend-contracts/openapi.yaml', import.meta.url), 'utf8'),
  ),
  'OpenAPI',
);

describe('Stage 19 Export, Audit Read, and governance contract', () => {
  const operations = [
    ['/students', 'get', 'listStudents', ProfilesController, 'listStudents'],
    ['/students/{studentId}', 'get', 'getStudent', ProfilesController, 'getStudent'],
    ['/students/{studentId}', 'patch', 'updateStudent', ProfilesController, 'updateStudent'],
    ['/teachers/{teacherId}', 'get', 'getTeacher', ProfilesController, 'getTeacher'],
    ['/exports', 'get', 'listExports', ExportsController, 'list'],
    ['/exports', 'post', 'createExport', ExportsController, 'create'],
    ['/exports/{exportId}', 'get', 'getExport', ExportsController, 'get'],
    [
      '/exports/{exportId}/download-url',
      'post',
      'createExportDownloadUrl',
      ExportsController,
      'download',
    ],
    ['/audit-logs', 'get', 'listAuditLogs', AuditLogsController, 'list'],
    ['/audit-logs/{auditLogId}', 'get', 'getAuditLog', AuditLogsController, 'get'],
  ] as const;

  it('binds all ten remaining operations to real handlers and generated policy', () => {
    const paths = object(contract.paths, 'paths');
    for (const [path, method, operationId, controller, handlerName] of operations) {
      const operation = object(object(paths[path], path)[method], operationId);
      assert.equal(operation.operationId, operationId);
      assert.equal(object(operation['x-access-policy'], `${operationId} policy`).defaultDeny, true);
      assert.ok(operationPolicies[operationId]);
      const handler: unknown = Object.getOwnPropertyDescriptor(
        controller.prototype,
        handlerName,
      )?.value;
      assert.equal(typeof handler, 'function');
      assert.equal(Reflect.getMetadata(OPERATION_ID_METADATA, handler as object), operationId);
    }
  });

  it('freezes the five exact default-deny operations without fake Export persistence', () => {
    const paths = object(contract.paths, 'paths');
    for (const [path, method, operationId] of operations.filter(([, , operationId]) =>
      [
        'updateStudent',
        'listExports',
        'createExport',
        'getExport',
        'createExportDownloadUrl',
      ].includes(operationId),
    )) {
      const operation = object(object(paths[path], path)[method], operationId);
      assert.equal(operation['x-default-deny-error'], 'SYSTEM_MODE_UNSUPPORTED');
    }
    const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
    assert.equal(/model\s+Export(?:Job)?\b/u.test(schema), false);
  });

  it('keeps the expanded operation registry closed without upgrading Export or Production gates', () => {
    const coverage = JSON.parse(
      readFileSync(new URL('../../runtime-coverage.manifest.json', import.meta.url), 'utf8'),
    ) as { implemented: Record<string, unknown>; implementedDefaultDeny: string[] };
    assert.equal(Object.keys(coverage.implemented).length, 126);
    assert.equal(coverage.implementedDefaultDeny.length, 17);
    for (const operationId of Object.keys(operationPolicies)) {
      assert.ok(coverage.implemented[operationId]);
    }
    assert.equal(JSON.stringify(contract).includes('AUDIT_LOG_READ'), true);
  });
});
