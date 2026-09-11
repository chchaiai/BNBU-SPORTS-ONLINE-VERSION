import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Ajv from 'ajv';
import { parse } from 'yaml';

const api = parse(readFileSync(new URL('../../../docs/backend-contracts/openapi.yaml', import.meta.url), 'utf8'));
const validate = new Ajv({ strict: false }).compile(api.components.schemas.V81FinalGradeInput);
test('final grade contract accepts the full signed integer range without a 0-100 cap', () => {
  for (const finalGrade of [-2147483648, -1, 0, 101, 2147483647])
    assert.equal(validate({ finalGrade, published: true, expectedVersion: 0 }), true);
});
test('final grade contract rejects non-integers, overflow and free-form notes', () => {
  for (const finalGrade of [-2147483649, 2147483648, 1.5, '80', null])
    assert.equal(validate({ finalGrade, published: false, expectedVersion: 0 }), false);
  for (const field of ['note', 'remarks', 'internalNote', 'publicComment'])
    assert.equal(validate({ finalGrade: 80, published: false, expectedVersion: 0, [field]: 'text' }), false);
});
test('final-grade protocol grants neither student nor administrator access', () => {
  const route = api.paths['/enrollments/{enrollmentId}/final-grades'];
  for (const method of ['get', 'post']) assert.deepEqual(route[method]['x-access-policy'].allowedRoles, ['TEACHER']);
  assert.equal(Object.hasOwn(api.components.schemas.V81FinalGradeRevision.properties, 'note'), false);
});
