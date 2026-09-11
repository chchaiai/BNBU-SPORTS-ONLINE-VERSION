import assert from 'node:assert/strict';
import { it } from 'node:test';
import { utils, write } from 'xlsx';
import { readPhysicalXlsx } from '../../src/modules/v8/domain/physical-xlsx.js';
const limits = { maxBytes: 1000000, maxRows: 100 };
function workbook() {
  const book = utils.book_new();
  const sheet = utils.aoa_to_sheet([['学号', '姓名', '项目', '用时', '测试日期'], ['001', 'A', '1000m', '4.30', '2026-09-07']]);
  utils.book_append_sheet(book, sheet, '体测');
  return { book, sheet, bytes: () => write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer };
}
it('reads XLSX draft with displayed student zeros, ambiguous time and explicit date formats', () => {
  const sample = workbook();
  sample.sheet.A2 = { t: 'n', v: 1, z: '000' };
  sample.sheet.E2 = { t: 'n', v: 46272, z: 'yyyy-mm-dd' };
  const result = readPhysicalXlsx(sample.bytes(), '体测', limits);
  assert.equal(result[0]!.studentNumber, '001');
  assert.equal(result[0]!.elapsed, '4.30');
  assert.equal(result[0]!.testedOn, '2026-09-07');
});
it('rejects formula results, merged cells, absent sheets and oversized row ranges', () => {
  const sample = workbook();
  assert.throws(() => readPhysicalXlsx(sample.bytes(), 'missing', limits), /SHEET_NOT_FOUND/);
  sample.sheet.D2 = { t: 'n', f: '240+30', v: 270 };
  assert.throws(() => readPhysicalXlsx(sample.bytes(), '体测', limits), /FORMULA/);
  delete sample.sheet.D2.f;
  sample.sheet['!merges'] = [utils.decode_range('A2:B2')];
  assert.throws(() => readPhysicalXlsx(sample.bytes(), '体测', limits), /MERGED/);
  delete sample.sheet['!merges'];
  sample.sheet['!ref'] = 'A1:E102';
  assert.throws(() => readPhysicalXlsx(sample.bytes(), '体测', limits), /ROW_LIMIT/);
});
