import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { seedExerciseSessionStudent } from '../../backend/test/helpers/exercise-session.ts';

export async function probeApplicationHistoryRead({ prisma, fixture, request, baseUrl, teacherToken, otherTeacherTokens }) {
  const member = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase());
  const rows = [];
  for (const [applicationType, applicationSubtype] of [['PHYSICAL_TEST', 'RUN_800M'], ['EXERCISE_CHECK_IN', 'SCHOOL_TEAM']]) {
    rows.push(await prisma.exemptionApplication.create({ data: {
      id: randomUUID(), organizationId: fixture.organizationId, semesterId: fixture.semesterId,
      studentId: member.studentId, enrollmentId: member.enrollmentId, classSectionId: fixture.teacherAActiveSectionId,
      applicationType, applicationSubtype, organizationName: applicationType === 'EXERCISE_CHECK_IN' ? 'Synthetic team' : null,
      reason: 'Synthetic retained application read fixture', status: 'DRAFT', createdAt: new Date(), updatedAt: new Date(),
    } }));
  }
  const paths = ['/exemption-applications', '/activity-certification-applications',
    ...rows.map(row => `/exemption-applications/${row.id}`)];
  const before = [];
  for (const path of paths) before.push(await request(path, teacherToken));
  await prisma.$transaction(async tx => {
    await tx.authSession.delete({ where: { id: member.authSessionId } });
    await tx.studentProfile.delete({ where: { id: member.studentId } });
    await tx.user.delete({ where: { id: member.userId } });
  });
  for (const [index, path] of paths.entries()) assert.deepEqual(await request(path, teacherToken), before[index]);
  for (const row of rows) {
    assert.deepEqual(await prisma.exemptionApplication.findUniqueOrThrow({ where: { id: row.id } }), row);
    for (const other of otherTeacherTokens) {
      const response = await fetch(baseUrl + `/exemption-applications/${row.id}`,
        { headers: { authorization: `Bearer ${other.token}` } });
      assert.equal(response.status, 404);
    }
  }
  assert.equal(await prisma.studentProfile.findUnique({ where: { id: member.studentId } }), null);
  assert.equal(await prisma.user.findUnique({ where: { id: member.userId } }), null);
  console.log(JSON.stringify({ check: 'RETIRED_STUDENT_APPLICATION_LIST_DETAIL_CERTIFICATION_READ_UNCHANGED',
    result: 'PASS', retainedApplications: 2, syntheticDirectDeletion: true, deletionConfirmationValidated: false }));
}
