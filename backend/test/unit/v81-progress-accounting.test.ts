import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryProgress, exerciseAccounting } from '../../src/modules/v8/domain/progress-accounting.js';
test('recognition and exercise preserve category targets without counting overflow twice', () => {
  assert.deepEqual(categoryProgress(600, 500n, 200n), { targetSeconds: 36000, validExerciseSeconds: 24000,
    recognizedSeconds: 12000, effectiveSeconds: 36000, remainingSeconds: 0 });
  assert.equal(categoryProgress(600, 60n, 0n).remainingSeconds, 32400);
  assert.equal(categoryProgress(0, 60n, 120n).effectiveSeconds, 0);
});
test('actual exercise remains separated into invalid, pending, credited and valid uncredited durations', () => {
  const totals = exerciseAccounting([{ actualSeconds: 4500, creditedSeconds: 3600, decision: 'VALID' },
    { actualSeconds: 1800, creditedSeconds: 0, decision: 'VALID' },
    { actualSeconds: 2700, creditedSeconds: 0, decision: 'INVALID' },
    { actualSeconds: 1900, creditedSeconds: 0, decision: 'PENDING' }]);
  assert.deepEqual(totals, { actualSeconds: 10900, invalidActualSeconds: 2700, validUncreditedSeconds: 2700,
    creditedSeconds: 3600, pendingActualSeconds: 1900 });
  assert.equal(totals.actualSeconds, totals.invalidActualSeconds + totals.validUncreditedSeconds + totals.creditedSeconds + totals.pendingActualSeconds);
});
test('invalid projections fail rather than producing a negative remainder or false completion', () => {
  assert.throws(() => categoryProgress(600, -1n, 0n));
  assert.throws(() => exerciseAccounting([{ actualSeconds: 60, creditedSeconds: 61, decision: 'VALID' }]));
  assert.throws(() => exerciseAccounting([{ actualSeconds: 60, creditedSeconds: 1, decision: 'INVALID' }]));
});
