import assert from 'node:assert/strict';
import { it } from 'node:test';
import { convertEndurance, initialEnduranceBands, validateEnduranceTable, type EnduranceTableKey } from '../../src/modules/v8/domain/endurance-table.js';
const key: EnduranceTableKey = { gender: 'male', gradeGroup: 'freshman_sophomore', runType: '1000m' };
let next = 0;
const bands = () => initialEnduranceBands(key, () => String(++next));
it('creates all four documented 101-row tables and matches every integer second uniquely', () => {
  for (const [gender, gradeGroup, top, bottom] of [
    ['male', 'freshman_sophomore', 239, 537], ['male', 'junior_senior', 249, 547],
    ['female', 'freshman_sophomore', 229, 527], ['female', 'junior_senior', 239, 537],
  ] as const) {
    const table: EnduranceTableKey = { gender, gradeGroup, runType: gender === 'male' ? '1000m' : '800m' };
    const rows = initialEnduranceBands(table, () => String(++next));
    assert.equal(rows.length, 101);
    assert.equal(rows[0]!.maxSeconds, top);
    assert.equal(rows[100]!.minSeconds, bottom);
    for (let seconds = 0; seconds <= 600; seconds++) {
      const expected = seconds <= top ? 100 : seconds >= bottom ? 0 : 99 - Math.floor((seconds - top - 1) / 3);
      assert.equal(convertEndurance(table, rows, seconds).score, expected);
    }
    assert.throws(() => convertEndurance(table, rows, 601), /UNMATCHED/);
  }
});
it('rejects invalid edits and deletions, including grades and increasing scores', () => {
  const rows = bands();
  assert.throws(() => validateEnduranceTable(key, []), /EMPTY/);
  assert.throws(() => validateEnduranceTable({ ...key, runType: '800m' }, rows), /COMBINATION/);
  assert.throws(() => validateEnduranceTable(key, rows.filter((_, index) => index !== 50)), /CONTINUITY/);
  for (const change of [{ minSeconds: 0.5 }, { maxSeconds: Infinity }, { score: 1.5 },
    { score: 101 }, { tier: 'fail' as const }, { maxSeconds: 240 }]) {
    assert.throws(() => validateEnduranceTable(key, [{ ...rows[0]!, ...change }, ...rows.slice(1)]));
  }
  assert.throws(() => validateEnduranceTable(key, [rows[0]!, { ...rows[1]!, score: 98 }, ...rows.slice(2).map((row, index) =>
    index === 0 ? { ...row, score: 99 } : row)]), /SCORE_ORDER/);
  assert.throws(() => convertEndurance(key, rows, -1), /TIME_INVALID/);
});
