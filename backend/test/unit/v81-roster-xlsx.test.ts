import assert from 'node:assert/strict';
import { it } from 'node:test';
import { utils, write } from 'xlsx';
import { readRosterXlsx } from '../../src/modules/v8/domain/roster-xlsx.js';

const mapping = { studentNumber: '学号', fullName: '姓名' };
function sample(rows: string[][]) {
  const book = utils.book_new(), sheet = utils.aoa_to_sheet([['学号', '姓名', '原始备注'], ...rows]);
  utils.book_append_sheet(book, sheet, '名单');
  return { sheet, bytes: () => write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer };
}
it('keeps displayed identifiers, duplicate identities, invalid rows and source cell text', () => {
  const source = sample([['000123', ' Name ', 'original'], ['000123', 'Other', 'duplicate'], ['', '', 'invalid']]);
  source.sheet.A2 = { t: 'n', v: 123, z: '000000' };
  const bytes = source.bytes(), original = Buffer.from(bytes);
  const table = readRosterXlsx(bytes, '名单', mapping);
  assert.deepEqual(table.rows, [
    { sourceRowNumber: 2, cells: ['000123', ' Name ', 'original'] },
    { sourceRowNumber: 3, cells: ['000123', 'Other', 'duplicate'] },
    { sourceRowNumber: 4, cells: ['', '', 'invalid'] },
  ]);
  assert.deepEqual(bytes, original);
});
it('counts all 500 personnel rows including duplicates and invalid identities, rejecting 501', () => {
  const rows = Array.from({ length: 500 }, (_, index) => ['', '', String(index)]);
  assert.equal(readRosterXlsx(sample(rows).bytes(), '名单', mapping).rows.length, 500);
  assert.throws(() => readRosterXlsx(sample([...rows, ['', '', 'extra']]).bytes(), '名单', mapping), /ROW_LIMIT/);
});
it('rejects ambiguous sheets, missing identity columns, formulas and merged source cells', () => {
  const source = sample([['001', 'Name', '']]);
  assert.throws(() => readRosterXlsx(source.bytes(), 'missing', mapping), /SHEET_NOT_FOUND/);
  assert.throws(() => readRosterXlsx(source.bytes(), '名单', { ...mapping, fullName: 'unknown' }), /REQUIRED_COLUMNS/);
  source.sheet.A2 = { t: 'n', v: 123, f: '120+3' };
  assert.throws(() => readRosterXlsx(source.bytes(), '名单', mapping), /FORMULA/);
  delete source.sheet.A2.f;
  source.sheet['!merges'] = [utils.decode_range('A2:B2')];
  assert.throws(() => readRosterXlsx(source.bytes(), '名单', mapping), /MERGED_CELLS/);
});

it('reads original BIFF XLS with Chinese text, leading zeroes and row limits', () => {
  const book = utils.book_new();
  const sheet = utils.aoa_to_sheet([['学号', '姓名'], [123, '测试学生']]);
  sheet.A2.z = '000000';
  utils.book_append_sheet(book, sheet, '名单');
  const bytes = write(book, { type: 'buffer', bookType: 'xls' }) as Buffer;
  assert.deepEqual(readRosterXlsx(bytes, '名单', mapping).rows[0]?.cells, ['000123', '测试学生']);
  const large = utils.book_new();
  utils.book_append_sheet(large, utils.aoa_to_sheet([['学号', '姓名'], ...Array.from({length: 501}, () => ['001', 'Synthetic'])]), '名单');
  assert.throws(() => readRosterXlsx(write(large, {type: 'buffer', bookType: 'xls'}), '名单', mapping), /ROW_LIMIT/);
});
