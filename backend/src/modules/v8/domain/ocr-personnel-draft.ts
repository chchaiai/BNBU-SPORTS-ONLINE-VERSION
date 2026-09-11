import type { OcrTableSource } from './ocr-table-source.js';

export type OcrPersonnelField = 'studentNumber' | 'name' | 'runType' | 'elapsed' | 'testedOn';
export type OcrPersonnelSelection = { purpose: 'ROSTER' | 'PHYSICAL'; tableIndex: number; headerRow: number;
  columns: Partial<Record<OcrPersonnelField, number>> };
const failure = (code: string): never => { throw new Error(code); };

/** Explicit teacher-selected columns produce editable drafts; no row can become formal through this function. */
export function selectOcrPersonnelDraft(source: OcrTableSource, selection: OcrPersonnelSelection) {
  if (!['ROSTER', 'PHYSICAL'].includes(selection.purpose) || !Number.isSafeInteger(selection.tableIndex) ||
    selection.tableIndex < 0 || !Number.isSafeInteger(selection.headerRow) || selection.headerRow < 0)
    return failure('OCR_SELECTION_INVALID');
  const table = source.tables[selection.tableIndex];
  if (!table) return failure('OCR_TABLE_NOT_FOUND');
  const fields: OcrPersonnelField[] = selection.purpose === 'ROSTER'
    ? ['studentNumber', 'name'] : ['studentNumber', 'name', 'runType', 'elapsed', 'testedOn'];
  const columns = fields.map(field => selection.columns[field]);
  if (Object.keys(selection.columns).some(field => !fields.includes(field as OcrPersonnelField)) ||
    columns.some(column => !Number.isSafeInteger(column) || column! < 0) || new Set(columns).size !== fields.length)
    return failure('OCR_FIELD_MAPPING_INVALID');
  for (const column of columns) {
    const headers = table.cells.filter(cell => cell.rowStart === selection.headerRow && cell.columnStart === column);
    if (headers.length !== 1 || !headers[0]?.text.trim()) return failure('OCR_HEADER_SELECTION_INVALID');
  }
  const rows = new Set<number>();
  for (const cell of table.cells) {
    // Retain all occupied row positions, including malformed/merged/empty evidence. Never discard duplicate identities.
    const from = Math.max(selection.headerRow + 1, cell.rowStart), to = Math.max(cell.rowEnd, cell.rowStart + 1);
    if (to - from > 500) return failure('OCR_PERSONNEL_ROW_LIMIT');
    for (let row = from; row < to; row++) {
      rows.add(row);
      if (rows.size > 500) return failure('OCR_PERSONNEL_ROW_LIMIT');
    }
  }
  if (rows.size === 0) return failure('OCR_NO_PERSONNEL_ROWS');
  const drafts = [...rows].sort((a, b) => a - b).map(sourceRow => {
    const values: Partial<Record<OcrPersonnelField, string>> = {};
    const issues: { field: OcrPersonnelField; code: string }[] = [];
    const evidence: Partial<Record<OcrPersonnelField, number[]>> = {};
    for (const field of fields) {
      const column = selection.columns[field]!;
      const matches = table.cells.map((cell, index) => ({ cell, index })).filter(({ cell }) =>
        cell.rowStart <= sourceRow && Math.max(cell.rowEnd, cell.rowStart + 1) > sourceRow &&
        cell.columnStart <= column && Math.max(cell.columnEnd, cell.columnStart + 1) > column);
      evidence[field] = matches.map(match => match.index);
      if (matches.length !== 1) {
        values[field] = '';
        issues.push({ field, code: matches.length ? 'MULTIPLE_CELLS' : 'MISSING_CELL' });
      } else {
        const cell = matches[0]!.cell;
        values[field] = cell.text;
        if (cell.rowEnd !== cell.rowStart + 1 || cell.columnEnd !== cell.columnStart + 1)
          issues.push({ field, code: 'MERGED_OR_INVALID_CELL_SPAN' });
        if (!cell.text.trim()) issues.push({ field, code: 'EMPTY_FIELD' });
      }
    }
    return { sourceRow, values, evidence, issues, confirmed: false as const };
  });
  const counts = new Map<string, number>();
  for (const row of drafts) {
    const number = row.values.studentNumber?.trim();
    if (number) counts.set(number, (counts.get(number) ?? 0) + 1);
  }
  for (const row of drafts) if ((counts.get(row.values.studentNumber?.trim() ?? '') ?? 0) > 1)
    row.issues.push({ field: 'studentNumber', code: 'DUPLICATE_STUDENT_ROW' });
  return { sourceSha256: source.sourceSha256, providerRequestId: source.requestId,
    selection: { ...selection, columns: { ...selection.columns } }, requiresTeacherConfirmation: true as const,
    personnelRowCount: drafts.length, rows: drafts };
}
