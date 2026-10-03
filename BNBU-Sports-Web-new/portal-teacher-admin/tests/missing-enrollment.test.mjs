import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { missingEnrollmentRows } from '../app/missing-enrollment.ts';

test('missing export includes students outside this class, deduplicates and preserves IDs', () => {
  const row = (status, studentNumber, name = '测试学生') => ({ status, officialStudent: { studentNumber, name } });
  const rows = missingEnrollmentRows([
    row('MISSING_IN_PLATFORM', '000123'), row('WRONG_COURSE', '000124'),
    row('MISSING_IN_PLATFORM', '000123'), row('MATCHED', '000125'),
    row('IDENTITY_CONFLICT', '000126'), row('DUPLICATED', '000127'),
    { status: 'EXTRA_IN_PLATFORM' }, { status: 'MISSING_IN_PLATFORM' },
  ]);
  assert.deepEqual(rows.map(row => row.studentNumber), ['000123', '000124']);
});

test('spreadsheet round trip keeps leading zeros and formula-like names as text', () => {
  const sheet = XLSX.utils.aoa_to_sheet([['学号', '姓名'], ['000123', '=1+1']]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, '未入班学生');
  const restored = XLSX.read(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  assert.equal(restored.Sheets['未入班学生'].A2.v, '000123');
  assert.equal(restored.Sheets['未入班学生'].B2.v, '=1+1');
  assert.equal(restored.Sheets['未入班学生'].B2.f, undefined);
  assert.deepEqual(missingEnrollmentRows([]), []);
});
