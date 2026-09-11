import assert from 'node:assert/strict';
import test from 'node:test';
import { withPhysicalResult } from '../app/teacher-data.ts';
const grade = { id: 'grade', studentId: 'student', enrollmentId: 'enrollment', courseId: 'course',
  gender: '男', gradeGroup: '未知', enduranceStatus: 'Unavailable', physicalScore: 88, published: true };
const raw = { version: 3, runType: '1000m', elapsedSeconds: 245, testedOn: '2026-09-07', createdAt: '2026-09-07T01:00:00Z' };
test('teacher raw time projection preserves the source version without reusing a legacy aggregate score', () => {
  const view = withPhysicalResult(grade, raw, false);
  assert.equal(view.enduranceStatus, 'Recorded');
  assert.equal(view.minutes, 4);
  assert.equal(view.seconds, 5);
  assert.equal(view.physicalResultVersion, 3);
  assert.equal(view.physicalTestedOn, raw.testedOn);
  assert.equal(view.physicalScore, undefined);
  assert.equal(grade.physicalScore, 88);
});
test('approved exemption suppresses historical time and absent raw data is not recorded', () => {
  const exempt = withPhysicalResult(grade, raw, true);
  assert.equal(exempt.enduranceStatus, 'Exempt');
  assert.equal(exempt.minutes, undefined);
  assert.equal(exempt.seconds, undefined);
  assert.equal(exempt.physicalScore, undefined);
  const empty = withPhysicalResult(grade, undefined, false);
  assert.equal(empty.enduranceStatus, 'NotRecorded');
  assert.equal(empty.physicalResultVersion, 0);
});
