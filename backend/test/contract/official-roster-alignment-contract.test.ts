import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { parse } from 'yaml';

import type { FoundationErrorCode } from '../../src/common/errors/application-error.js';
import { OPERATION_ID_METADATA } from '../../src/common/policy/operation-policy.decorator.js';
import { operationPolicies } from '../../src/generated/operation-policies.generated.js';
import { RosterController } from '../../src/modules/roster/interface/http/roster.controller.js';

type JsonObject = Record<string, unknown>;

function object(value: unknown, label: string): JsonObject {
  assert.equal(typeof value, 'object', `${label} must be an object`);
  assert.notEqual(value, null, `${label} must be an object`);
  assert.equal(Array.isArray(value), false, `${label} must be an object`);
  return value as JsonObject;
}

async function contract(): Promise<JsonObject> {
  return parse(
    await readFile(
      new URL('../../../docs/backend-contracts/openapi.yaml', import.meta.url),
      'utf8',
    ),
  ) as JsonObject;
}

function operation(root: JsonObject, path: string, method: 'get' | 'post'): JsonObject {
  return object(object(object(root.paths, 'paths')[path], path)[method], `${method} ${path}`);
}

const ROSTER_ERRORS = [
  'ROSTER_IMPORT_NOT_FOUND',
  'ROSTER_FILE_INVALID',
  'ROSTER_SCHEMA_INVALID',
  'ROSTER_IMPORT_DUPLICATE',
  'ROSTER_IMPORT_NOT_READY',
  'ROSTER_IMPORT_FAILED',
  'ROSTER_IMPORT_SOURCE_UNSUPPORTED',
  'ROSTER_ALIGNMENT_IN_PROGRESS',
  'ROSTER_ALIGNMENT_SNAPSHOT_STALE',
  'ROSTER_ALIGNMENT_INPUT_VERSION_CONFLICT',
  'ROSTER_ALIGNMENT_EXCEPTION',
  'ROSTER_RESOLUTION_INVALID',
  'ROSTER_ALIGNMENT_RESULT_SUPERSEDED',
  'ROSTER_IGNORE_NOT_ALLOWED',
  'ROSTER_RESOLUTION_EVIDENCE_REQUIRED',
] as const satisfies readonly FoundationErrorCode[];

