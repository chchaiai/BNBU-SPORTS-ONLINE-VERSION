import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { seedExerciseSessionStudent } from '../../backend/test/helpers/exercise-session.ts';

export async function probeHistoryReferences({ prisma, fixture, request, baseUrl, adminToken, teacherToken, otherTeacherTokens }) {
  const member = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase());
  const auditId = randomUUID();
  await prisma.auditLog.create({ data: { id: auditId, organizationId: fixture.organizationId, actorUserId: member.userId,
    actorRoleSnapshot: 'STUDENT', permissionId: 'SYNTHETIC-HISTORY-PROBE', actionType: 'USER_PROFILE_UPDATED',
    targetType: 'USER', targetId: member.userId, requestId: randomUUID(), outcome: 'SUCCEEDED', safeMetadata: { changedFields: [] }, occurredAt: new Date() } });
  const enrollmentBefore = await prisma.enrollment.findUniqueOrThrow({ where: { id: member.enrollmentId } });
  const auditBefore = await prisma.auditLog.findUniqueOrThrow({ where: { id: auditId } });
  await prisma.$transaction(async tx => {
    await tx.authSession.delete({ where: { id: member.authSessionId } });
    await tx.studentProfile.delete({ where: { id: member.studentId } });
    await tx.user.delete({ where: { id: member.userId } });
  });
  assert.equal(await prisma.user.findUnique({ where: { id: member.userId } }), null);
  assert.equal(await prisma.studentProfile.findUnique({ where: { id: member.studentId } }), null);
  assert.deepEqual(await prisma.enrollment.findUniqueOrThrow({ where: { id: member.enrollmentId } }), enrollmentBefore);
  assert.deepEqual(await prisma.auditLog.findUniqueOrThrow({ where: { id: auditId } }), auditBefore);
  const [linked] = await prisma.$queryRaw`SELECT s.user_id,s.retired_at,u.retired_at AS user_retired_at
    FROM enrollments e JOIN v81_student_subjects s ON s.id=e.student_id AND s.organization_id=e.organization_id
    JOIN v81_user_subjects u ON u.id=s.user_id AND u.organization_id=s.organization_id WHERE e.id=${member.enrollmentId}::uuid`;
  assert.equal(linked.user_id, member.userId);
  assert.ok(linked.retired_at && linked.user_retired_at);
  await assert.rejects(prisma.$executeRaw`DELETE FROM v81_student_subjects WHERE id=${member.studentId}::uuid`);
  const [remaining] = await prisma.$queryRaw`SELECT count(*)::int AS n FROM pg_constraint WHERE contype='f'
    AND confrelid IN ('users'::regclass,'student_profiles'::regclass,'teacher_profiles'::regclass,'admin_profiles'::regclass)`;
  assert.equal(remaining.n, 16);
  if (process.env.V81_HISTORY_READ_HTTP === '1') {
    const result = await request(`/enrollments/${member.enrollmentId}`, teacherToken);
    assert.equal(result.id, member.enrollmentId);
    assert.equal(result.studentId, member.studentId);
    assert.equal(result.status, enrollmentBefore.status);
    assert.ok(!JSON.stringify(result).includes(member.email));
    const list = await request(`/enrollments?classSectionId=${fixture.teacherAActiveSectionId}`, teacherToken);
    assert.ok(JSON.stringify(list).includes(member.enrollmentId));
    const audit = await request(`/admin/audit-events/FOUNDATION/${auditId}`, adminToken);
    assert.equal(audit.actorUserId, member.userId);
    assert.equal(audit.actorRoleSnapshot, 'STUDENT');
    assert.equal(audit.outcome, 'SUCCEEDED');
    for (const other of otherTeacherTokens) {
      const response = await fetch(baseUrl + `/enrollments/${member.enrollmentId}`, { headers: { authorization: `Bearer ${other.token}` } });
      assert.equal(response.status, 404);
    }
    console.log(JSON.stringify({ check: 'DELETED_STUDENT_ENROLLMENT_LIST_DETAIL_AUDIT_HTTP_TEACHER_SCOPE', result: 'PASS' }));
  }
  console.log(JSON.stringify({ check: 'HISTORY_REFERENCES_PHYSICAL_STUDENT_ACCOUNT_DELETE_ENROLLMENT_AUDIT_UNCHANGED', result: 'PASS',
    migratedForeignKeys: 66, remainingAccountForeignKeys: remaining.n, syntheticDirectSqlOnly: true, deletionApiImplemented: false }));
}
