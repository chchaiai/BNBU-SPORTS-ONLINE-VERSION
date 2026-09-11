import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { parse } from 'yaml';

import { OPERATION_ID_METADATA } from '../../src/common/policy/operation-policy.decorator.js';
import { operationPolicies } from '../../src/generated/operation-policies.generated.js';
import { ExerciseSessionsController } from '../../src/modules/exercise-sessions/interface/http/exercise-sessions.controller.js';

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as JsonObject;
}

async function openapi(): Promise<JsonObject> {
  return parse(
    await readFile(
      new URL('../../../docs/backend-contracts/openapi.yaml', import.meta.url),
      'utf8',
    ),
  ) as JsonObject;
}

describe('Stage 14 ExerciseSession contract', () => {
  it('binds exactly eight Student-only Session operations to runtime policy and Controller methods', async () => {
    const root = await openapi();
    const expected = [
      ['/exercise-sessions', 'post', 'startExerciseSession', 'start', 'ENROLLMENT_FROM_REQUEST'],
      [
        '/exercise-sessions/active',
        'get',
        'getActiveExerciseSession',
        'active',
        'PRINCIPAL_STUDENT',
      ],
      [
        '/exercise-sessions/{sessionId}',
        'get',
        'getExerciseSession',
        'get',
        'EXERCISE_SESSION_FROM_PATH',
      ],
      [
        '/exercise-sessions/{sessionId}/pause',
        'post',
        'pauseExerciseSession',
        'pause',
        'EXERCISE_SESSION_FROM_PATH',
      ],
      [
        '/exercise-sessions/{sessionId}/resume',
        'post',
        'resumeExerciseSession',
        'resume',
        'EXERCISE_SESSION_FROM_PATH',
      ],
      [
        '/exercise-sessions/{sessionId}/finish',
        'post',
        'finishExerciseSession',
        'finish',
        'EXERCISE_SESSION_FROM_PATH',
      ],
      [
        '/exercise-sessions/{sessionId}/cancel',
        'post',
        'cancelExerciseSession',
        'cancel',
        'EXERCISE_SESSION_FROM_PATH',
      ],
      [
        '/exercise-sessions/{sessionId}/reconcile',
        'post',
        'reconcileExerciseSession',
        'reconcile',
        'EXERCISE_SESSION_FROM_PATH',
      ],
    ] as const;
    const paths = object(root.paths);
    for (const [path, method, operationId, controllerMethod, resolver] of expected) {
      const operation = object(object(paths[path])[method]);
      const policy = object(operation['x-access-policy']);
      assert.equal(operation.operationId, operationId);
      assert.deepEqual(policy.allowedRoles, ['STUDENT']);
      assert.equal(policy.authentication, 'ACCESS_TOKEN');
      assert.equal(policy.organizationScope, 'PRINCIPAL_ORGANIZATION');
      assert.equal(policy.resourceScope, 'SELF');
      assert.equal(policy.resourceResolver, resolver);
      assert.equal(policy.defaultDeny, true);
      assert.equal(operationPolicies[operationId]?.resourceResolver, resolver);
      const handler = object(ExerciseSessionsController.prototype)[controllerMethod];
      assert.equal(Reflect.getMetadata(OPERATION_ID_METADATA, handler as object), operationId);
    }
    const sessionOperations: string[] = [];
    for (const pathItem of Object.values(paths)) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        const candidate = object(pathItem)[method];
        if (candidate !== undefined) {
          const operationId = object(candidate).operationId;
          if (typeof operationId === 'string' && operationId.includes('ExerciseSession')) {
            sessionOperations.push(operationId);
          }
        }
      }
    }
    assert.deepEqual(sessionOperations.sort(), expected.map((entry) => entry[2]).sort());
  });

  it('keeps 126 total operations, no Session list, nullable active recovery, and five formal states', async () => {
    const root = await openapi();
    const paths = object(root.paths);
    let count = 0;
    for (const pathItem of Object.values(paths)) {
      for (const method of Object.keys(object(pathItem))) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) count += 1;
      }
    }
    assert.equal(count, 126);
    assert.equal(object(paths['/exercise-sessions']).get, undefined);
    const schemas = object(object(root.components).schemas);
    assert.deepEqual(object(schemas.ExerciseSessionStatus).enum, [
      'IN_PROGRESS',
      'PAUSED',
      'COMPLETED',
      'CANCELLED',
      'EXPIRED',
    ]);
    const nullable = object(schemas.NullableSessionResponse);
    const data = object(object(nullable.properties).data);
    assert.deepEqual((data.oneOf as JsonObject[])[1], { type: 'null' });
  });

  it('keeps integer durations, RFC3339 instants, date-only businessDate, expectedVersion, and idempotency headers', async () => {
    const root = await openapi();
    const schemas = object(object(root.components).schemas);
    const projection = object(schemas.ExerciseSession);
    const properties = object(projection.properties);
    assert.equal(object(schemas.NonNegativeSeconds).type, 'integer');
    assert.equal(
      object(properties.actualDurationSeconds).$ref,
      '#/components/schemas/NonNegativeSeconds',
    );
    assert.equal(
      object(properties.pausedDurationSeconds).$ref,
      '#/components/schemas/NonNegativeSeconds',
    );
    assert.equal(object(properties.startedAt).format, 'date-time');
    assert.equal(object(properties.businessDate).format, 'date');
    assert.ok((projection.required as unknown[]).includes('version'));
    const control = object(schemas.SessionControlRequest);
    assert.ok((control.required as unknown[]).includes('expectedVersion'));
    assert.equal(JSON.stringify(root).includes('IdempotencyKeyHeader'), true);
  });
});
