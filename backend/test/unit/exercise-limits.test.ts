import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eligibleMinutes, selectCredits } from '../../src/modules/v8/domain/crediting.js';

test('single credit limit follows each record snapshot including legacy records', () => {
  assert.equal(eligibleMinutes(5399, 90, 120), 0);
  assert.equal(eligibleMinutes(5400, 90, 120), 90);
  assert.equal(eligibleMinutes(9000, 90, 120), 120);
  const records = [undefined, 30, 90].map((maximumMinutes, index) => ({
    id: String(index), category: 'GENERAL' as const,
    startedAt: `2026-09-0${7 + index}T10:00:00Z`, businessDate: `2026-09-0${7 + index}`,
    actualSeconds: 7200, valid: true, previouslySelected: false,
    ...(maximumMinutes === undefined ? {} : { maximumMinutes }),
  }));
  assert.equal(selectCredits(records, {
    minimumMinutes: 20, weeklyLimit: 7, courseTarget: 600, generalTarget: 600,
  }).totalMinutes, 180);
});
