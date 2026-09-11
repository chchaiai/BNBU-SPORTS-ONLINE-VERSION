import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  permitsExistingCourseSession as permits,
  COURSE_CLOSURE_REASON,
} from '../../src/modules/enrollments/application/course-closure-memberships.js';
const closedAt = new Date('2026-09-11T08:00:00Z');
const course = { status: 'CLOSED', closedAt };
const removed = { status: 'REMOVED', endReason: COURSE_CLOSURE_REASON, endedAt: closedAt };
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
