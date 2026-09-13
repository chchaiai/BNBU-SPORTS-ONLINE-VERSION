import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectCredits, type CreditCandidate } from '../../src/modules/v8/domain/crediting.js';

const rules = { minimumMinutes: 60 as const, weeklyLimit: 3 as const, courseTarget: 600, generalTarget: 600 };
test('historical drafts expose no awarded credit before review', async () => {
  const { projectV81Records } = await import('../../src/modules/v8/v81-record-projection.js');
  let query = 0;
  const tx = { $queryRaw: async () => ++query === 1 ? [] : [{ session_id: 'history' }] };
  const record = {
    id: 'draft', sessionId: 'history', businessDate: new Date('2026-09-11'),
    actualDurationSeconds: 2400n, pausedDurationSeconds: 0n, creditedDurationSeconds: 2400n,
    submittedAt: null, cancelledAt: null, reviews: [], status: 'DRAFT',
  };
  const [projected] = await projectV81Records(
    tx as unknown as Parameters<typeof projectV81Records>[0],
    [record as unknown as Parameters<typeof projectV81Records>[1][number]],
  );
  assert.equal(projected?.recordOrigin, 'HISTORICAL');
  assert.equal(projected?.creditedDurationSeconds, 0);
});
const records: CreditCandidate[] = Array.from({ length: 4 }, (_, index) => ({
  id: `record-${index}`, category: index % 2 ? 'GENERAL' : 'COURSE_RELATED',
  startedAt: `2026-09-07T0${index}:00:00Z`, businessDate: '2026-09-07',
  actualSeconds: 3600, valid: true, previouslySelected: false,
}));

test('legacy rules keep one credited record per day', () => {
  assert.equal(selectCredits(records, rules).totalMinutes, 60);
});
test('configured daily limit credits distinct records across both categories', () => {
  const result = selectCredits(records, { ...rules, dailyLimit: 2 });
  assert.equal(result.totalMinutes, 120);
  assert.equal(result.records.filter(record => record.selected).length, 2);
});
test('weekly limit continues to cap a larger daily allowance', () => {
  assert.equal(selectCredits(records, { ...rules, dailyLimit: 4 }).totalMinutes, 180);
});
test('historical date competes with existing records on the same date', () => {
  const retained = records.map((record, index) => ({ ...record, previouslySelected: index === 3 }));
  assert.equal(selectCredits(retained, { ...rules, dailyLimit: 2 }).records[3]?.selected, true);
});
test('invalid daily counts are rejected', () => {
  for (const dailyLimit of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => selectCredits(records, { ...rules, dailyLimit }), /INVALID_COURSE_RULES/);
  }
});
