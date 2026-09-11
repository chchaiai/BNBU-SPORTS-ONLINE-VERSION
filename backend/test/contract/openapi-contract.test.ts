import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { parse } from 'yaml';

import { OPERATION_ID_METADATA } from '../../src/common/policy/operation-policy.decorator.js';
import {
  operationPolicies,
  type OperationId,
} from '../../src/generated/operation-policies.generated.js';
import { AuthController } from '../../src/modules/auth/auth.controller.js';
import { ClassSectionsController } from '../../src/modules/class-sections/interface/http/class-sections.controller.js';
import { TeacherClassSectionsController } from '../../src/modules/class-sections/interface/http/teacher-class-sections.controller.js';
import { CoursesController } from '../../src/modules/courses/interface/http/courses.controller.js';
import { CourseInvitesController } from '../../src/modules/course-invites/interface/http/course-invites.controller.js';
import { JoinCapabilitiesController } from '../../src/modules/join-capabilities/interface/http/join-capabilities.controller.js';
import { EnrollmentsController } from '../../src/modules/enrollments/interface/http/enrollments.controller.js';
import { HealthController } from '../../src/modules/health/health.controller.js';
import { OrganizationsController } from '../../src/modules/organizations/organizations.controller.js';
import { SemestersController } from '../../src/modules/semesters/semesters.controller.js';
import { SystemModeController } from '../../src/modules/system-mode/system-mode.controller.js';
import { UsersController } from '../../src/modules/users/users.controller.js';

type JsonObject = Record<string, unknown>;

async function canonicalContract(): Promise<JsonObject> {
  const text = await readFile(
    new URL('../../../docs/backend-contracts/openapi.yaml', import.meta.url),
    'utf8',
  );
  return parse(text) as JsonObject;
}

function object(value: unknown, label: string): JsonObject {
  assert.equal(typeof value, 'object', `${label} must be an object`);
  assert.notEqual(value, null, `${label} must be an object`);
  assert.equal(Array.isArray(value), false, `${label} must be an object`);
  return value as JsonObject;
}

