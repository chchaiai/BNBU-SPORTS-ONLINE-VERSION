import { test } from 'node:test';
import assert from 'node:assert/strict';
import { responsePolicyFailures } from './operation-response-policy.mjs';

const disabled = new Set(['example']);
const retired = { operationId: 'example', deprecated: true, 'x-retirement-reason': 'Business workflow retired', responses: { 403: {} } };
const deferred = { operationId: 'example', 'x-availability': 'DEFERRED', 'x-deferral-reason': 'User postponed this feature', responses: { 503: {} } };

test('normal operations require both success and error responses', () => {
  assert.deepEqual(responsePolicyFailures({ responses: { 200: {}, 422: {} } }, disabled), []);
  assert.deepEqual(responsePolicyFailures({ responses: { 200: {} } }, disabled), ['has no error response']);
  assert.deepEqual(responsePolicyFailures({ operationId: 'example', responses: { 403: {} } }, disabled), ['has no success response']);
});
test('unavailable operations require an explicit reason and disabled registration', () => {
  for (const operation of [retired, deferred]) {
    assert.deepEqual(responsePolicyFailures(operation, disabled), []);
    assert.match(responsePolicyFailures(operation, new Set()).join(), /without a disabled registration/);
  }
  assert.deepEqual(responsePolicyFailures({ ...retired, 'x-retirement-reason': ' ' }, disabled), ['has no success response']);
  assert.deepEqual(responsePolicyFailures({ ...retired, deprecated: false }, disabled), ['has no success response']);
  assert.deepEqual(responsePolicyFailures({ ...deferred, 'x-deferral-reason': '' }, disabled), ['has no success response']);
});
test('unavailable operations cannot declare successes or omit their actual denial status', () => {
  for (const operation of [retired, deferred]) {
    assert.match(responsePolicyFailures({ ...operation, responses: { ...operation.responses, 200: {} } }, disabled).join(), /success response for an unavailable/);
  }
  assert.match(responsePolicyFailures({ ...retired, responses: { 401: {} } }, disabled).join(), /declare 403/);
  assert.match(responsePolicyFailures({ ...deferred, responses: { 401: {} } }, disabled).join(), /declare 503/);
});
