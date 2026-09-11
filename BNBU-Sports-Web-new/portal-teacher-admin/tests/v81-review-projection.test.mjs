import assert from 'node:assert/strict';
import test from 'node:test';
import { mapExerciseRecordToCheckin } from '../app/teacher-data.ts';
import { deriveAuditSummary } from '../app/checkin-audit.ts';

const base = {
  id: 'record-fixture', studentId: 'student-fixture', classSectionId: 'course-fixture',
  enrollmentId: 'enrollment-fixture', creditType: 'COURSE_RELATED', sportType: 'RUNNING',
  sportName: null, description: null, businessDate: '2026-09-07',
  actualDurationSeconds: 1859, pausedDurationSeconds: 0, creditedDurationSeconds: 0,
  status: 'REVIEWED', submittedAt: '2026-09-07T02:00:00.000Z', version: 2,
};

test('manual review lifecycle stays visible and only awarded valid minutes contribute', () => {
  const steps = [
    ['PENDING_TEACHER', 'PENDING', 0, 'pending', '待审核'],
    ['AWAITING_SUPPLEMENT', 'PENDING', 0, 'supplement', '待补证'],
    ['PENDING_TEACHER', 'PENDING', 0, 'pending', '待审核'],
    ['VALID', 'VALID', 1800, 'valid', '有效'],
    ['INVALID', 'INVALID', 0, 'invalid', '已调整'],
  ];
  for (const [workflowStage, result, creditedDurationSeconds, expected, label] of steps) {
    const view = mapExerciseRecordToCheckin({ ...base, workflowStage, creditedDurationSeconds,
      currentReview: { result, reasonCode: null, publicComment: null } });
    assert.equal(view.auditStatus, expected);
    assert.equal(view.status, label);
    assert.equal(view.durationMinutes, 30);
    const summary = deriveAuditSummary([view], 1200);
    assert.equal(summary.validMinutes, creditedDurationSeconds / 60);
    assert.equal(summary.pendingCount, result === 'PENDING' ? 1 : 0);
  }
});

test('technical processing and valid but uncredited records are distinct from invalid results', () => {
  const technical = mapExerciseRecordToCheckin({ ...base, workflowStage: 'TECHNICAL',
    currentReview: { result: 'PENDING', reasonCode: null, publicComment: null } });
  const uncredited = mapExerciseRecordToCheckin({ ...base, workflowStage: 'VALID',
    currentReview: { result: 'VALID', reasonCode: null, publicComment: null } });
  assert.equal(technical.status, '技术处理中');
  assert.equal(uncredited.status, '有效');
  const summary = deriveAuditSummary([technical, uncredited], 1200);
  assert.equal(summary.validCount, 1);
  assert.equal(summary.invalidCount, 0);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.validMinutes, 0);
});

test('public category and supplemental explanation both survive invalid projection', () => {
  const view = mapExerciseRecordToCheckin({ ...base, workflowStage: 'INVALID',
    currentReview: { result: 'INVALID', reasonCode: 'MISSING_REQUIRED_EVIDENCE',
      publicComment: '缺少本次运动前照片。' } });
  assert.equal(view.invalidReason, '必需材料缺失（含要求的前后照）');
  assert.equal(view.auditRemark, '缺少本次运动前照片。');
});
