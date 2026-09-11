import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { missingServiceUnavailableResponses } from './system-mode-response-policy.mjs';
test('YAML quote styles and response aliases do not change status recognition', () => {
  for (const status of ["'503'", '"503"', '503']) {
    const api = parse(`paths:\n  /example:\n    post:\n      responses: &shared\n        ${status}: {description: Unavailable}\n    patch:\n      responses: *shared\n`);
    assert.deepEqual(missingServiceUnavailableResponses(api), []);
  }
});
test('all mutation methods require an explicit 503 and malformed operations fail', () => {
  const methods = ['post', 'put', 'patch', 'delete'];
  const item = Object.fromEntries(methods.map(method => [method, { responses: { 200: {} } }]));
  item.get = { responses: { 200: {} } };
  assert.deepEqual(missingServiceUnavailableResponses({ paths: { '/example': item } }), methods.map(method => ({ path: '/example', method })));
  assert.throws(() => missingServiceUnavailableResponses({ paths: { '/example': { post: {} } } }), /no responses block/);
});
