export type PhysicalImportRow = { studentNumber: string; name: string; runType: string; elapsed: string; testedOn: string };
export type PhysicalImportMember = { studentNumber: string; name: string; enrollmentId: string; gender: string };

export function parsePhysicalElapsed(value: string): number | null {
  const text = value.trim();
  let seconds: number;
  if (/^\d+(?:\s*(?:s|秒))?$/u.test(text)) seconds = Number(text.replace(/\s*(?:s|秒)$/u, ''));
  else {
    const clock = /^(\d+):([0-5]\d)$/u.exec(text);
    const labelled = /^(\d+)\s*分\s*(\d{1,2})\s*秒$/u.exec(text);
    const match = clock ?? labelled;
    if (!match || Number(match[2]) > 59) return null;
    seconds = Number(match[1]) * 60 + Number(match[2]);
  }
  return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : null;
}

export function validPhysicalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// This is a draft projection only. Even issue-free rows require teacher confirmation.
export function inspectPhysicalImport(rows: readonly PhysicalImportRow[], members: readonly PhysicalImportMember[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.studentNumber.trim(), (counts.get(row.studentNumber.trim()) ?? 0) + 1);
  return rows.map((row, index) => {
    const studentNumber = row.studentNumber.trim(), name = row.name.trim();
    const matches = members.filter(member => member.studentNumber === studentNumber);
    const member = matches.length === 1 ? matches[0] : undefined;
    const issues: string[] = [];
    if (!studentNumber || matches.length !== 1) issues.push('STUDENT_NUMBER_NOT_UNIQUE_MATCH');
    if (member && member.name !== name) issues.push('NAME_MISMATCH');
    if ((counts.get(studentNumber) ?? 0) > 1) issues.push('DUPLICATE_STUDENT_ROW');
    const runType = row.runType.trim();
    const expectedRun = member?.gender === 'MALE' ? '1000m' : member?.gender === 'FEMALE' ? '800m' : null;
    if (!expectedRun || runType !== expectedRun) issues.push('PROJECT_MISMATCH');
    const elapsedSeconds = parsePhysicalElapsed(row.elapsed);
    if (elapsedSeconds === null) issues.push('AMBIGUOUS_OR_INVALID_TIME');
    const testedOn = row.testedOn.trim();
    if (!validPhysicalDate(testedOn)) issues.push('INVALID_TEST_DATE');
    return { rowNumber: index + 1, source: { ...row }, enrollmentId: member?.enrollmentId ?? null,
      runType, elapsedSeconds, testedOn, issues, confirmed: false as const };
  });
}
