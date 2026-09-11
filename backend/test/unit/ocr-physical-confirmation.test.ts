import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectOcrPhysicalConfirmation, selectOcrPhysicalConfirmation, type OcrPhysicalWorkingRow } from '../../src/modules/v8/domain/ocr-physical-confirmation.js';

const member = { studentNumber: '000123', name: 'Test Student', gender: 'FEMALE', enrollmentId: 'enrollment-one' };
const valid = (): OcrPhysicalWorkingRow => ({ id: 'row-one', reviewedAgainstSource: true,
  values: { studentNumber: '000123', name: 'Test Student', runType: '800m', elapsed: '4:30', testedOn: '2026-09-08' } });

test('OCR physical confirmation requires source review and exact identity, project, time and date', () => {
  const cases: [OcrPhysicalWorkingRow, string][] = [
    [{ ...valid(), reviewedAgainstSource: false }, 'SOURCE_REVIEW_REQUIRED'],
    [{ ...valid(), values: { ...valid().values, studentNumber: '123' } }, 'STUDENT_NUMBER_NOT_UNIQUE_MATCH'],
    [{ ...valid(), values: { ...valid().values, name: 'Similar Student' } }, 'NAME_MISMATCH'],
    [{ ...valid(), values: { ...valid().values, runType: '1000m' } }, 'PROJECT_MISMATCH'],
    [{ ...valid(), values: { ...valid().values, elapsed: '4.30' } }, 'AMBIGUOUS_OR_INVALID_TIME'],
    [{ ...valid(), values: { ...valid().values, testedOn: '2026-02-30' } }, 'INVALID_TEST_DATE'],
    [{ ...valid(), values: { studentNumber: '000123', name: 'Test Student' } }, 'PHYSICAL_FIELDS_REQUIRED'],
  ];
  for (const [row, issue] of cases) {
    assert.ok(inspectOcrPhysicalConfirmation([row], [member])[0]!.issues.includes(issue));
    assert.throws(() => selectOcrPhysicalConfirmation([row], [member], [row.id]), /OCR_SELECTED_ROWS_UNRESOLVED/);
  }
});

test('selection cannot hide duplicates, but unrelated unresolved rows remain pending', () => {
  const row = valid(), duplicate = { ...valid(), id: 'row-two' };
  assert.throws(() => selectOcrPhysicalConfirmation([row, duplicate], [member], [row.id]), /OCR_SELECTED_ROWS_UNRESOLVED/);
  const unrelated = { ...valid(), id: 'row-three', reviewedAgainstSource: false,
    values: { ...valid().values, studentNumber: '999999' } };
  const before = structuredClone([row, unrelated]);
  assert.deepEqual(selectOcrPhysicalConfirmation([row, unrelated], [member], [row.id]), [{ rowId: row.id,
    enrollmentId: member.enrollmentId, runType: '800m', elapsedSeconds: 270, testedOn: '2026-09-08' }]);
  assert.deepEqual([row, unrelated], before);
  assert.throws(() => selectOcrPhysicalConfirmation([row, unrelated], [member], [row.id, unrelated.id]), /OCR_SELECTED_ROWS_UNRESOLVED/);
  assert.throws(() => selectOcrPhysicalConfirmation([row], [member], [row.id, row.id]), /OCR_SELECTION_INVALID/);
  assert.throws(() => selectOcrPhysicalConfirmation([row], [member], ['unknown']), /OCR_SELECTED_ROW_NOT_FOUND/);
  assert.throws(() => inspectOcrPhysicalConfirmation(Array.from({ length: 501 }, (_, i) => ({ ...valid(), id: String(i) })), [member]), /OCR_DRAFT_ROWS_INVALID/);
});
