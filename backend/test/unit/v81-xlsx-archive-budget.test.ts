import assert from 'node:assert/strict';
import { it } from 'node:test';
import { utils, write } from 'xlsx';
import { inspectXlsxArchiveBudget } from '../../src/modules/v8/domain/xlsx-archive-budget.js';
function sample(compression = true): Buffer {
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet([['学号', '姓名'], ['001', 'Synthetic']]), '名单');
  return write(book, { type: 'buffer', bookType: 'xlsx', compression }) as Buffer;
}
it('admits stored and deflated XLSX within declared budgets', () => {
  for (const compressed of [false, true]) {
    const budget = inspectXlsxArchiveBudget(sample(compressed));
    assert.ok(budget.entries > 1);
    assert.ok(budget.expandedBytes > 100);
  }
});
it('rejects declared expansion and entry budgets before spreadsheet parsing', () => {
  assert.throws(() => inspectXlsxArchiveBudget(sample(), { maxEntries: 1, maxExpandedBytes: 1e6 }), /ENTRY_LIMIT/);
  assert.throws(() => inspectXlsxArchiveBudget(sample(), { maxEntries: 1024, maxExpandedBytes: 100 }), /EXPANDED_LIMIT/);
});
it('rejects truncated directories and mismatched local size claims', () => {
  const source = sample(false);
  assert.throws(() => inspectXlsxArchiveBudget(source.subarray(0, source.length - 1)), /DIRECTORY_INVALID/);
  source.writeUInt32LE(source.readUInt32LE(22) + 1, 22);
  assert.throws(() => inspectXlsxArchiveBudget(source), /SIZE_MISMATCH/);
});
it('bounds actual inflation even when local and central sizes consistently understate output', () => {
  const source = sample(true);
  const central = source.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(central > 0);
  const local = source.readUInt32LE(central + 42);
  source.writeUInt32LE(1, central + 24);
  source.writeUInt32LE(1, local + 22);
  assert.throws(() => inspectXlsxArchiveBudget(source), /DECOMPRESSION_FAILED/);
});
it('checks stored entry byte length and CRC rather than trusting directory metadata', () => {
  const source = sample(false);
  const central = source.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const local = source.readUInt32LE(central + 42);
  const dataStart = local + 30 + source.readUInt16LE(local + 26) + source.readUInt16LE(local + 28);
  source[dataStart] = source[dataStart]! ^ 1;
  assert.throws(() => inspectXlsxArchiveBudget(source), /CHECKSUM_MISMATCH/);
});
