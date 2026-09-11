import assert from 'node:assert/strict';
import test from 'node:test';
import { utils, write } from 'xlsx';
import { parseRosterFile } from '../app/roster-import.ts';

test('file metadata accepts exactly 100 MiB and rejects one byte more before decoding', async () => {
  // The transport boundary is exercised with actual streamed bytes in Docker.
  const file = new File(['学号,姓名\n000001,Synthetic\n'], 'synthetic.csv');
  Object.defineProperty(file, 'size', {value:100*1024*1024, configurable:true});
  assert.equal((await parseRosterFile(file)).totalRows,1);
  Object.defineProperty(file, 'size', {value:100*1024*1024+1});
  await assert.rejects(parseRosterFile(file), /FILE_TOO_LARGE/);
});

for (const extension of ['csv', 'xlsx']) {
  test(`${extension} preview enforces the business limit of 500 personnel rows`, async () => {
    const file = count => {
      const book = utils.book_new();
      utils.book_append_sheet(book, utils.aoa_to_sheet([['学号', '姓名'],
        ...Array.from({ length: count }, (_, index) => [String(index).padStart(6, '0'), 'Synthetic'])]), '名单');
      return new File([write(book, { type: 'buffer', bookType: extension })], `synthetic.${extension}`);
    };
    assert.equal((await parseRosterFile(file(500))).totalRows, 500);
    await assert.rejects(parseRosterFile(file(501)), /ROW_LIMIT_EXCEEDED/);
  });
}
