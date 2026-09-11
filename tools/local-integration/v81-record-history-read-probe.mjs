import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { seedSubmittedExerciseRecord } from '../../backend/test/helpers/exercise-review.ts';

export async function probeRecordHistoryRead({ prisma, fixture, request, baseUrl, teacherToken, otherTeacherTokens }) {
  const seeded = await seedSubmittedExerciseRecord(prisma, fixture, randomUUID().slice(0, 8).toUpperCase(), 'VALID');
  const path = `/exercise-records/${seeded.recordId}`;
  const routes = [path, `${path}/evidence-context`, `${path}/reviews`,
    `/exercise-records?classSectionId=${fixture.teacherAActiveSectionId}`];
  const before = [];
  for (const route of routes) before.push(await request(route, teacherToken));
  const record = await prisma.exerciseRecord.findUniqueOrThrow({ where: { id: seeded.recordId } });
  const session = await prisma.exerciseSession.findUniqueOrThrow({ where: { id: seeded.sessionId } });
  const reviews = await prisma.reviewRecord.findMany({ where: { recordId: seeded.recordId }, orderBy: { reviewVersion: 'asc' } });
  await prisma.$transaction(async tx => {
    await tx.authSession.delete({ where: { id: seeded.studentAuthSessionId } });
    await tx.studentProfile.delete({ where: { id: seeded.studentId } });
    await tx.user.delete({ where: { id: seeded.studentUserId } });
  });
  for (const [index, route] of routes.entries()) assert.deepEqual(await request(route, teacherToken), before[index]);
  assert.deepEqual(await prisma.exerciseRecord.findUniqueOrThrow({ where: { id: seeded.recordId } }), record);
  assert.deepEqual(await prisma.exerciseSession.findUniqueOrThrow({ where: { id: seeded.sessionId } }), session);
  assert.deepEqual(await prisma.reviewRecord.findMany({ where: { recordId: seeded.recordId }, orderBy: { reviewVersion: 'asc' } }), reviews);
  assert.equal(await prisma.user.findUnique({ where: { id: seeded.studentUserId } }), null);
  for (const other of otherTeacherTokens) {
    for (const route of routes.slice(0, 3)) {
      const response = await fetch(baseUrl + route, { headers: { authorization: `Bearer ${other.token}` } });
      assert.equal(response.status, 404);
    }
  }
  console.log(JSON.stringify({ check: 'RETIRED_STUDENT_RECORD_LIST_DETAIL_EVIDENCE_REVIEW_HISTORY_UNCHANGED',
    result: 'PASS', syntheticReviewedRecords: 1, deniedRequests: otherTeacherTokens.length * 3,
    syntheticDirectDeletion: true, deletionApiValidated: false, realMediaValidated: false }));
}
