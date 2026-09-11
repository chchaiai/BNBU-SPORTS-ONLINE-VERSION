import assert from 'node:assert/strict';
import { it } from 'node:test';
import { inspectTeacherImport, readTeacherCsv, validTeacherInitialPassword } from '../../src/modules/v8/domain/teacher-import.js';
const limits = { maxBytes: 10000, maxRows: 100 };
const read = (text: string) => readTeacherCsv(Buffer.from(text), limits);
const context = { existingEmployeeIds: [], existingEmails: [] };
it('preserves employee zeros and parses optional college; forbids password columns', () => {
  const rows = read('\uFEFFemployee_id,name,email,college\n001,"Teacher, A",A@SCHOOL.EXAMPLE,Sports');
  assert.deepEqual(rows, [{ employeeId: '001', name: 'Teacher, A', email: 'a@school.example', college: 'Sports' }]);
  assert.equal(inspectTeacherImport(rows, context).canCreate, true);
  assert.throws(() => read('employee_id,name,email,initial_password\n1,A,a@school.example,DoNotPersist1'), /COLUMNS/);
  assert.throws(() => read('employee_id,name,name\n1,A,A'), /COLUMNS/);
});
it('marks every duplicate row and database conflict while accepting custom email domains', () => {
  const rows = read('employee_id,name,email\n001,A,a@school.example\n001,B,A@school.example\n003,C,c@sub.school.example');
  const preview = inspectTeacherImport(rows, { ...context, existingEmployeeIds: ['001'], existingEmails: ['a@school.example'] });
  assert.equal(preview.canCreate, false);
  for (const row of preview.rows.slice(0, 2)) assert.deepEqual(row.errors,
    ['DUPLICATE_EMPLOYEE_ID', 'DUPLICATE_EMAIL', 'EMPLOYEE_ID_EXISTS', 'EMAIL_EXISTS']);
  assert.deepEqual(preview.rows[2]!.errors, []);
  assert.equal(inspectTeacherImport(read('employee_id,name,email\n9,D,person@custom.example'), context).canCreate, true);
  assert.deepEqual(inspectTeacherImport(read('employee_id,name,email\n9,D,invalid-email'), context).rows[0]!.errors, ['EMAIL_INVALID']);
});
it('enforces the teacher batch initial-password rule without imposing it on personal passwords', () => {
  assert.equal(validTeacherInitialPassword('Abcdef12'), true);
  for (const input of ['', 'Abc123', 'abcdefgh1', 'ABCDEFGH1', 'Abcdefgh']) assert.equal(validTeacherInitialPassword(input), false);
});
