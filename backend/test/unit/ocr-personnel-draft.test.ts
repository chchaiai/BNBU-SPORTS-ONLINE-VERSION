import assert from 'node:assert/strict';
import test from 'node:test';
import type { OcrCell, OcrTableSource } from '../../src/modules/v8/domain/ocr-table-source.js';
import { selectOcrPersonnelDraft } from '../../src/modules/v8/domain/ocr-personnel-draft.js';
const cell = (row: number, column: number, text: string): OcrCell => ({ text, rowStart: row, rowEnd: row + 1,
  columnStart: column, columnEnd: column + 1, confidence: null, polygon: [] });
const source = (cells: OcrCell[]): OcrTableSource => ({ provider: 'TENCENT_TABLE_V3', requestId: 'synthetic',
  sourceSha256: 'b'.repeat(64), requiresTeacherConfirmation: true, tables: [{ cells }] });
const headers = [cell(0, 0, '学号'), cell(0, 1, '姓名')];
const selection = { purpose: 'ROSTER' as const, tableIndex: 0, headerRow: 0, columns: { studentNumber: 0, name: 1 } };
test('explicit mapping retains duplicate and missing personnel rows and source evidence without confirming', () => {
  const input = source([...headers, cell(1, 0, '000123'), cell(1, 1, ' 王明 '), cell(2, 0, '000123')]);
  const before = structuredClone(input);
  const result = selectOcrPersonnelDraft(input, selection);
  assert.deepEqual(input, before);
  assert.equal(result.personnelRowCount, 2);
  assert.deepEqual(result.rows.map(row => row.values.studentNumber), ['000123', '000123']);
  assert.equal(result.rows.at(0)?.values.name, ' 王明 ');
  assert.ok(result.rows.every(row => !row.confirmed && row.issues.some(issue => issue.code === 'DUPLICATE_STUDENT_ROW')));
  assert.ok(result.rows.at(1)?.issues.some(issue => issue.code === 'MISSING_CELL'));
  assert.deepEqual(result.rows.at(0)?.evidence.studentNumber, [2]);
});
test('500 rows accepted and 501 rejected including duplicate/error rows; missing mapping and ambiguous cells cannot silently pass', () => {
  const cells = Array.from({ length: 500 }, (_, index) => cell(index + 1, 0, '000123'));
  assert.equal(selectOcrPersonnelDraft(source([...headers, ...cells]), selection).personnelRowCount, 500);
  assert.throws(() => selectOcrPersonnelDraft(source([...headers, ...cells, cell(501, 0, '')]), selection), /ROW_LIMIT/);
  assert.throws(() => selectOcrPersonnelDraft(source(headers), { ...selection, columns: { studentNumber: 0, name: 0 } }), /MAPPING/);
  const merged = { ...cell(1, 0, 'uncertain'), rowEnd: 3 };
  const draft = selectOcrPersonnelDraft(source([...headers, merged, cell(1, 1, 'A'), cell(2, 1, 'B')]), selection);
  assert.equal(draft.personnelRowCount, 2);
  assert.ok(draft.rows.every(row => row.issues.some(issue => issue.code === 'MERGED_OR_INVALID_CELL_SPAN')));
});
