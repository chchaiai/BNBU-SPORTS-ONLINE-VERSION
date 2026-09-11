export type OcrRosterWorkingRow = {
  id: string;
  values: { studentNumber?: string; name?: string };
  source: unknown;
  ocrIssues: readonly unknown[];
  reviewedAgainstSource: boolean;
};

/** Confirm the complete paper source; duplicate identities remain visible reconciliation facts. */
export function prepareOcrRosterSnapshot(rows: readonly OcrRosterWorkingRow[]) {
  if (!rows.length || rows.length > 500 || new Set(rows.map(row => row.id)).size !== rows.length)
    throw new Error('OCR_ROSTER_ROWS_INVALID');
  const counts = new Map<string, number>();
  const mapped = rows.map((row, index) => {
    if (!row.reviewedAgainstSource) throw new Error('OCR_SOURCE_REVIEW_REQUIRED');
    if (typeof row.values.studentNumber !== 'string' || typeof row.values.name !== 'string')
      throw new Error('OCR_ROSTER_FIELDS_REQUIRED');
    const studentNumber = row.values.studentNumber.trim().normalize('NFC').toUpperCase();
    const fullName = row.values.name.trim().normalize('NFC');
    if (!studentNumber || !fullName || studentNumber.length > 32 || fullName.length > 100)
      throw new Error('OCR_ROSTER_IDENTITY_INVALID');
    counts.set(studentNumber, (counts.get(studentNumber) ?? 0) + 1);
    return { id: row.id, sourceRowNumber: index + 1, studentNumber, fullName,
      rawStudentNumber: row.values.studentNumber, rawFullName: row.values.name,
      ocrSource: structuredClone(row.source), ocrIssues: structuredClone(row.ocrIssues) };
  });
  return mapped.map(row => ({ ...row, duplicateIdentity: counts.get(row.studentNumber)! > 1 }));
}
