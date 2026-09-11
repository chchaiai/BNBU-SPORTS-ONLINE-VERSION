import assert from 'node:assert/strict';
import { test } from 'node:test';
import { swimIntakeTiming, swimTransferClock } from '../../src/modules/v8/domain/swim-intake.js';
const ended = new Date('2026-09-07T02:00:00Z');
const after = (ms: number) => new Date(ended.getTime() + ms);
test('the server accepts the fifteen-minute boundary and grants thirty minutes from acceptance', () => {
  const result = swimIntakeTiming(ended, after(900000));
  assert.equal(result.intakeKind, 'ON_TIME');
  assert.equal(result.delayReason, null);
  assert.equal(result.transferDeadline.toISOString(), after(2700000).toISOString());
});
test('a late intake requires an explicit explanation and routes to offline handling', () => {
  assert.throws(() => swimIntakeTiming(ended, after(900001)), /SWIM_DELAY_REASON_REQUIRED/);
  const result = swimIntakeTiming(ended, after(900001), '  完全离线，恢复后提交已有材料。  ');
  assert.equal(result.intakeKind, 'OFFLINE_DELAYED');
  assert.equal(result.delayReason, '完全离线，恢复后提交已有材料。');
});
test('twenty-four hours is the final offline boundary and a future server end is rejected', () => {
  assert.equal(swimIntakeTiming(ended, after(86400000), '离线说明').intakeKind, 'OFFLINE_DELAYED');
  assert.throws(() => swimIntakeTiming(ended, after(86400001), '离线说明'), /SWIM_DELAY_WINDOW_EXPIRED/);
  assert.throws(() => swimIntakeTiming(ended, after(-1), '离线说明'), /INVALID_SESSION_END/);
});
test('overlapping transfer interruptions add their union and preserve elapsed transfer time', () => {
  const clock = swimTransferClock(ended, after(40 * 60000), [
    { startedAt: after(10 * 60000), endedAt: after(20 * 60000) },
    { startedAt: after(15 * 60000), endedAt: after(25 * 60000) },
  ]);
  assert.equal(clock.deadline.toISOString(), after(45 * 60000).toISOString());
  assert.equal(clock.remainingMs, 5 * 60000);
  assert.equal(clock.expired, false);
});
test('an open interruption pauses the current transfer window and does not renew it', () => {
  const clock = swimTransferClock(ended, after(40 * 60000), [{ startedAt: after(10 * 60000), endedAt: null }]);
  assert.equal(clock.paused, true);
  assert.equal(clock.remainingMs, 20 * 60000);
  assert.equal(clock.expired, false);
});
test('an interruption after a genuinely expired transfer cannot revive it', () => {
  const clock = swimTransferClock(ended, after(40 * 60000), [{ startedAt: after(31 * 60000), endedAt: null }]);
  assert.equal(clock.paused, false);
  assert.equal(clock.expired, true);
  assert.equal(clock.deadline.toISOString(), after(30 * 60000).toISOString());
});
test('confirmation exactly at the thirty-minute boundary is on time', () => {
  assert.equal(swimTransferClock(ended, after(30 * 60000), []).expired, false);
  assert.equal(swimTransferClock(ended, after(30 * 60000 + 1), []).expired, true);
});
