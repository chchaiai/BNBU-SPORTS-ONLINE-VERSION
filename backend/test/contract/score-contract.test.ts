import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { parse } from 'yaml';

import { OPERATION_ID_METADATA } from '../../src/common/policy/operation-policy.decorator.js';
import { operationPolicies } from '../../src/generated/operation-policies.generated.js';
import { ScoresController } from '../../src/modules/scores/interface/http/scores.controller.js';

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

describe('Stage 18 Score contract', () => {
  const expected = [
    ['/class-sections/{classSectionId}/score-rules', 'get', 'listScoreRules', 'listRules'],
    ['/class-sections/{classSectionId}/score-rules', 'post', 'createScoreRule', 'createRule'],
    ['/score-rules/{scoreRuleId}', 'get', 'getScoreRule', 'getRule'],
    [
      '/score-rules/{scoreRuleId}/submit-approval',
      'post',
      'submitScoreRuleForApproval',
      'submitRule',
    ],
    ['/score-rules/{scoreRuleId}/approve', 'post', 'approveScoreRule', 'approveRule'],
    ['/score-rules/{scoreRuleId}/reject', 'post', 'rejectScoreRule', 'rejectRule'],
    ['/student-scores', 'get', 'listStudentScores', 'listScores'],
    ['/student-scores/{studentScoreId}', 'get', 'getStudentScore', 'getScore'],
    [
      '/student-scores/{studentScoreId}/recalculate',
      'post',
      'recalculateStudentScore',
      'recalculate',
    ],
    ['/student-scores/{studentScoreId}/publish', 'post', 'publishStudentScore', 'publish'],
    [
      '/student-scores/{studentScoreId}/open-correction',
      'post',
      'openStudentScoreCorrection',
      'correction',
    ],
    [
      '/student-scores/{studentScoreId}/adjustments',
      'get',
      'listScoreAdjustments',
      'listAdjustments',
    ],
    [
      '/student-scores/{studentScoreId}/adjustments',
      'post',
      'createScoreAdjustment',
      'createAdjustment',
    ],
    [
      '/score-adjustments/{scoreAdjustmentId}/approve',
      'post',
      'approveScoreAdjustment',
      'approveAdjustment',
    ],
    [
      '/score-adjustments/{scoreAdjustmentId}/reject',
      'post',
      'rejectScoreAdjustment',
      'rejectAdjustment',
    ],
  ] as const;

  it('binds all 15 frozen operations to real handlers and generated policies', () => {
    const paths = object(contract.paths, 'paths');
    for (const [path, method, operationId, handlerName] of expected) {
      const operation = object(object(paths[path], path)[method], operationId);
      assert.equal(operation.operationId, operationId);
      assert.equal(object(operation['x-access-policy'], `${operationId} policy`).defaultDeny, true);
      assert.ok(operationPolicies[operationId]);
      const handler: unknown = Object.getOwnPropertyDescriptor(
        ScoresController.prototype,
        handlerName,
      )?.value;
      assert.equal(typeof handler, 'function');
      assert.equal(Reflect.getMetadata(OPERATION_ID_METADATA, handler as object), operationId);
    }
    const operations = Object.values(paths).flatMap((path) =>
      Object.entries(object(path, 'path item')).filter(([method]) =>
        ['get', 'post', 'put', 'patch', 'delete'].includes(method),
      ),
    );
    assert.equal(operations.length, 126);
  });

  it('freezes the fixed formula and rejects client-authored calculation facts', () => {
    const schemas = object(object(contract.components, 'components').schemas, 'schemas');
    const create = object(
      object(schemas.CreateScoreRuleRequest, 'create rule').properties,
      'fields',
    );
    assert.deepEqual(Object.keys(create).sort(), ['displayName', 'ruleCode']);
    const adjustment = object(
      object(schemas.CreateScoreAdjustmentRequest, 'adjustment').properties,
      'adjustment fields',
    );
    for (const forbidden of [
      'studentId',
      'teacherId',
      'organizationId',
      'classSectionId',
      'scoreRuleId',
      'status',
      'finalScore',
      'sourceFingerprint',
    ]) {
      assert.equal(Object.hasOwn(create, forbidden), false);
      assert.equal(Object.hasOwn(adjustment, forbidden), false);
    }
    const serialized = JSON.stringify(contract);
    assert.equal(serialized.includes('publishScoreRule'), false);
    assert.equal(serialized.includes('SCORE_CORRECTION_NOT_ALLOWED'), true);
  });

  it('keeps correction as an explicit default deny and score decimals bounded to two places', () => {
    const paths = object(contract.paths, 'paths');
    const correction = object(
      object(paths['/student-scores/{studentScoreId}/open-correction'], 'correction path').post,
      'correction',
    );
    assert.equal(correction['x-default-deny-error'], 'SCORE_CORRECTION_NOT_ALLOWED');
    const schemas = object(object(contract.components, 'components').schemas, 'schemas');
    const score = object(object(schemas.StudentScore, 'StudentScore').properties, 'score fields');
    for (const field of ['baseScore', 'adjustmentTotal', 'finalScore']) {
      assert.ok(score[field]);
    }
    const decimal = object(schemas.DecimalScore, 'DecimalScore');
    assert.equal(decimal.type, 'number');
    assert.equal(decimal.multipleOf, 0.01);
  });
});
