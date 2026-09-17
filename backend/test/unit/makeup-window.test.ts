import assert from 'node:assert/strict';
import test from 'node:test';
import { makeupWindowAllowsStart, validateMakeupWindow } from '../../src/modules/v8/domain/makeup-window.js';

const at = (text: string) => new Date(text);
const startBoundary = at('2026-09-01T00:00:00Z'), endBoundary = at('2026-09-08T00:00:00Z');
const valid = () => ({ startBoundary, endBoundary, now: at('2026-09-02T00:00:00Z'),
  startsAt: at('2026-09-03T00:00:00Z'), endsAt: at('2026-09-04T00:00:00Z') });
test('makeup grants stay within the teacher exercise dates', () => {
  assert.doesNotThrow(() => validateMakeupWindow(valid()));
  assert.doesNotThrow(() => validateMakeupWindow({ ...valid(), startsAt: startBoundary, endsAt: endBoundary }));
  assert.throws(() => validateMakeupWindow({ ...valid(), startsAt: at('2026-08-31T23:59:59Z') }), /MAKEUP_OUTSIDE_EXERCISE_DATES/);
  assert.throws(() => validateMakeupWindow({ ...valid(), endsAt: at('2026-09-08T00:00:00.001Z') }), /MAKEUP_OUTSIDE_EXERCISE_DATES/);
  assert.throws(() => validateMakeupWindow({ ...valid(), endsAt: valid().startsAt }), /MAKEUP_OUTSIDE_EXERCISE_DATES/);
  assert.throws(() => validateMakeupWindow({ ...valid(), now: valid().endsAt }), /MAKEUP_WINDOW_ALREADY_ENDED/);
  assert.doesNotThrow(() => validateMakeupWindow({ ...valid(), endBoundary: at('2026-09-09T00:00:00Z') }));
  assert.throws(() => validateMakeupWindow({ ...valid(), startsAt: new Date('invalid') }), /MAKEUP_TIME_INVALID/);
});
test('makeup starts use server time and never become retroactively authorized', () => {
  const window = { startsAt: at('2026-09-03T00:00:00Z'), endsAt: at('2026-09-04T00:00:00Z'),
    acceptedAt: at('2026-09-03T01:00:00Z'), revokedAt: null };
  assert.equal(makeupWindowAllowsStart(window, at('2026-09-03T00:30:00Z')), false);
  assert.equal(makeupWindowAllowsStart(window, window.acceptedAt), true);
  assert.equal(makeupWindowAllowsStart(window, at('2026-09-03T23:59:59.999Z')), true);
  assert.equal(makeupWindowAllowsStart(window, window.endsAt), false);
  const revoked = { ...window, revokedAt: at('2026-09-03T12:00:00Z') };
  assert.equal(makeupWindowAllowsStart(revoked, at('2026-09-03T11:59:59.999Z')), true);
  assert.equal(makeupWindowAllowsStart(revoked, revoked.revokedAt), false);
  assert.equal(makeupWindowAllowsStart(window, new Date('invalid')), false);
});
