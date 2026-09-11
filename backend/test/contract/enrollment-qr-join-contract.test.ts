import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { parse } from 'yaml';

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
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
  return object(object(object(root.paths)[path])[method]);
}

describe('Stage 12 Enrollment and QR Join contract', () => {
  it('binds all ten operations to the frozen authentication and resource policies', async () => {
    const root = await contract();
    const expected = [
      ['/class-sections/{classSectionId}/course-invites', 'post', 'createCourseInvite'],
      ['/course-invites/{inviteToken}/preview', 'get', 'previewCourseInvite'],
      ['/course-invites/{inviteToken}/join-capabilities', 'post', 'issueJoinCapability'],
      ['/course-invites/{inviteToken}/join', 'post', 'joinClassSectionWithInvite'],
      ['/enrollments', 'get', 'listEnrollments'],
      ['/enrollments/{enrollmentId}', 'get', 'getEnrollment'],
      ['/class-sections/{classSectionId}/enrollments', 'post', 'manuallyEnrollStudent'],
      ['/enrollments/{enrollmentId}/remove', 'post', 'removeEnrollment'],
      ['/enrollments/{enrollmentId}/restore', 'post', 'restoreEnrollment'],
      ['/enrollments/{enrollmentId}/withdraw', 'post', 'withdrawEnrollment'],
    ] as const;
    for (const [path, method, operationId] of expected) {
      const candidate = operation(root, path, method);
      assert.equal(candidate.operationId, operationId);
      assert.equal(object(candidate['x-access-policy']).defaultDeny, true);
      if (operationId !== 'withdrawEnrollment') {
        assert.equal(candidate['x-implementation-gate'], undefined);
      }
    }
    const join = operation(root, '/course-invites/{inviteToken}/join', 'post');
    assert.equal(object(join['x-access-policy']).authentication, 'JOIN_CAPABILITY');
    assert.deepEqual(join.security, [{ JoinCapability: [] }]);
    assert.equal(join.requestBody, undefined);
    const withdraw = operation(root, '/enrollments/{enrollmentId}/withdraw', 'post');
    assert.equal(withdraw['x-business-blocker'], 'ADR-054');
    assert.equal(withdraw['x-default-deny-error'], 'ENROLLMENT_WITHDRAWAL_DISABLED');
  });

  it('freezes sensitive response headers and the complete atomic Join result', async () => {
    const root = await contract();
    const schemas = object(object(root.components).schemas);
    const preview = object(schemas.CourseInvitePreview);
    assert.deepEqual(preview.required, [
      'classSectionId',
      'displayName',
      'courseCode',
      'courseName',
      'semesterDisplayName',
      'teacherDisplayName',
      'enrollmentOpen',
      'expiresAt',
    ]);
    assert.deepEqual(object(schemas.JoinResult).required, [
      'studentProfile',
      'enrollment',
      'course',
      'classSection',
      'authSession',
    ]);
    const responses = object(object(root.components).responses);
    for (const name of [
      'CourseInviteSuccess',
      'CourseInvitePreviewSuccess',
      'JoinCapabilitySuccess',
      'JoinSuccess',
    ]) {
      const headers = object(object(responses[name]).headers);
      assert.notEqual(headers['Cache-Control'], undefined);
      assert.notEqual(headers['Referrer-Policy'], undefined);
      assert.notEqual(headers['X-Request-ID'], undefined);
    }
  });

  it('uses canonical capability errors and preserves the expanded operation baseline', async () => {
    const root = await contract();
    const errorCodes = object(object(object(root.components).schemas).ErrorCode).enum;
    assert.equal(Array.isArray(errorCodes), true);
    for (const code of [
      'AUTH_JOIN_CAPABILITY_INVALID',
      'AUTH_JOIN_CAPABILITY_EXPIRED',
      'AUTH_JOIN_CAPABILITY_ALREADY_USED',
      'ENROLLMENT_WITHDRAWAL_DISABLED',
      'ENROLLMENT_REJOIN_DISABLED',
    ]) {
      assert.equal((errorCodes as string[]).includes(code), true);
    }
    assert.equal((errorCodes as string[]).includes('JOIN_CAPABILITY_INVALID'), false);
    let operationCount = 0;
    for (const pathItem of Object.values(object(root.paths))) {
      for (const method of Object.keys(object(pathItem))) {
        if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) {
          operationCount += 1;
        }
      }
    }
    assert.equal(operationCount, 126);
  });
});
