import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { readRosterXlsxIsolated } from '../../backend/dist/modules/v8/domain/roster-xlsx-isolated.js';

const { utils, write } = createRequire(new URL('../../backend/package.json', import.meta.url))('xlsx');
const workbook = utils.book_new();
utils.book_append_sheet(workbook, utils.aoa_to_sheet([
  ['学号', '姓名'], ['000123', 'Synthetic'], ['000123', 'Duplicate'], ['', 'Missing number'],
]), '名单');
const bytes = write(workbook, { type: 'buffer', bookType: 'xlsx' });
const digest = value => createHash('sha256').update(value).digest('hex');
const originalDigest = digest(bytes), originalKeys = Object.keys(bytes);
const mapping = { studentNumber: '学号', fullName: '姓名' };
const parsed = await readRosterXlsxIsolated(bytes, '名单', mapping);
assert.equal(parsed.rows.length, 3);
assert.equal(parsed.rows[0].cells[0], '000123');
assert.equal(parsed.rows[1].cells[0], '000123');
assert.equal(parsed.rows[2].sourceRowNumber, 4);
assert.equal(digest(bytes), originalDigest);
assert.deepEqual(Object.keys(bytes), originalKeys);
await assert.rejects(readRosterXlsxIsolated(bytes, 'missing', mapping), /SHEET_NOT_FOUND/);
await assert.rejects(readRosterXlsxIsolated(bytes, '名单', mapping, 1), /TIMEOUT/);
const first = readRosterXlsxIsolated(bytes, '名单', mapping);
const second = readRosterXlsxIsolated(bytes, '名单', mapping);
await assert.rejects(readRosterXlsxIsolated(bytes, '名单', mapping), /BUSY/);
assert.equal((await first).rows.length, 3);
assert.equal((await second).rows.length, 3);
assert.equal((await readRosterXlsxIsolated(bytes, '名单', mapping)).rows.length, 3);
console.log(JSON.stringify({ check: 'ROSTER_XLSX_COMPILED_WORKER_SOURCE_DIGEST_ROWS_TIMEOUT_BUSY_SLOT_RELEASE', result: 'PASS' }));
const backendRequire = createRequire(new URL('../../backend/package.json', import.meta.url));
backendRequire('reflect-metadata');
const { RosterCsvParserService } = await import('../../backend/dist/common/roster-ingestion/roster-csv-parser.service.js');
let storedBytes = bytes;
const parser = new RosterCsvParserService({ getPrivateObject: async key => {
  assert.equal(key, 'synthetic/private-roster.xlsx');
  return Readable.from([storedBytes.subarray(0, 100), storedBytes.subarray(100)]);
} });
const sourceInput = { sourceFileStorageKey: 'synthetic/private-roster.xlsx', expectedSha256: originalDigest, sheetName: '名单',
  fieldMappingSnapshot: { ...mapping, gender: null, gradeYear: null, collegeName: null, majorName: null, administrativeClassName: null } };
const classified = await parser.parseStoredXlsx(sourceInput);
assert.equal(classified.totalRowCount, 3);
assert.equal(classified.duplicatedRowCount, 2);
assert.equal(classified.invalidRowCount, 1);
assert.equal(classified.validRowCount, 0);
assert.deepEqual(classified.rows.map(row => row.sourceRowNumber), [2, 3, 4]);
assert.equal(classified.rows[0].normalizedStudentNumber, '000123');
storedBytes = Buffer.from(bytes);
storedBytes[100] ^= 1;
await assert.rejects(parser.parseStoredXlsx(sourceInput), error => error.code === 'ROSTER_SCHEMA_INVALID' && error.details?.category === 'SOURCE_DIGEST_MISMATCH');
console.log(JSON.stringify({ check: 'ROSTER_STORED_XLSX_STREAM_DIGEST_DUPLICATE_INVALID_ROWS', result: 'PASS', storage: 'in-memory-port-fixture' }));
