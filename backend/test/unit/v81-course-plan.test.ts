import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coursePlanCapacity } from '../../src/modules/v8/domain/course-plan.js';

const plan = {
  rules: { minimumMinutes: 60 as const, weeklyLimit: 3 as const, courseTarget: 600, generalTarget: 600 },
  semesterStart: '2026-09-07', semesterEnd: '2026-12-31',
  startDate: '2026-09-07', endDate: '2026-10-25', dailyStart: '10:00:00', dailyEnd: '10:01:00',
  excludedDates: [] as string[], now: new Date('2026-09-07T01:00:00Z'),
  regularDeadline: new Date('2026-10-25T15:59:59Z'), timezone: 'Asia/Shanghai',
};

test('seven calendar weeks allow 21 slots even when each start window is one minute', () => {
  assert.deepEqual(coursePlanCapacity(plan), { availableSlots: 21, requiredSlots: 20, completable: true });
});
test('a passed local start window is not counted at publication', () => {
  const input = { ...plan, startDate: '2026-09-07', endDate: '2026-09-07' };
  assert.equal(coursePlanCapacity(input).availableSlots, 1);
  assert.equal(coursePlanCapacity({ ...input, now: new Date('2026-09-07T02:02:00Z') }).availableSlots, 0);
});
test('deadline before local daily opening excludes that day', () => {
  assert.equal(coursePlanCapacity({ ...plan, endDate: '2026-09-07',
    regularDeadline: new Date('2026-09-07T01:30:00Z') }).availableSlots, 0);
});
test('daily and shared weekly limits include exclusions and partial weeks', () => {
  const result = coursePlanCapacity({ ...plan, endDate: '2026-09-14',
    excludedDates: ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'] });
  assert.equal(result.availableSlots, 3); // Sat/Sun, then next Monday.
  assert.equal(result.completable, false);
});
test('category targets may require separate slots even when their total is unchanged', () => {
  const result = coursePlanCapacity({ ...plan,
    rules: { ...plan.rules, courseTarget: 601, generalTarget: 599 } });
  assert.equal(result.requiredSlots, 21);
});
test('semester dates cap nominal course dates and expired plans have no capacity', () => {
  assert.equal(coursePlanCapacity({ ...plan, semesterEnd: '2026-09-07' }).availableSlots, 1);
  assert.equal(coursePlanCapacity({ ...plan, now: new Date('2026-10-26T00:00:00Z') }).availableSlots, 0);
});
