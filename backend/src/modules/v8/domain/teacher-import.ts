import { parse } from 'csv-parse/sync';
import { isEmail } from 'class-validator';

export type TeacherImportRow = { employeeId: string; name: string; email: string; college: string | null };
const headerFields = { employee_id: 'employeeId', name: 'name', email: 'email', college: 'college' } as const;
export function validTeacherInitialPassword(password: string): boolean {
  return password.length >= 8 && /[A-Z]/u.test(password) && /[a-z]/u.test(password) && /[0-9]/u.test(password);
}
export function readTeacherCsv(bytes: Uint8Array, limits: { maxBytes: number; maxRows: number }): TeacherImportRow[] {
  if (!Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 1 || !Number.isSafeInteger(limits.maxRows) || limits.maxRows < 1)
    throw new Error('TEACHER_CSV_LIMITS_INVALID');
  if (!bytes.length || bytes.length > limits.maxBytes) throw new Error('TEACHER_CSV_SIZE');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('TEACHER_CSV_ENCODING'); }
  if (text.includes('\0')) throw new Error('TEACHER_CSV_ENCODING');
  let records: string[][];
  try { records = parse(text, { bom: true, skip_empty_lines: true, max_record_size: limits.maxBytes, to: limits.maxRows + 2 }) as string[][]; }
  catch { throw new Error('TEACHER_CSV_STRUCTURE'); }
  if (records.length < 2) throw new Error('TEACHER_CSV_EMPTY');
  if (records.length - 1 > limits.maxRows) throw new Error('TEACHER_CSV_ROW_LIMIT');
  const names = records[0]!.map(name => name.trim());
  if (new Set(names).size !== names.length || !['employee_id', 'name', 'email'].every(name => names.includes(name)) ||
    names.some(name => !Object.hasOwn(headerFields, name))) throw new Error('TEACHER_CSV_COLUMNS');
  return records.slice(1).map(cells => {
    const get = (name: string) => cells[names.indexOf(name)]?.trim() ?? '';
    return { employeeId: get('employee_id'), name: get('name'), email: get('email').toLowerCase(), college: get('college') || null };
  });
}

export function inspectTeacherImport(rows: readonly TeacherImportRow[], input: {
  existingEmployeeIds: readonly string[]; existingEmails: readonly string[];
}) {
  const employees = new Set(input.existingEmployeeIds), emails = new Set(input.existingEmails.map(email => email.toLowerCase()));
  const employeeCounts = new Map<string, number>(), emailCounts = new Map<string, number>();
  for (const row of rows) {
    employeeCounts.set(row.employeeId, (employeeCounts.get(row.employeeId) ?? 0) + 1);
    emailCounts.set(row.email, (emailCounts.get(row.email) ?? 0) + 1);
  }
  const inspected = rows.map((row, index) => {
    const errors: string[] = [];
    if (!row.employeeId || row.employeeId.length > 32) errors.push('EMPLOYEE_ID_INVALID');
    if (!row.name || row.name.length > 100) errors.push('NAME_INVALID');
    if (!isEmail(row.email) || row.email.length > 254) errors.push('EMAIL_INVALID');
    if (row.college && row.college.length > 200) errors.push('COLLEGE_TOO_LONG');
    if ((employeeCounts.get(row.employeeId) ?? 0) > 1) errors.push('DUPLICATE_EMPLOYEE_ID');
    if ((emailCounts.get(row.email) ?? 0) > 1) errors.push('DUPLICATE_EMAIL');
    if (employees.has(row.employeeId)) errors.push('EMPLOYEE_ID_EXISTS');
    if (emails.has(row.email)) errors.push('EMAIL_EXISTS');
    return { rowNumber: index + 1, ...row, errors };
  });
  return { rows: inspected, canCreate: inspected.length > 0 && inspected.every(row => row.errors.length === 0) };
}
