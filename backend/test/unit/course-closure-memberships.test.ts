import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  permitsExistingCourseSession as permits,
  COURSE_CLOSURE_REASON,
  isCourseClosureHistoricalMember,
} from '../../src/modules/enrollments/application/course-closure-memberships.js';
const closedAt = new Date('2026-09-11T08:00:00Z');
const course = { status: 'CLOSED', closedAt };
const removed = { status: 'REMOVED', endReason: COURSE_CLOSURE_REASON, endedAt: closedAt };

test('historical roster membership requires the exact course closure transition', () => {
  assert.equal(isCourseClosureHistoricalMember(removed, course), true);
  for (const member of [
    { ...removed, endReason: 'TEACHER_REMOVED' },
    { ...removed, endReason: 'COURSE_RETIRED' },
    { ...removed, status: 'WITHDRAWN' },
    { ...removed, endedAt: null },
    { ...removed, endedAt: new Date(closedAt.getTime() - 1) },
  ]) assert.equal(isCourseClosureHistoricalMember(member, course), false);
  assert.equal(isCourseClosureHistoricalMember(removed, { ...course, status: 'ACTIVE' }), false);
  assert.equal(isCourseClosureHistoricalMember(removed, { ...course, closedAt: null }), false);
});
test('closure preserves only sessions admitted before or at closure', () => {
  assert.equal(permits(removed, course, new Date(closedAt.getTime() - 1)), true);
  assert.equal(permits(removed, course, closedAt), true);
  assert.equal(permits(removed, course, new Date(closedAt.getTime() + 1)), false);
});
test('manual removal, withdrawal and archived courses never receive the closure exception', () => {
  assert.equal(permits({ ...removed, endReason: 'Teacher removal' }, course, closedAt), false);
  assert.equal(permits({ ...removed, status: 'WITHDRAWN' }, course, closedAt), false);
  assert.equal(permits(removed, { ...course, status: 'ARCHIVED' }, closedAt), false);
  assert.equal(
    permits({ ...removed, endedAt: new Date(closedAt.getTime() + 1) }, course, closedAt),
    false,
  );
});
