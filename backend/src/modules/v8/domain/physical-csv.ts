import { parse } from 'csv-parse/sync';
import type { PhysicalImportRow } from './physical-import.js';

export const physicalColumns: Record<string, keyof PhysicalImportRow> = {
  学号: 'studentNumber', 姓名: 'name', 项目: 'runType', 用时: 'elapsed', 测试日期: 'testedOn',
  studentNumber: 'studentNumber', name: 'name', runType: 'runType', elapsed: 'elapsed', testedOn: 'testedOn',
};
const required: (keyof PhysicalImportRow)[] = ['studentNumber', 'name', 'runType', 'elapsed', 'testedOn'];

/** UTF-8 CSV only. Numeric-looking cells stay strings until reviewed by the import inspector. */
export function readPhysicalCsv(bytes: Uint8Array, limits: { maxBytes: number; maxRows: number }): PhysicalImportRow[] {
  if (!Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 1 || !Number.isSafeInteger(limits.maxRows) || limits.maxRows < 1)
    throw new Error('PHYSICAL_CSV_LIMITS_INVALID');
  if (bytes.byteLength === 0 || bytes.byteLength > limits.maxBytes) throw new Error('PHYSICAL_CSV_SIZE');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('PHYSICAL_CSV_ENCODING'); }
  if (text.includes('\0')) throw new Error('PHYSICAL_CSV_ENCODING');
  let records: string[][];
  try { records = parse(text, { bom: true, skip_empty_lines: true, max_record_size: limits.maxBytes,
    to: limits.maxRows + 2 }) as string[][]; }
  catch { throw new Error('PHYSICAL_CSV_STRUCTURE'); }
  if (records.length < 2) throw new Error('PHYSICAL_CSV_EMPTY');
  if (records.length - 1 > limits.maxRows) throw new Error('PHYSICAL_CSV_ROW_LIMIT');
  return readPhysicalTable(records, limits.maxRows);
}

export function readPhysicalTable(records: string[][], maxRows: number): PhysicalImportRow[] {
  if (records.length < 2) throw new Error('PHYSICAL_CSV_EMPTY');
  if (records.length - 1 > maxRows) throw new Error('PHYSICAL_CSV_ROW_LIMIT');
  const header = records[0]!.map(value => physicalColumns[value.trim()]);
  if (header.length !== required.length || header.some(value => value === undefined) ||
    new Set(header).size !== required.length) throw new Error('PHYSICAL_CSV_COLUMNS');
  return records.slice(1).map(record => {
    if (record.length !== header.length) throw new Error('PHYSICAL_CSV_COLUMNS');
    return Object.fromEntries(header.map((key, index) => [key, record[index]!])) as PhysicalImportRow;
  });
}
