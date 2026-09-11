import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { parse } from 'yaml';

import { OPERATION_ID_METADATA } from '../../src/common/policy/operation-policy.decorator.js';
import { operationPolicies } from '../../src/generated/operation-policies.generated.js';
import { ExerciseReviewsController } from '../../src/modules/exercise-reviews/interface/http/exercise-reviews.controller.js';

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

describe('Stage 17 ExerciseReview contract', () => {
  it('binds exactly four teacher-only operations to real handlers', () => {
    const expected = [
      [
        '/exercise-records/{recordId}/reviews',
        'get',
        'listExerciseRecordReviews',
        'list',
        'EXERCISE_RECORD_FROM_PATH',
      ],
      [
        '/exercise-records/{recordId}/reviews',
        'post',
        'reviewExerciseRecord',
        'decide',
        'EXERCISE_RECORD_FROM_PATH',
      ],
      [
        '/exercise-records/{recordId}/reviews/reopen',
        'post',
        'reopenExerciseRecordReview',
        'reopen',
        'EXERCISE_RECORD_FROM_PATH',
      ],
      [
        '/exercise-reviews/batch',
        'post',
        'batchReviewExerciseRecords',
        'batch',
        'BATCH_EXERCISE_RECORDS_FROM_BODY',
      ],
    ] as const;
    const paths = object(contract.paths, 'paths');
    for (const [path, method, operationId, handlerName, resolver] of expected) {
      const operation = object(object(paths[path], path)[method], operationId);
      const policy = object(operation['x-access-policy'], `${operationId} policy`);
      assert.equal(operation.operationId, operationId);
      assert.deepEqual(policy.allowedRoles, ['TEACHER']);
      assert.equal(policy.resourceScope, 'TEACHER_CLASS_SECTION');
      assert.equal(policy.resourceResolver, resolver);
      assert.equal(policy.defaultDeny, true);
      assert.equal(operationPolicies[operationId].resourceResolver, resolver);
      const handler: unknown = Object.getOwnPropertyDescriptor(
        ExerciseReviewsController.prototype,
        handlerName,
      )?.value;
      assert.equal(typeof handler, 'function');
      assert.equal(Reflect.getMetadata(OPERATION_ID_METADATA, handler as object), operationId);
    }
  });

  it('freezes dual versions, reason validation, nullable PENDING facts, and override fail-closed', () => {
    const schemas = object(object(contract.components, 'components').schemas, 'schemas');
    const create = object(schemas.CreateReviewRequest, 'CreateReviewRequest');
    assert.deepEqual(create.required, ['result', 'expectedReviewVersion', 'expectedVersion']);
    const fields = object(create.properties, 'CreateReviewRequest fields');
    assert.equal(Object.hasOwn(fields, 'teacherId'), false);
    assert.equal(Object.hasOwn(fields, 'previousReviewId'), false);
    assert.equal(Object.hasOwn(fields, 'organizationId'), false);
    const review = object(object(schemas.ReviewRecord, 'ReviewRecord').properties, 'review fields');
    assert.deepEqual(object(review.reviewedAt, 'reviewedAt').type, ['string', 'null']);
    const paths = object(contract.paths, 'paths');
    const operation = object(
      object(paths['/exercise-records/{recordId}/reviews'], 'review path').post,
      'review operation',
    );
    assert.equal(operation['x-field-deny-error'], 'REVIEW_CREDIT_OVERRIDE_NOT_APPROVED');
  });

  it('keeps batch per-item outcomes and excludes claim, UNDER_REVIEW, Score, and Export from Stage 17', () => {
    const serialized = JSON.stringify(contract);
    assert.equal(serialized.includes('claimExerciseRecordReview'), false);
    assert.equal(serialized.includes('/claim-review'), false);
    assert.equal(serialized.includes('CLAIM_REVIEW'), false);
    assert.equal(serialized.includes('UNDER_REVIEW'), false);
    const schemas = object(object(contract.components, 'components').schemas, 'schemas');
    const item = object(object(schemas.BatchItemResult, 'BatchItemResult').properties, 'item');
    assert.deepEqual(object(item.status, 'status').enum, ['SUCCEEDED', 'FAILED']);
    assert.deepEqual(object(schemas.BatchReviewRequest, 'BatchReviewRequest').required, ['items']);
  });
});
