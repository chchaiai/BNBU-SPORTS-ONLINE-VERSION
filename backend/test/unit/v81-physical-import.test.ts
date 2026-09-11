import assert from 'node:assert/strict';
import { it } from 'node:test';
import { inspectPhysicalImport, parsePhysicalElapsed, validPhysicalDate } from '../../src/modules/v8/domain/physical-import.js';
it('parses explicit seconds and minutes while refusing ambiguous decimal notation', () => {
  for (const value of ['270', '270秒', '270 s', '4:30', '4分30秒']) assert.equal(parsePhysicalElapsed(value), 270);
  for (const value of ['4.30', '4,30', '4:60', '-1', '4:3', '', '4m30', '9007199254740992']) assert.equal(parsePhysicalElapsed(value), null);
  assert.equal(validPhysicalDate('2024-02-29'), true);
  for (const value of ['2026-02-29', '2026-02-30', '0000-01-01', '07/09/26', '2026-13-01']) assert.equal(validPhysicalDate(value), false);
});
it('matches exact student numbers, flags every duplicate, and never confirms rows automatically', () => {
  const members = [{ studentNumber: '001', name: 'Student A', enrollmentId: 'enrollment-a', gender: 'MALE' }];
  const row = { studentNumber: '001', name: 'Student A', runType: '1000m', elapsed: '4:30', testedOn: '2026-09-07' };
  const valid = inspectPhysicalImport([row], members)[0]!;
  assert.deepEqual(valid.issues, []);
  assert.equal(valid.confirmed, false);
  assert.equal(valid.elapsedSeconds, 270);
  const unknown = inspectPhysicalImport([{ ...row, studentNumber: '999' }], members)[0]!;
  assert.equal(unknown.enrollmentId, null);
  assert.ok(unknown.issues.includes('STUDENT_NUMBER_NOT_UNIQUE_MATCH'));
  for (const item of inspectPhysicalImport([row, row], members)) assert.ok(item.issues.includes('DUPLICATE_STUDENT_ROW'));
  const mismatch = inspectPhysicalImport([{ ...row, name: 'Wrong', runType: '800m', elapsed: '4.30' }], members)[0]!;
  assert.deepEqual(mismatch.issues, ['NAME_MISMATCH', 'PROJECT_MISMATCH', 'AMBIGUOUS_OR_INVALID_TIME']);
});
