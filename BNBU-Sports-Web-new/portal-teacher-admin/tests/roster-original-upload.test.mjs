import assert from 'node:assert/strict';
import test from 'node:test';
import { utils, write } from 'xlsx';
import { parseRosterFile } from '../app/roster-import.ts';
import { rosterApiService } from '../app/roster-reconciliation-api-service.ts';

test('a replaced reconciliation result rejects confirmation instead of silently reporting success', async () => {
  const nativeFetch = globalThis.fetch, oldWindow = globalThis.window;
  const writes = [];
  globalThis.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
  globalThis.fetch = async (url, options = {}) => {
    if (options.method && options.method !== 'GET') writes.push(String(url));
    return Response.json({ data: String(url).endsWith('/current') ? null : [], meta: {} });
  };
  try {
    await assert.rejects(rosterApiService.updateResolution('synthetic-course', ['superseded-result'], 'CONFIRMED', 'Synthetic reason'), { code: 'STALE_ROSTER_RESULT' });
    assert.deepEqual(writes, []);
  } finally { globalThis.fetch = nativeFetch; globalThis.window = oldWindow; }
});

test('original CSV and XLSX bytes reach multipart and confirmation retries reuse the uploaded source', async () => {
  const nativeFetch = globalThis.fetch, oldWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
  try {
    for (const [extension, duplicate] of [['csv',false],['xlsx',false],['csv',true],['xlsx',true]]) {
      const workbook = utils.book_new();
      const rows=[['学号', '姓名'], ['000123', 'Synthetic Student']];
      if(duplicate)rows.push(['000123','Synthetic Duplicate']);
      utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), '名单');
      const bytes = write(workbook, { type: 'buffer', bookType: extension });
      const file = new File([bytes], `original.${extension}`);
      const parsed = await parseRosterFile(file);
      assert.equal(parsed.originalFile, file);
      const uploads = [], confirmationKeys = [];
      globalThis.fetch = async (url, options) => {
        if (options.body instanceof FormData) {
          uploads.push(options.body);
          return Response.json({ data: { id: 'source-id', status: 'VALIDATED', isCurrent: true, version: 3 }, meta: {} });
        }
        assert.ok(String(url).endsWith('/roster-imports/source-id/confirmation'));
        assert.deepEqual(JSON.parse(options.body), { expectedVersion: 3 });
        confirmationKeys.push(new Headers(options.headers).get('Idempotency-Key'));
        throw new TypeError('Synthetic lost confirmation response');
      };
      const input = { course: { id: 'course-id' }, parsed, mapping: parsed.suggestedMapping };
      await assert.rejects(rosterApiService.importOfficialRoster(input));
      await assert.rejects(rosterApiService.importOfficialRoster(input));
      assert.equal(uploads.length, 1);
      assert.equal(uploads[0].get('fileFormat'), extension.toUpperCase());
      assert.equal(uploads[0].get('sheetName'), extension === 'xlsx' ? '名单' : null);
      const uploaded = uploads[0].get('file');
      assert.equal(uploaded.name, file.name);
      assert.ok(Buffer.from(await uploaded.arrayBuffer()).equals(bytes));
      assert.equal(confirmationKeys.length, 2);
      assert.ok(confirmationKeys[0]);
      assert.equal(confirmationKeys[0], confirmationKeys[1]);
    }
  } finally { globalThis.fetch = nativeFetch; globalThis.window = oldWindow; }
});
