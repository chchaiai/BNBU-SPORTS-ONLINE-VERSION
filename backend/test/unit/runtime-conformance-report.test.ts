import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const checker = resolve('scripts/check-runtime-conformance-report.mjs');
const disabled = Array.from({ length: 17 }, (_, index) => `disabled${index}`);
function run(events: Record<string, unknown>[], manifestOverride: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bnbu-conformance-test-'));
  try {
    const backend = join(root, 'backend');
    mkdirSync(join(backend, 'src/generated'), { recursive: true });
    mkdirSync(join(root, 'docs/backend-contracts'), { recursive: true });
    const ids = ['enabled', ...disabled];
    writeFileSync(join(backend, 'src/generated/openapi.document.generated.json'), JSON.stringify({
      info: { version: 'synthetic-test' },
      paths: Object.fromEntries(ids.map(id => [`/${id}`, { get: { operationId: id } }])),
    }));
    writeFileSync(join(backend, 'runtime-coverage.manifest.json'), JSON.stringify({
      expectedOperationCount: ids.length, implemented: Object.fromEntries(ids.map(id => [id, {}])),
      implementedDefaultDeny: disabled, expectedDisabledOperationCount: disabled.length, ...manifestOverride,
    }));
    const report = join(root, 'events.ndjson');
    writeFileSync(report, events.map(event => JSON.stringify(event)).join('\n'));
    const result = spawnSync(process.execPath, [checker, `--report=${report}`, '--write'], { cwd: backend, encoding: 'utf8' });
    assert.equal(result.error, undefined);
    return { status: result.status, output: result.stderr,
      registry: JSON.parse(readFileSync(join(root, 'docs/backend-contracts/runtime-conformance-report.json'), 'utf8')),
      markdown: readFileSync(join(root, 'docs/backend-contracts/OPERATION-COMPLETION-MATRIX.md'), 'utf8') };
  } finally { rmSync(root, { recursive: true, force: true }); }
}
const response = (operationId: string, status: number, valid = true) => ({ operationId, phase: 'response', status, valid });
const denied = () => disabled.map(id => response(id, 403));

test('missing responses remain unobserved and never claim completed implementation', () => {
  const result = run([]);
  assert.equal(result.status, 1);
  assert.equal(result.registry.summary.gatePassed, false);
  assert.equal(result.registry.summary.runtimeConformantCount, 0);
  assert.equal(result.registry.summary.unobservedCount, 18);
  assert.ok(result.registry.operations.every((row: Record<string, unknown>) => row.conformanceStatus === 'NOT_OBSERVED'));
  assert.ok(!result.markdown.includes('| Not implemented | 0 |'));
  assert.ok(!result.markdown.includes('IMPLEMENTED_AND_CONFORMANT'));
});

test('valid success alone remains partial while valid denial of disabled routes is counted', () => {
  const result = run([response('enabled', 200), ...denied()]);
  assert.equal(result.status, 1);
  assert.equal(result.registry.operations[0].conformanceStatus, 'SUCCESS_RESPONSE_VALIDATED');
  assert.equal(result.registry.summary.runtimeConformantCount, 17);
  assert.equal(result.registry.summary.incompleteCount, 1);
  assert.equal(result.registry.summary.validatedDisabledCount, 17);
});

test('invalid responses and successful disabled routes fail without being marked validated', () => {
  const events = [response('enabled', 200, false), response('enabled', 403), ...denied(), response('disabled0', 200)];
  const result = run(events);
  assert.equal(result.status, 1);
  assert.equal(result.registry.operations[0].conformanceStatus, 'INVALID_RESPONSE');
  assert.deepEqual(result.registry.operations[0].successStatuses, []);
  assert.equal(result.registry.operations[1].conformanceStatus, 'DISABLED_PATH_RETURNED_SUCCESS');
  assert.equal(result.registry.summary.successCoveredCount, 0);
  assert.equal(result.registry.summary.validatedDisabledCount, 16);
  assert.ok(result.registry.failures.length > 0);
});

test('complete valid runtime evidence passes and is reported precisely', () => {
  const result = run([response('enabled', 200), response('enabled', 403), ...denied()]);
  assert.equal(result.status, 0, result.output);
  assert.equal(result.registry.summary.gatePassed, true);
  assert.equal(result.registry.summary.runtimeConformantCount, 18);
  assert.equal(result.registry.summary.incompleteCount, 0);
  assert.equal(result.registry.summary.failureCount, 0);
  assert.equal(result.registry.operations[0].conformanceStatus, 'BOTH_VALIDATED');
});

test('disabled manifest count, duplicate and unknown entries cannot silently pass', () => {
  const events = [response('enabled', 200), response('enabled', 403), ...denied()];
  for (const override of [
    { expectedDisabledOperationCount: 99 },
    { implementedDefaultDeny: [...disabled, disabled[0]] },
    { implementedDefaultDeny: [...disabled.slice(1), 'missingOperation'] },
  ]) {
    const result = run(events, override);
    assert.equal(result.status, 1);
    assert.ok(result.registry.failures.length > 0);
  }
});
