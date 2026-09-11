import { required } from '../helpers/required.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeTencentTableSource } from '../../src/modules/v8/domain/ocr-table-source.js';
const digest = 'a'.repeat(64);
const cell = (Text: string) => ({ Text, RowTl: 1, RowBr: 2, ColTl: 0, ColBr: 1, Confidence: 99.9,
  Polygon: [{ X: 0, Y: 0 }, { X: 10, Y: 0 }, { X: 10, Y: 20 }, { X: 0, Y: 20 }] });
const response = (cells: Record<string, unknown>[] = [cell('000123'), cell('4.30')]) => ({ RequestId: 'synthetic-provider-request', TableDetections: [{ Cells: cells }] });
test('OCR source preserves ambiguous text, duplicate cells, confidence and source binding without changing input', () => {
  const input = response([cell('000123'), cell('000123'), cell('  王\n明  '), cell('4.30')]);
  const before = structuredClone(input);
  const result = decodeTencentTableSource(input, digest);
  assert.deepEqual(input, before);
  assert.deepEqual(required(result.tables[0]).cells.map(row => row.text), ['000123', '000123', '  王\n明  ', '4.30']);
  assert.equal(result.requiresTeacherConfirmation, true);
  assert.equal(result.sourceSha256, digest);
  assert.equal(required(required(result.tables[0]).cells[0]).confidence, 99.9);
  required(required(required(result.tables[0]).cells[0]).polygon[0]).x = 99;
  assert.equal((required(required(input.TableDetections[0]).Cells[0]).Polygon as { X: number }[])[0]?.X, 0);
});
test('OCR unknown confidence remains unavailable; malformed coordinates, confidence, provider failure and empty detection reject', () => {
  assert.equal(required(required(decodeTencentTableSource(response([{ ...cell('x'), Confidence: null }]), digest).tables[0]).cells[0]).confidence, null);
  for (const patch of [{ Confidence: NaN }, { Confidence: 101 }, { RowTl: -1 }, { RowBr: 0 },
    { ColBr: -1 }, { Text: 123 }, { Polygon: [] }])
    assert.throws(() => decodeTencentTableSource(response([{ ...cell('x'), ...patch }]), digest));
  assert.throws(() => decodeTencentTableSource({ Error: { Message: 'Synthetic private upstream detail' } }, digest), /OCR_PROVIDER_REJECTED/);
  assert.throws(() => decodeTencentTableSource({ RequestId: 'id', TableDetections: null }, digest), /OCR_NO_TABLE_DETECTED/);
  assert.throws(() => decodeTencentTableSource(response(), 'invalid'), /OCR_SOURCE_DIGEST_INVALID/);
});
test('provider evidence bounds reject excessive cells and text before draft admission', () => {
  assert.throws(() => decodeTencentTableSource(response(Array(32001).fill(cell('x'))), digest), /OCR_PROVIDER_RESPONSE_LIMIT/);
  assert.throws(() => decodeTencentTableSource(response(Array(65).fill(cell('x'.repeat(16384)))), digest), /OCR_PROVIDER_RESPONSE_LIMIT/);
});
