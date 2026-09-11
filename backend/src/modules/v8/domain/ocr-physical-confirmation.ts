import { inspectPhysicalImport, type PhysicalImportMember, type PhysicalImportRow } from './physical-import.js';

export type OcrPhysicalWorkingRow = { id: string; values: Partial<PhysicalImportRow>; reviewedAgainstSource: boolean };

/** Evaluate the whole batch before selecting rows, so selection cannot hide duplicate identities. */
export function inspectOcrPhysicalConfirmation(rows: readonly OcrPhysicalWorkingRow[], members: readonly PhysicalImportMember[]) {
  if (rows.length < 1 || rows.length > 500 || new Set(rows.map(row => row.id)).size !== rows.length)
    throw new Error('OCR_DRAFT_ROWS_INVALID');
  const fields = ['studentNumber', 'name', 'runType', 'elapsed', 'testedOn'] as const;
  const content = rows.map(row => Object.fromEntries(fields.map(field => [field,
    typeof row.values[field] === 'string' ? row.values[field] : ''])) as PhysicalImportRow);
  return inspectPhysicalImport(content, members).map((result, index) => {
    const row = rows[index]!;
    const issues = [...result.issues];
    if (!row.reviewedAgainstSource) issues.unshift('SOURCE_REVIEW_REQUIRED');
    if (fields.some(field => typeof row.values[field] !== 'string')) issues.unshift('PHYSICAL_FIELDS_REQUIRED');
    return { rowId: row.id, enrollmentId: result.enrollmentId, runType: result.runType,
      elapsedSeconds: result.elapsedSeconds, testedOn: result.testedOn, issues };
  });
}

/** The caller must persist all selected results and source links in one transaction. */
export function selectOcrPhysicalConfirmation(rows: readonly OcrPhysicalWorkingRow[], members: readonly PhysicalImportMember[], selectedIds: readonly string[]) {
  if (!selectedIds.length || selectedIds.length > 500 || new Set(selectedIds).size !== selectedIds.length)
    throw new Error('OCR_SELECTION_INVALID');
  const inspected = inspectOcrPhysicalConfirmation(rows, members);
  const selected = selectedIds.map(id => inspected.find(row => row.rowId === id));
  if (selected.some(row => !row)) throw new Error('OCR_SELECTED_ROW_NOT_FOUND');
  if (selected.some(row => row!.issues.length || !row!.enrollmentId || row!.elapsedSeconds === null))
    throw new Error('OCR_SELECTED_ROWS_UNRESOLVED');
  return selected.map(row => ({ rowId: row!.rowId, enrollmentId: row!.enrollmentId!, runType: row!.runType,
    elapsedSeconds: row!.elapsedSeconds!, testedOn: row!.testedOn }));
}