function localReference(root: JsonObject, reference: string): unknown {
  assert.match(reference, /^#\//, `Only local references are allowed: ${reference}`);
  return reference
    .slice(2)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce<unknown>((value, segment) => object(value, reference)[segment], root);
}

function collectOperations(contract: JsonObject): { operationId: string; policy: JsonObject }[] {
  const operations: { operationId: string; policy: JsonObject }[] = [];
  for (const pathItem of Object.values(object(contract.paths, 'paths'))) {
    for (const [method, candidate] of Object.entries(object(pathItem, 'path item'))) {
      if (!['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method)) continue;
      const operation = object(candidate, 'operation');
      assert.equal(typeof operation.operationId, 'string');
      operations.push({
        operationId: operation.operationId as string,
        policy: object(operation['x-access-policy'], 'x-access-policy'),
      });
    }
  }
  return operations;
}

describe('authoritative OpenAPI contract', () => {
  it('parses every local reference and exposes complete unique access policies', async () => {
    const contract = await canonicalContract();
    let referenceCount = 0;
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (value === null || typeof value !== 'object') return;
      for (const [key, entry] of Object.entries(value as JsonObject)) {
        if (key === '$ref') {
          assert.equal(typeof entry, 'string');
          assert.notEqual(localReference(contract, entry as string), undefined);
          referenceCount += 1;
        } else {
          visit(entry);
        }
      }
    };
    visit(contract);
    assert.equal(referenceCount, 1_778);

    const operations = collectOperations(contract);
    assert.equal(operations.length, 126);
    assert.equal(new Set(operations.map(({ operationId }) => operationId)).size, 126);
    assert.equal(Object.keys(operationPolicies).length, 126);
    for (const { operationId, policy } of operations) {
      assert.equal(policy.defaultDeny, true);
      assert.equal(typeof policy.policyId, 'string');
      assert.ok(operationId in operationPolicies);
    }
  });

  it('binds every implemented controller method to its generated operation policy', () => {
    const bindings: [object, string, OperationId][] = [
      [HealthController.prototype, 'live', 'getHealthLive'],
      [HealthController.prototype, 'ready', 'getHealthReady'],
      [HealthController.prototype, 'admin', 'getAdminHealth'],
      [SystemModeController.prototype, 'getSystemMode', 'getSystemMode'],
      [OrganizationsController.prototype, 'current', 'getCurrentOrganization'],
      [SemestersController.prototype, 'current', 'getCurrentSemester'],
      [AuthController.prototype, 'passwordLogin', 'passwordLogin'],
      [AuthController.prototype, 'refresh', 'refreshSession'],
      [AuthController.prototype, 'logout', 'logoutSession'],
      [UsersController.prototype, 'current', 'getCurrentUser'],
      [UsersController.prototype, 'requestEmailVerification', 'requestCurrentUserEmailChallenge'],
      [UsersController.prototype, 'verifyEmail', 'verifyCurrentUserEmailChallenge'],
      [CoursesController.prototype, 'list', 'listCourses'],
      [CoursesController.prototype, 'create', 'createCourse'],
      [CoursesController.prototype, 'get', 'getCourse'],
      [CoursesController.prototype, 'update', 'updateCourse'],
      [ClassSectionsController.prototype, 'list', 'listClassSections'],
      [ClassSectionsController.prototype, 'create', 'createClassSection'],
      [ClassSectionsController.prototype, 'get', 'getClassSection'],
      [ClassSectionsController.prototype, 'update', 'updateClassSection'],
      [ClassSectionsController.prototype, 'close', 'closeClassSection'],
      [TeacherClassSectionsController.prototype, 'list', 'listTeacherClassSections'],
      [CourseInvitesController.prototype, 'create', 'createCourseInvite'],
      [CourseInvitesController.prototype, 'preview', 'previewCourseInvite'],
      [JoinCapabilitiesController.prototype, 'issue', 'issueJoinCapability'],
      [EnrollmentsController.prototype, 'join', 'joinClassSectionWithInvite'],
      [EnrollmentsController.prototype, 'list', 'listEnrollments'],
      [EnrollmentsController.prototype, 'get', 'getEnrollment'],
      [EnrollmentsController.prototype, 'manual', 'manuallyEnrollStudent'],
      [EnrollmentsController.prototype, 'remove', 'removeEnrollment'],
      [EnrollmentsController.prototype, 'restore', 'restoreEnrollment'],
      [EnrollmentsController.prototype, 'withdraw', 'withdrawEnrollment'],
    ];
    for (const [prototype, method, expected] of bindings) {
      const handler = object(prototype, 'controller prototype')[method];
      assert.equal(Reflect.getMetadata(OPERATION_ID_METADATA, handler as object), expected);
      assert.ok(expected in operationPolicies);
    }
  });

  it('freezes envelope fields and the safe student currentReview projection', async () => {
    const contract = await canonicalContract();
    const schemas = object(object(contract.components, 'components').schemas, 'schemas');
    const error = object(schemas.ErrorEnvelope, 'ErrorEnvelope');
    assert.deepEqual(error.required, ['code', 'message', 'details', 'requestId', 'timestamp']);
    assert.equal(error.additionalProperties, false);

    const authResponse = object(schemas.AuthResponse, 'AuthResponse');
    assert.deepEqual(authResponse.required, ['data', 'meta']);
    const review = object(schemas.StudentCurrentReview, 'StudentCurrentReview');
    assert.deepEqual(
      Object.keys(object(review.properties, 'StudentCurrentReview.properties')).sort(),
      ['publicComment', 'reasonCode', 'result'],
    );
    const auditActionType = object(schemas.AuditActionType, 'AuditActionType');
    assert.ok((auditActionType.enum as string[]).includes('COURSE_UPDATED'));
    assert.ok((auditActionType.enum as string[]).includes('COURSE_STATUS_CHANGED'));
  });
});
