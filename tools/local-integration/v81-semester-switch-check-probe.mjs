import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function probeSemesterSwitchCheck({ prisma, fixture, request, baseUrl, adminToken, teacherToken, targetId }) {
  const path = `/admin/semesters/${targetId}/switch-check`;
  const semestersBefore = await prisma.semester.findMany({ where: { organizationId: fixture.organizationId }, orderBy: { id: 'asc' } });
  const eventsBefore = await prisma.$queryRaw`SELECT count(*) AS count FROM v81_events WHERE organization_id=${fixture.organizationId}::uuid`;
  let cursor = null;
  const courses = [];
  const total = await prisma.classSection.count({ where: { semesterId: fixture.semesterId, organizationId: fixture.organizationId } });
  do {
    const page = await request(path + '?limit=1' + (cursor ? '&after=' + cursor : ''), adminToken);
    assert.equal(page.ready, false); assert.equal(page.target.id, targetId); assert.equal(page.current.id, fixture.semesterId);
    assert.equal(page.totalCourseCount, total); assert.ok(page.courses.length <= 1);
    assert.equal(page.checks.find(c => c.code === 'TARGET_START_DATE').status, 'BLOCKED');
    assert.deepEqual(page.checks.find(c => c.code === 'FORMAL_COURSE_SETTLEMENT'), { code: 'FORMAL_COURSE_SETTLEMENT', status: 'BLOCKED', count: total });
    assert.deepEqual(page.checks.find(c => c.code === 'COURSE_UNFINISHED_WORK'), { code: 'COURSE_UNFINISHED_WORK', status: 'UNAVAILABLE', count: total });
    courses.push(...page.courses); cursor = page.nextCursor;
  } while (cursor);
  assert.equal(courses.length, total); assert.equal(new Set(courses.map(c => c.classSectionId)).size, total);
  const teacherCheck = await request(`/class-sections/${fixture.teacherAActiveSectionId}/settlement-check`, teacherToken);
  assert.deepEqual(courses.find(c => c.classSectionId === fixture.teacherAActiveSectionId).checks, teacherCheck.checks);
  assert.ok(courses.every(c => c.ready === false && c.checks.some(check => check.status === 'UNAVAILABLE')));
  const currentTarget = await request(`/admin/semesters/${fixture.semesterId}/switch-check`, adminToken);
  assert.equal(currentTarget.checks.find(c => c.code === 'TARGET_UPCOMING').status, 'BLOCKED');
  for (const [route, token, status] of [[path, teacherToken, 403], [path + '?limit=101', adminToken, 422],
    [path + '?after=invalid', adminToken, 422], [`/admin/semesters/${fixture.isolationSemesterId}/switch-check`, adminToken, 404],
    [`/admin/semesters/${randomUUID()}/switch-check`, adminToken, 404]])
    assert.equal((await fetch(baseUrl + route, { headers: { authorization: `Bearer ${token}` } })).status, status);
  try {
    for (const permissions of [[], ['COURSE_VIEW'], ['SEMESTER_MANAGE']]) {
      await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUB',permissions=${JSON.stringify(permissions)}::jsonb WHERE user_id=${fixture.adminUserId}::uuid`;
      assert.equal((await fetch(baseUrl + path, { headers: { authorization: `Bearer ${adminToken}` } })).status,
        permissions.includes('SEMESTER_MANAGE') ? 200 : 403);
    }
  } finally {
    await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUPER',permissions='[]'::jsonb WHERE user_id=${fixture.adminUserId}::uuid`;
  }
  assert.deepEqual(await prisma.semester.findMany({ where: { organizationId: fixture.organizationId }, orderBy: { id: 'asc' } }), semestersBefore);
  assert.deepEqual(await prisma.$queryRaw`SELECT count(*) AS count FROM v81_events WHERE organization_id=${fixture.organizationId}::uuid`, eventsBefore);
  console.log(JSON.stringify({ check: 'SEMESTER_SWITCH_PREFLIGHT_SCOPE_DATE_PAGINATION_SHARED_COURSE_BLOCKERS_NO_MUTATION', result: 'PASS', settlementSource: 'saved reports' }));
}
