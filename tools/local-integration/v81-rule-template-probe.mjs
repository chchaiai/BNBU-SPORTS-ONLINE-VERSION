import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { seedExerciseSessionStudent } from '../../backend/test/helpers/exercise-session.ts';

export async function probeRuleTemplates({ prisma, fixture, request, baseUrl, adminToken, teacherToken, otherTeacherTokens }) {
  await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase());
  const sectionId = fixture.teacherAActiveSectionId;
  await prisma.classSection.update({ where: { id: sectionId }, data: {
    dailyStartTime: new Date('1970-01-01T00:00:00Z'), dailyEndTime: new Date('1970-01-01T23:59:59Z') } });
  const post = (path, body, token = adminToken, key = randomUUID()) => fetch(baseUrl + path, { method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) });
  assert.deepEqual((await request('/rule-templates', teacherToken)).items, []);
  const input = { displayName: 'Synthetic approved template', expectedVersion: 0 }, key = randomUUID();
  assert.equal((await post('/rule-templates', input, teacherToken)).status, 403);
  assert.equal((await post('/rule-templates', { ...input, totalTargetMinutes: 10 })).status, 422);
  const first = await request('/rule-templates', adminToken, input, key);
  assert.equal(first.version, 1); assert.equal(first.rules.totalTargetMinutes, 1200);
  assert.deepEqual(first.rules.minimumMinutesOptions, [30, 45, 60]); assert.equal(first.rules.specialSupplementHours, 72);
  assert.deepEqual(await request('/rule-templates', adminToken, input, key), first);
  assert.deepEqual(await request('/rule-templates/' + first.id, teacherToken), first);
  const outsider = otherTeacherTokens.find(t => t.role === 'OTHER_ORGANIZATION').token;
  assert.equal((await fetch(baseUrl + '/rule-templates/' + first.id, { headers: { authorization: `Bearer ${outsider}` } })).status, 404);
  try {
    await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUB',permissions='["GLOBAL_RULES"]'::jsonb WHERE user_id=${fixture.adminUserId}::uuid`;
    assert.equal((await post('/rule-templates', { ...input, expectedVersion: 1 })).status, 403);
    assert.equal((await fetch(baseUrl + '/rule-templates', { headers: { authorization: `Bearer ${adminToken}` } })).status, 403);
  } finally {
    await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUPER',permissions='[]'::jsonb WHERE user_id=${fixture.adminUserId}::uuid`;
  }
  const courseInput = { minimumMinutes: 30, weeklyLimit: 3, courseTarget: 600, generalTarget: 600,
    regularDeadline: '2027-01-23T00:00:00Z', closingDeadline: '2027-01-30T00:00:00Z', settlementPlannedAt: '2027-01-30T01:00:00Z', publish: true, expectedVersion: 0 };
  const coursePath = `/class-sections/${sectionId}/v81-rules`;
  assert.equal((await post(coursePath, courseInput, teacherToken)).status, 422);
  assert.equal((await post(coursePath, { ...courseInput, templateId: randomUUID() }, teacherToken)).status, 404);
  const courseKey = randomUUID(), published = await request(coursePath, teacherToken, { ...courseInput, templateId: first.id }, courseKey);
  assert.equal(published.templateId, first.id);
  assert.deepEqual(await request(coursePath, teacherToken, { ...courseInput, templateId: first.id }, courseKey), published);
  const before = await request(coursePath, teacherToken);
  const competing = await Promise.all(['A', 'B'].map(name => post('/rule-templates', { displayName: 'Synthetic ' + name, expectedVersion: 1 })));
  assert.deepEqual(competing.map(r => r.status).sort(), [201, 409]);
  const second = (await competing.find(r => r.status === 201).json()).data;
  const page = await request('/rule-templates?limit=1', teacherToken);
  assert.equal(page.items[0].id, second.id); assert.equal(page.nextBeforeVersion, 2);
  assert.deepEqual((await request('/rule-templates?limit=1&beforeVersion=2', teacherToken)).items, [first]);
  assert.deepEqual(await request(coursePath, teacherToken), before);
  assert.equal(before.template_id, first.id);
  assert.equal((await post(coursePath, { ...courseInput, templateId: second.id, expectedVersion: 1 }, teacherToken)).status, 409);
  await assert.rejects(prisma.$executeRaw`UPDATE v81_rule_templates SET display_name='changed' WHERE id=${first.id}::uuid`);
  await assert.rejects(prisma.$executeRaw`DELETE FROM v81_rule_templates WHERE id=${second.id}::uuid`);
  const events = await prisma.$queryRaw`SELECT resource_id,version FROM v81_events WHERE organization_id=${fixture.organizationId}::uuid AND resource_type='RULE_TEMPLATE' ORDER BY version`;
  assert.deepEqual(events, [{ resource_id: first.id, version: 1 }, { resource_id: second.id, version: 2 }]);
  console.log(JSON.stringify({ check: 'APPROVED_TEMPLATE_SUPER_ONLY_IMMUTABLE_VERSIONS_COURSE_SELECTION_NO_RETROACTIVE_CHANGE', result: 'PASS', syntheticFixture: true }));
  if (process.env.V81_COURSE_REMINDERS === '1') {
    const { probeCourseReminder } = await import('./v81-course-reminder-probe.mjs');
    await probeCourseReminder({ prisma, fixture, request, teacherToken });
  }
}
