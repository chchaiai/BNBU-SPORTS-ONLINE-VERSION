import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareOcrRosterSnapshot, type OcrRosterWorkingRow } from '../../src/modules/v8/domain/ocr-roster-snapshot.js';
import { projectRosterRegistration } from '../../src/modules/v8/domain/roster-registration.js';

const row = (id = 'row-one'): OcrRosterWorkingRow => ({ id, values: { studentNumber: ' 000123 ', name: ' Original Name ' },
  source: { pageId: 'synthetic-page', attempt: 2, tableIndex: 0, sourceRow: 3 }, ocrIssues: [{ code: 'LOW_CONFIDENCE' }], reviewedAgainstSource: true });
test('paper roster retains duplicates, original spelling and source without inventing registration', () => {
  const input = [row(), { ...row('row-two'), values: { studentNumber: '000123', name: 'Other Name' } }];
  const before = structuredClone(input), snapshot = prepareOcrRosterSnapshot(input);
  assert.equal(snapshot.length, 2);
  assert.ok(snapshot.every(item => item.duplicateIdentity));
  assert.equal(snapshot[0]!.rawStudentNumber, ' 000123 ');
  assert.equal(snapshot[0]!.rawFullName, ' Original Name ');
  assert.equal(snapshot[0]!.studentNumber, '000123');
  assert.deepEqual(snapshot[0]!.ocrSource, input[0]!.source);
  assert.deepEqual(snapshot[0]!.ocrIssues, input[0]!.ocrIssues);
  const projected = projectRosterRegistration(snapshot, []);
  assert.equal(projected.denominator, null); assert.equal(projected.registrationComplete, false);
  assert.ok(projected.rows.every(item => item.status === 'IDENTITY_CONFLICT'));
  assert.deepEqual(input, before);
  (snapshot[0]!.ocrSource as { sourceRow: number }).sourceRow = 99;
  assert.deepEqual(input, before);
  const unmatched = projectRosterRegistration(prepareOcrRosterSnapshot([row()]), []);
  assert.equal(unmatched.rows[0]!.status, 'PENDING_REGISTRATION');
  assert.equal(unmatched.denominator, 1);
});

test('all source rows need review and valid required fields; duplicates count toward 500', () => {
  assert.throws(() => prepareOcrRosterSnapshot([{ ...row(), reviewedAgainstSource: false }]), /OCR_SOURCE_REVIEW_REQUIRED/);
  assert.throws(() => prepareOcrRosterSnapshot([{ ...row(), values: { name: 'Name' } }]), /OCR_ROSTER_FIELDS_REQUIRED/);
  assert.throws(() => prepareOcrRosterSnapshot([{ ...row(), values: { studentNumber: '', name: 'Name' } }]), /OCR_ROSTER_IDENTITY_INVALID/);
  assert.throws(() => prepareOcrRosterSnapshot([row(), row()]), /OCR_ROSTER_ROWS_INVALID/);
  const fiveHundred = Array.from({ length: 500 }, (_, i) => row(String(i)));
  assert.equal(prepareOcrRosterSnapshot(fiveHundred).length, 500);
  assert.throws(() => prepareOcrRosterSnapshot([...fiveHundred, row('extra')]), /OCR_ROSTER_ROWS_INVALID/);
});
