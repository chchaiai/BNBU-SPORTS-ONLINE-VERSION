import assert from 'node:assert/strict';
import test from 'node:test';
import { projectRosterRegistration } from '../../src/modules/v8/domain/roster-registration.js';
const official = [{ id: 'row1', studentNumber: '001', fullName: 'Student One' }];
const member = { studentId: 's1', enrollmentId: 'e1', studentNumber: '001', fullName: 'Student One', emailVerified: true, enrolledInSection: true };

test('registration requires verified email, target enrollment and exact identity instead of equal totals', () => {
  assert.equal(projectRosterRegistration(official, [member]).registrationComplete, true);
  for (const changed of [{ emailVerified: false }, { enrolledInSection: false }, { studentNumber: '1' }]) {
    const result = projectRosterRegistration(official, [{ ...member, ...changed }]);
    assert.equal(result.registrationComplete, false);
    assert.equal(result.rows[0]!.status, 'PENDING_REGISTRATION');
  }
  assert.equal(projectRosterRegistration(official, [{ ...member, fullName: 'Student 0ne' }]).rows[0]!.status, 'IDENTITY_CONFLICT');
});
test('duplicate official identities preserve every row and leave denominator unresolved', () => {
  const result = projectRosterRegistration([...official, { ...official[0]!, id: 'row2' }], [member]);
  assert.equal(result.sourceRowCount, 2);
  assert.equal(result.denominator, null);
  assert.equal(result.denominatorConfirmed, false);
  assert.ok(result.rows.every(row => row.status === 'IDENTITY_CONFLICT' && row.studentId === null));
  assert.equal(result.registrationComplete, false);
});
test('outside members are separate and ambiguous platform identities are never merged', () => {
  const outside = { ...member, studentId: 's2', enrollmentId: 'e2', studentNumber: '002' };
  const result = projectRosterRegistration(official, [member, outside]);
  assert.equal(result.denominator, 1);
  assert.equal(result.registrationComplete, true);
  assert.equal(result.extras.length, 1);
  assert.equal(result.extras[0]!.status, 'EXTRA_IN_PLATFORM');
  const collision = projectRosterRegistration(official, [member, { ...outside, studentNumber: '001' }]);
  assert.equal(collision.rows[0]!.status, 'IDENTITY_CONFLICT');
  assert.equal(collision.matchedCount, 0);
  assert.equal(projectRosterRegistration([], []).registrationComplete, false);
});
