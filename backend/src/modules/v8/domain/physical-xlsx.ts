import { read, utils, SSF, type CellObject } from 'xlsx';
import { physicalColumns, readPhysicalTable } from './physical-csv.js';

/** Select the source sheet explicitly. Formula results never become confirmed raw facts. */
export function readPhysicalXlsx(bytes: Uint8Array, sheetName: string, limits: { maxBytes: number; maxRows: number }) {
  if (!Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 1 || !Number.isSafeInteger(limits.maxRows) || limits.maxRows < 1)
    throw new Error('PHYSICAL_XLSX_LIMITS_INVALID');
  if (bytes.length < 4 || bytes.length > limits.maxBytes || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4)
    throw new Error('PHYSICAL_XLSX_SIZE_OR_FORMAT');
  const workbook = read(bytes, { type: 'array', cellNF: true, cellDates: false, cellFormula: true, bookVBA: true,
    sheetRows: limits.maxRows + 2 });
  if (workbook.vbaraw) throw new Error('PHYSICAL_XLSX_MACROS');
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('PHYSICAL_XLSX_SHEET_NOT_FOUND');
  if (!sheet['!ref']) throw new Error('PHYSICAL_XLSX_EMPTY');
  const range = utils.decode_range(sheet['!fullref'] ?? sheet['!ref']);
  if (range.e.r - range.s.r > limits.maxRows) throw new Error('PHYSICAL_XLSX_ROW_LIMIT');
  if (range.e.c - range.s.c !== 4) throw new Error('PHYSICAL_XLSX_COLUMNS');
  if (sheet['!merges']?.length) throw new Error('PHYSICAL_XLSX_MERGED_CELLS');
  const records: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[utils.encode_cell({ r, c })] as CellObject | undefined;
      if (cell?.f || cell?.F) throw new Error('PHYSICAL_XLSX_FORMULA');
      if (cell && !['s', 'n', 'z'].includes(cell.t)) throw new Error('PHYSICAL_XLSX_CELL_TYPE');
      let text = cell ? cell.w ?? String(cell.v ?? '') : '';
      const field = physicalColumns[records[0]?.[c - range.s.c]?.trim() ?? ''];
      if (r > range.s.r && field === 'testedOn' && cell?.t === 'n' && typeof cell.z === 'string' && SSF.is_date(cell.z)) {
        const date = SSF.parse_date_code(Number(cell.v), { date1904: workbook.Workbook?.WBProps?.date1904 });
        if (!date || date.H || date.M || date.S || date.u) throw new Error('PHYSICAL_XLSX_TEST_DATE_HAS_TIME');
        text = `${String(date.y).padStart(4, '0')}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
      }
      row.push(text);
    }
    records.push(row);
  }
  return readPhysicalTable(records, limits.maxRows);
}
