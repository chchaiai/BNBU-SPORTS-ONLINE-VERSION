import assert from 'node:assert/strict';
import { test } from 'node:test';
import { studentSettlementResult } from '../../src/modules/v8/domain/student-settlement.js';

test('student settlement excludes teacher-only and unexpected nested fields without mutating the snapshot', () => {
  const category = { targetSeconds: 600, validExerciseSeconds: 60, recognizedSeconds: 0,
    effectiveSeconds: 60, remainingSeconds: 540, finalGrade: 99, rank: 1 };
  const row = { status: 'MATCHED', pendingCount: 0, fullName: 'Private teacher label', studentNumber: '0001',
    finalGrade: { latestRevision: { finalGrade: 99 } }, actorId: 'private',
    physical: { status: 'RECORDED', grade: 99, result: { version: 2, runType: '1000m', elapsedSeconds: 271,
      testedOn: '2026-09-07', finalGrade: 99 } },
    progress: { actualSeconds: 60, invalidActualSeconds: 0, validUncreditedSeconds: 0, creditedSeconds: 60,
      pendingActualSeconds: 0, course: category, general: category, remainingSeconds: 1080, targetReached: false, rank: 1 } };
  const before = structuredClone(row), result = studentSettlementResult(row as never);
  assert.deepEqual(row, before);
  assert.equal(result.physical?.result?.elapsedSeconds, 271);
  assert.equal(result.progress?.course.remainingSeconds, 540);
  assert.doesNotMatch(JSON.stringify(result), /finalGrade|fullName|studentNumber|actorId|rank|"grade"/);
});
test('unknown student facts remain null rather than becoming successful zero values', () => {
  const result = studentSettlementResult({ status: 'PENDING_REGISTRATION', pendingCount: null,
    physical: null, progress: null } as never);
  assert.deepEqual(result, { registrationStatus: 'PENDING_REGISTRATION', pendingCount: null, physical: null, progress: null });
});
