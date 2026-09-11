import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  eligibleMinutes,
  selectCredits,
  type CreditCandidate,
  type CreditRules,
} from '../../src/modules/v8/domain/crediting.js';
import { supplementClock } from '../../src/modules/v8/domain/deadlines.js';
import { validateReview } from '../../src/modules/v8/domain/review.js';

const candidate = (
  id: string,
  date: string,
  category: 'COURSE_RELATED' | 'GENERAL',
  minutes: number,
): CreditCandidate => ({
  id,
  businessDate: date,
  startedAt: `${date}T10:00:00+08:00`,
  category,
  actualSeconds: minutes * 60,
  valid: true,
  previouslySelected: false,
});
test('V8.1 records preserve actual minutes and credit only whole minutes above the threshold', () => {
  assert.equal(eligibleMinutes(29 * 60 + 59, 30), 0);
  assert.equal(eligibleMinutes(30 * 60, 30), 30);
  assert.equal(eligibleMinutes(45 * 60 + 59, 30), 45);
  assert.equal(eligibleMinutes(180 * 60, 30), 60);
  assert.equal(eligibleMinutes(44 * 60 + 59, 45), 0);
});
test('V8.1 category caps require a joint choice instead of choosing the earliest daily record', () => {
  const result = selectCredits(
    [
      candidate('a', '2026-09-07', 'COURSE_RELATED', 60),
      candidate('b', '2026-09-07', 'GENERAL', 45),
      candidate('c', '2026-09-08', 'COURSE_RELATED', 60),
    ],
    { courseTarget: 60, generalTarget: 1140, minimumMinutes: 30, weeklyLimit: 2 },
  );
  assert.equal(result.totalMinutes, 105);
  assert.deepEqual(
    result.records.filter((item) => item.selected).map((item) => item.id),
    ['b', 'c'],
  );
});

function exhaustiveMaximum(items: CreditCandidate[], rules: CreditRules): number {
  let maximum = 0;
  for (let mask = 0; mask < 2 ** items.length; mask++) {
    const dates = new Set<string>();
    let course = 0,
      general = 0,
      count = 0,
      allowed = true;
    for (let index = 0; index < items.length; index++) {
      if (!(mask & (1 << index))) continue;
      const record = items[index]!;
      if (!record.valid || dates.has(record.businessDate)) {
        allowed = false;
        break;
      }
      dates.add(record.businessDate);
      count++;
      const minutes = Math.floor(record.actualSeconds / 60);
      const eligible = minutes < rules.minimumMinutes ? 0 : Math.min(minutes, 60);
      if (record.category === 'COURSE_RELATED') course += eligible;
      else general += eligible;
    }
    if (allowed && count <= rules.weeklyLimit)
      maximum = Math.max(
        maximum,
        Math.min(course, rules.courseTarget) + Math.min(general, rules.generalTarget),
      );
  }
  return maximum;
}
test('V8.1 dynamic selection agrees with an independent exhaustive subset oracle', () => {
  let random = 1987;
  const next = () => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return random;
  };
  for (let scenario = 0; scenario < 80; scenario++) {
    const rules: CreditRules = {
      courseTarget: 30 + (next() % 150),
      generalTarget: 0,
      minimumMinutes: 30,
      weeklyLimit: 2,
    };
    rules.generalTarget = 1200 - rules.courseTarget;
    const records = Array.from({ length: 8 }, (_, index) =>
      candidate(
        String(index),
        `2026-09-${String(7 + (next() % 5)).padStart(2, '0')}`,
        next() % 3 ? 'COURSE_RELATED' : 'GENERAL',
        20 + (next() % 80),
      ),
    );
    const result = selectCredits(records, rules);
    assert.equal(result.totalMinutes, exhaustiveMaximum(records, rules));
    assert.equal(
      result.records.reduce((sum, item) => sum + item.creditedMinutes, 0),
      result.totalMinutes,
    );
    const extra = candidate('extra', '2026-09-12', 'GENERAL', 60);
    assert.ok(selectCredits([...records, extra], rules).totalMinutes >= result.totalMinutes);
  }
});
test('V8.1 equal totals retain the previously credited combination', () => {
  const first = candidate('a', '2026-09-07', 'GENERAL', 60);
  const previous = { ...candidate('b', '2026-09-07', 'GENERAL', 60), previouslySelected: true };
  const result = selectCredits([first, previous], {
    courseTarget: 0,
    generalTarget: 1200,
    minimumMinutes: 30,
    weeklyLimit: 3,
  });
  assert.deepEqual(
    result.records.filter((item) => item.selected).map((item) => item.id),
    ['b'],
  );
});
test('Supplement interruption compensation uses the union and cannot resurrect prior expiry', () => {
  const start = new Date('2026-09-07T00:00:00Z');
  const at = (hours: number) => new Date(start.getTime() + hours * 3600000);
  const interruptions = [
    { startedAt: at(2), endedAt: at(4) },
    { startedAt: at(3), endedAt: at(5) },
  ];
  assert.equal(supplementClock(start, 24, interruptions, at(26)).remainingMs, 3600000);
  assert.equal(supplementClock(start, 24, interruptions, at(27)).expired, true);
  const paused = supplementClock(
    start,
    24,
    [...interruptions, { startedAt: at(25), endedAt: null }],
    at(26),
  );
  assert.equal(paused.paused, true);
  assert.equal(paused.remainingMs, 2 * 3600000);
  const alreadyExpired = supplementClock(start, 24, [{ startedAt: at(25), endedAt: null }], at(26));
  assert.equal(alreadyExpired.expired, true);
  assert.equal(alreadyExpired.paused, false);
});
test('Review reasons and one-time supplement restrictions cannot be bypassed', () => {
  assert.throws(() =>
    validateReview({
      action: 'INVALID',
      reasonCode: 'AUTHENTICITY_REQUIRES_CLARIFICATION',
      supplementUsed: true,
    }),
  );
  assert.throws(() =>
    validateReview({
      action: 'RETURN_FOR_SUPPLEMENT',
      reasonCode: 'CONFIRMED_REUSE_OR_MISUSE',
      supplementUsed: false,
    }),
  );
  assert.throws(() =>
    validateReview({
      action: 'RETURN_FOR_SUPPLEMENT',
      reasonCode: 'UNCLEAR_EVIDENCE',
      supplementUsed: true,
    }),
  );
  assert.throws(() =>
    validateReview({ action: 'VALID', supplementUsed: false, internalNote: 'hidden' }),
  );
  assert.equal(
    validateReview({
      action: 'RETURN_FOR_SUPPLEMENT',
      reasonCode: 'UNCLEAR_EVIDENCE',
      supplementUsed: false,
    }).supplementHours,
    24,
  );
});