describe('Stage 13 Official Roster and Alignment contract', () => {
  it('freezes all thirteen operations, role scopes, resolvers, and Controller bindings', async () => {
    const root = await contract();
    const expected = [
      [
        '/class-sections/{classSectionId}/roster-imports',
        'get',
        'listRosterImports',
        'listImports',
        ['TEACHER', 'ADMIN'],
        'ROLE_SCOPED',
        'ROSTER_CLASS_SECTION_READ_SCOPE',
      ],
      [
        '/class-sections/{classSectionId}/roster-imports',
        'post',
        'createRosterImport',
        'createImport',
        ['TEACHER'],
        'TEACHER_CLASS_SECTION',
        'CLASS_SECTION_FROM_PATH',
      ],
      [
        '/class-sections/{classSectionId}/roster-imports/current',
        'get',
        'getCurrentRosterImport',
        'currentImport',
        ['TEACHER', 'ADMIN'],
        'ROLE_SCOPED',
        'ROSTER_CLASS_SECTION_READ_SCOPE',
      ],
      [
        '/roster-imports/{rosterImportId}',
        'get',
        'getRosterImport',
        'getImport',
        ['TEACHER', 'ADMIN'],
        'ROLE_SCOPED',
        'ROSTER_IMPORT_READ_SCOPE',
      ],
      [
        '/roster-imports/{rosterImportId}/rollback',
        'post',
        'rollbackRosterImport',
        'rollbackImport',
        ['TEACHER'],
        'TEACHER_CLASS_SECTION',
        'ROSTER_IMPORT_FROM_PATH',
      ],
      [
        '/roster-imports/{rosterImportId}/entries',
        'get',
        'listRosterEntries',
        'listEntries',
        ['TEACHER', 'ADMIN'],
        'ROLE_SCOPED',
        'ROSTER_IMPORT_READ_SCOPE',
      ],
      [
        '/roster-imports/{rosterImportId}/align',
        'post',
        'alignRosterImport',
        'alignImport',
        ['TEACHER'],
        'TEACHER_CLASS_SECTION',
        'ROSTER_IMPORT_FROM_PATH',
      ],
      [
        '/roster-alignment-results',
        'get',
        'listRosterAlignmentResults',
        'listResults',
        ['TEACHER', 'ADMIN'],
        'ROLE_SCOPED',
        'ROSTER_ALIGNMENT_LIST_SCOPE',
      ],
      [
        '/roster-alignment-results/{alignmentResultId}',
        'get',
        'getRosterAlignmentResult',
        'getResult',
        ['TEACHER', 'ADMIN'],
        'ROLE_SCOPED',
        'ROSTER_ALIGNMENT_READ_SCOPE',
      ],
      [
        '/roster-alignment-results/{alignmentResultId}/confirm',
        'post',
        'confirmRosterAlignmentResult',
        'confirmResult',
        ['TEACHER'],
        'TEACHER_CLASS_SECTION',
        'ROSTER_ALIGNMENT_FROM_PATH',
      ],
      [
        '/roster-alignment-results/{alignmentResultId}/resolve',
        'post',
        'resolveRosterAlignmentResult',
        'resolveResult',
        ['TEACHER'],
        'TEACHER_CLASS_SECTION',
        'ROSTER_ALIGNMENT_FROM_PATH',
      ],
      [
        '/roster-alignment-results/{alignmentResultId}/ignore',
        'post',
        'ignoreRosterAlignmentResult',
        'ignoreResult',
        ['TEACHER'],
        'TEACHER_CLASS_SECTION',
        'ROSTER_ALIGNMENT_FROM_PATH',
      ],
      [
        '/roster-alignment-results/{alignmentResultId}/reopen',
        'post',
        'reopenRosterAlignmentResult',
        'reopenResult',
        ['TEACHER'],
        'TEACHER_CLASS_SECTION',
        'ROSTER_ALIGNMENT_FROM_PATH',
      ],
    ] as const;

    for (const [path, method, operationId, controllerMethod, roles, scope, resolver] of expected) {
      const candidate = operation(root, path, method);
      const policy = object(candidate['x-access-policy'], `${operationId} policy`);
      assert.equal(candidate.operationId, operationId);
      assert.equal(policy.authentication, 'ACCESS_TOKEN');
      assert.deepEqual(policy.allowedRoles, roles);
      assert.equal(policy.organizationScope, 'PRINCIPAL_ORGANIZATION');
      assert.equal(policy.resourceScope, scope);
      assert.equal(policy.resourceResolver, resolver);
      assert.equal(policy.defaultDeny, true);
      assert.deepEqual(operationPolicies[operationId], {
        method: method.toUpperCase(),
        route: path,
        policyId: policy.policyId,
        authentication: policy.authentication,
        allowedRoles: roles,
        organizationScope: policy.organizationScope,
        resourceScope: scope,
        resourceResolver: resolver,
        defaultDeny: true,
      });
      const handler = object(RosterController.prototype, 'RosterController prototype')[
        controllerMethod
      ];
      assert.equal(Reflect.getMetadata(OPERATION_ID_METADATA, handler as object), operationId);
    }

    let operationCount = 0;
    for (const pathItem of Object.values(object(root.paths, 'paths'))) {
      for (const method of Object.keys(object(pathItem, 'path item'))) {
        if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) {
          operationCount += 1;
        }
      }
    }
    assert.equal(expected.length, 13);
    assert.equal(operationCount, 126);
    assert.equal(Object.keys(operationPolicies).length, 126);
  });

  it('freezes CSV-only upload, server snapshot versioning, and typed resolution evidence', async () => {
    const root = await contract();
    const schemas = object(object(root.components, 'components').schemas, 'schemas');
    const create = operation(root, '/class-sections/{classSectionId}/roster-imports', 'post');
    const multipart = object(
      object(object(create.requestBody, 'create requestBody').content, 'create content')[
        'multipart/form-data'
      ],
      'multipart/form-data',
    );
    assert.equal(object(create.requestBody, 'create requestBody').required, true);
    assert.equal(
      object(object(multipart.encoding, 'encoding').file, 'file encoding').contentType,
      'text/csv',
    );
    assert.deepEqual(object(schemas.RosterFileFormat, 'RosterFileFormat').enum, ['CSV']);
    assert.deepEqual(object(schemas.RosterImportSource, 'RosterImportSource').enum, [
      'FILE',
      'OFFICIAL_API',
    ]);
    assert.deepEqual(object(schemas.CreateRosterImportRequest, 'create schema').required, [
      'source',
      'fileFormat',
      'file',
      'fieldMappingSnapshot',
    ]);

    const align = operation(root, '/roster-imports/{rosterImportId}/align', 'post');
    assert.equal(object(align.requestBody, 'align requestBody').required, true);
    assert.deepEqual(object(schemas.RunAlignmentRequest, 'RunAlignmentRequest').required, [
      'expectedRosterImportVersion',
    ]);
    assert.deepEqual(object(schemas.ResolveAlignmentRequest, 'ResolveAlignmentRequest').required, [
      'resolutionNote',
      'evidenceType',
      'evidenceReferenceId',
      'expectedVersion',
    ]);
    assert.deepEqual(
      object(schemas.RosterResolutionEvidenceType, 'RosterResolutionEvidenceType').enum,
      ['NEW_ALIGNMENT_RESULT', 'ENROLLMENT_STATUS_EVENT', 'OFFICIAL_ROSTER_VERSION'],
    );

    const rollback = object(schemas.RollbackRosterImportRequest, 'RollbackRosterImportRequest');
    assert.deepEqual(rollback.required, [
      'expectedCurrentRosterImportId',
      'expectedVersion',
      'reason',
    ]);
    assert.deepEqual(
      Object.keys(
        object(
          object(rollback.properties, 'rollback properties').expectedVersion,
          'expectedVersion',
        ),
      ).sort(),
      ['$ref', 'description'],
    );
  });

  it('freezes six classifications, safe projections, roster errors, and true ignore default deny', async () => {
    const root = await contract();
    const schemas = object(object(root.components, 'components').schemas, 'schemas');
    assert.deepEqual(object(schemas.RosterAlignmentStatus, 'RosterAlignmentStatus').enum, [
      'MATCHED',
      'MISSING_IN_PLATFORM',
      'EXTRA_IN_PLATFORM',
      'WRONG_COURSE',
      'IDENTITY_CONFLICT',
      'DUPLICATED',
    ]);
    assert.deepEqual(object(schemas.RosterResolutionStatus, 'RosterResolutionStatus').enum, [
      'PENDING',
      'CONFIRMED',
      'RESOLVED',
      'IGNORED',
    ]);
    assert.deepEqual(object(schemas.RosterResolutionAction, 'RosterResolutionAction').enum, [
      'CONFIRM',
      'RESOLVE',
      'REOPEN',
    ]);

    const forbiddenProperties = {
      OfficialRosterImport: [
        'sourceFileStorageKey',
        'fileName',
        'fileChecksumSha256',
        'fieldMappingSnapshot',
        'failureDetailsSafe',
      ],
      OfficialRosterEntry: [
        'rawStudentNumberSafe',
        'rawRowSnapshotSafe',
        'matchedStudentId',
        'storageKey',
      ],
      RosterAlignmentResult: ['storageKey', 'rawRowSnapshotSafe', 'matchedStudentId'],
    } as const;
    for (const [schemaName, forbidden] of Object.entries(forbiddenProperties)) {
      const schema = object(schemas[schemaName], schemaName);
      assert.equal(schema.additionalProperties, false);
      const properties = object(schema.properties, `${schemaName}.properties`);
      for (const field of forbidden) assert.equal(properties[field], undefined);
    }

    const errorCodes = object(schemas.ErrorCode, 'ErrorCode').enum as string[];
    for (const code of ROSTER_ERRORS) assert.equal(errorCodes.includes(code), true, code);

    const ignore = operation(root, '/roster-alignment-results/{alignmentResultId}/ignore', 'post');
    assert.equal(ignore['x-enabled-by-default'], false);
    assert.equal(ignore['x-business-blocker'], 'ADR-057');
    assert.equal(ignore['x-default-deny-error'], 'ROSTER_IGNORE_NOT_ALLOWED');
    assert.match(String(ignore.description), /Always returns ROSTER_IGNORE_NOT_ALLOWED/);
  });
});
