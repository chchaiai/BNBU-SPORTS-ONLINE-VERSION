import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enumSubsetFailures } from './enum-subset-policy.mjs';
const definitions = { Status: { enum: ['OPEN', 'CLOSED'] }, Count: { enum: [1, 2] } };
test('enum references must exist and each value must belong to the referenced domain', () => {
  assert.deepEqual(enumSubsetFailures({ enum: ['OPEN'], 'x-enum-subset-of': 'Status' }, definitions), []);
  assert.match(enumSubsetFailures({ enum: ['OPEN'], 'x-enum-subset-of': 'Missing' }, definitions).join(), /unknown enum/);
  assert.match(enumSubsetFailures({ enum: ['OTHER'], 'x-enum-subset-of': 'Status' }, definitions).join(), /outside enum/);
});
test('number options keep their wire type and null follows JSON Schema type constraints', () => {
  assert.deepEqual(enumSubsetFailures({ enum: [1], 'x-enum-subset-of': 'Count' }, definitions), []);
  assert.match(enumSubsetFailures({ enum: ['1'], 'x-enum-subset-of': 'Count' }, definitions).join(), /outside enum/);
  assert.deepEqual(enumSubsetFailures({ type: ['string', 'null'], enum: ['OPEN', null], 'x-enum-subset-of': 'Status' }, definitions), []);
  assert.deepEqual(enumSubsetFailures({ enum: ['OPEN', null], 'x-enum-subset-of': 'Status' }, definitions), []);
  assert.match(enumSubsetFailures({ type: 'string', enum: [null], 'x-enum-subset-of': 'Status' }, definitions).join(), /outside enum/);
});
test('missing declarations fail, while explicit transport constraints remain supported', () => {
  assert.equal(enumSubsetFailures({ enum: ['en'] }, definitions).length, 1);
  assert.deepEqual(enumSubsetFailures({ enum: ['en'], 'x-transport-constraint': true }, definitions), []);
});
