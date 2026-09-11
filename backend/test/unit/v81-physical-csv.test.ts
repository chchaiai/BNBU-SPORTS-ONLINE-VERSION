import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readPhysicalCsv } from '../../src/modules/v8/domain/physical-csv.js';
import { inspectPhysicalImport } from '../../src/modules/v8/domain/physical-import.js';
const limits = { maxBytes: 10000, maxRows: 100 };
const csv = (text: string) => readPhysicalCsv(Buffer.from(text), limits);
it('preserves student-number zeros, quoted cells and ambiguous time in the review draft', () => {
  const rows = csv('\uFEFF学号,姓名,项目,用时,测试日期\r\n001,"Student, A",1000m,4.30,2026-09-07\r\n');
  assert.deepEqual(rows, [{ studentNumber: '001', name: 'Student, A', runType: '1000m', elapsed: '4.30', testedOn: '2026-09-07' }]);
  const draft = inspectPhysicalImport(rows, [{ studentNumber: '001', name: 'Student, A', gender: 'MALE', enrollmentId: 'enrollment' }]);
  assert.ok(draft[0]!.issues.includes('AMBIGUOUS_OR_INVALID_TIME'));
  assert.equal(draft[0]!.confirmed, false);
});
it('rejects missing or duplicate columns, invalid UTF-8, broken CSV and configured resource limits', () => {
  for (const text of ['学号,姓名\n001,A', '学号,姓名,项目,用时,用时\n001,A,1000m,270,270',
    '学号,姓名,项目,用时,测试日期\n001,"broken,1000m,270,2026-09-07', '学号,姓名,项目,用时,测试日期']) assert.throws(() => csv(text));
  assert.throws(() => readPhysicalCsv(Uint8Array.from([0xff]), limits), /ENCODING/);
  assert.throws(() => readPhysicalCsv(Buffer.from('oversize'), { ...limits, maxBytes: 2 }), /SIZE/);
  assert.throws(() => readPhysicalCsv(Buffer.from('学号,姓名,项目,用时,测试日期\n001,A,1000m,270,2026-09-07\n002,B,800m,260,2026-09-07'),
    { ...limits, maxRows: 1 }), /ROW_LIMIT/);
});
