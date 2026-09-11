import { read, utils, type CellObject } from 'xlsx';

export type RosterSourceTable = {
  sheetName: string;
  headers: string[];
  rows: { sourceRowNumber: number; cells: string[] }[];
};

/** Decode source rows only. Identity validation and teacher confirmation are separate steps. */
export function readRosterXlsx(bytes: Uint8Array, sheetName: string,
  mapping: { studentNumber: string; fullName: string }): RosterSourceTable {
  if (bytes.length < 4 || bytes.length > 100 * 1024 * 1024 ||
    bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4)
    throw new Error('ROSTER_XLSX_SIZE_OR_FORMAT');
  // SheetJS attaches parsing state to its input. Preserve the caller's original file object.
  const workbook = read(Uint8Array.from(bytes), { type: 'array', cellNF: true, cellDates: false,
    cellFormula: true, bookVBA: true, sheetRows: 502 });
  if (workbook.vbaraw) throw new Error('ROSTER_XLSX_MACROS');
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('ROSTER_XLSX_SHEET_NOT_FOUND');
  if (!sheet['!ref']) throw new Error('ROSTER_XLSX_EMPTY');
  const range = utils.decode_range(sheet['!fullref'] ?? sheet['!ref']);
  if (range.e.r - range.s.r > 500) throw new Error('ROSTER_XLSX_ROW_LIMIT');
  if (range.e.r === range.s.r) throw new Error('ROSTER_XLSX_EMPTY');
  if (range.e.c - range.s.c >= 32) throw new Error('ROSTER_XLSX_COLUMN_LIMIT');
  if (sheet['!merges']?.length) throw new Error('ROSTER_XLSX_MERGED_CELLS');
  const records: string[][] = [];
  for (let row = range.s.r; row <= range.e.r; row++) {
    const cells: string[] = [];
    for (let column = range.s.c; column <= range.e.c; column++) {
      const cell = sheet[utils.encode_cell({ r: row, c: column })] as CellObject | undefined;
      if (cell?.f || cell?.F) throw new Error('ROSTER_XLSX_FORMULA');
      if (cell && !['s', 'n', 'z'].includes(cell.t)) throw new Error('ROSTER_XLSX_CELL_TYPE');
      cells.push(cell ? cell.w ?? String(cell.v ?? '') : '');
    }
    records.push(cells);
  }
  const headers = records[0]!.map(value => value.trim().normalize('NFC'));
  if (headers.some(value => !value || /[\u0000-\u001f\u007f]/u.test(value)) || new Set(headers).size !== headers.length)
    throw new Error('ROSTER_XLSX_HEADER_INVALID');
  const identityHeaders = [mapping.studentNumber, mapping.fullName].map(value => value.trim().normalize('NFC'));
  if (new Set(identityHeaders).size !== 2 || identityHeaders.some(value => !headers.includes(value)))
    throw new Error('ROSTER_XLSX_REQUIRED_COLUMNS');
  return { sheetName, headers, rows: records.slice(1).map((cells, index) => ({
    sourceRowNumber: range.s.r + index + 2, cells,
  })) };
}
