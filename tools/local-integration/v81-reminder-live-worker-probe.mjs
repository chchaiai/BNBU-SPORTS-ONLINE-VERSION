import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { seedExerciseSessionStudent } from '../../backend/test/helpers/exercise-session.ts';

export async function probeReminderLiveWorker({ prisma, fixture, request, adminToken, teacherToken }) {
  const student = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase());
  const template = await request('/rule-templates', adminToken, { displayName: 'Synthetic live reminder template', expectedVersion: 0 });
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: fixture.organizationId } });
  const challenge = await request('/auth/student-sign-in-codes', null, { organizationCode: organization.organizationCode,
    account: student.email, channel: 'EMAIL', locale: 'en' });
  let code;
  for (let i = 0; i < 30 && !code; i++) {
    const messages = await (await fetch('http://mailpit:8025/api/v1/messages?limit=50')).json();
    const message = messages.messages?.find(item => JSON.stringify(item.To ?? []).toLowerCase().includes(student.email));
    if (message) {
      const detail = await (await fetch(`http://mailpit:8025/api/v1/message/${encodeURIComponent(message.ID)}`)).json();
      code = String(detail.Text ?? '').match(/(?:code is|验证码是)\s*(\d{4,10})/u)?.[1];
    }
    if (!code) await delay(500);
  }
  assert.ok(code, 'Synthetic student email must arrive in local Mailpit');
  const login = await request('/auth/student-sign-in-codes/verify', null, { challengeId: challenge.challengeId, code, deviceId: randomUUID() });
  const notices = () => prisma.notification.findMany({ where: { organizationId: fixture.organizationId, notificationType: 'COURSE_DEADLINE_REMINDER' } });
  const publishedAt = new Date(), regular = new Date(publishedAt.getTime() + 86400000), closing = new Date(regular.getTime() + 7 * 86400000);
  await prisma.systemPolicy.update({ where: { organizationId: fixture.organizationId }, data: { systemMode: 'MAINTENANCE' } });
  try {
    // Intentionally synthetic due schedule, inserted directly to isolate the actual background timer.
    // This does not prove course-plan feasibility or the near-deadline publication HTTP workflow.
    await prisma.$executeRaw`INSERT INTO v81_course_rules(class_section_id,organization_id,minimum_minutes,weekly_limit,course_target,general_target,
      regular_deadline,closing_deadline,settlement_planned_at,published_at,version,template_id)
      VALUES(${fixture.teacherAActiveSectionId}::uuid,${fixture.organizationId}::uuid,30,3,600,600,${regular},${closing},${closing},${publishedAt},1,${template.id}::uuid)`;
    await delay(12000);
    assert.equal((await notices()).length, 0);
  } finally {
    await prisma.systemPolicy.update({ where: { organizationId: fixture.organizationId }, data: { systemMode: 'NORMAL' } });
  }
  const resumedAt = new Date();
  let delivered = [];
  for (let i = 0; i < 45; i++) {
    delivered = await notices();
    if (delivered.length === 2) break;
    await delay(1000);
  }
  assert.equal(delivered.length, 2, 'Actual application timer must deliver both scoped notifications within the local observation window');
  assert.ok(delivered.every(n => n.createdAt >= publishedAt && n.createdAt >= resumedAt));
  const studentInbox = (await request('/notifications?limit=100', login.accessToken)).filter(n => n.notificationType === 'COURSE_DEADLINE_REMINDER');
  const teacherInbox = (await request('/notifications?limit=100', teacherToken)).filter(n => n.notificationType === 'COURSE_DEADLINE_REMINDER');
  assert.equal(studentInbox.length, 1); assert.equal(teacherInbox.length, 1);
  assert.equal(studentInbox[0].targetId, student.enrollmentId); assert.equal(teacherInbox[0].targetId, fixture.teacherAActiveSectionId);
  assert.ok(studentInbox[0].body.includes('1200'));
  const key = randomUUID(), read = await request(`/notifications/${studentInbox[0].id}/read`, login.accessToken, {}, key);
  assert.ok(read.readAt); assert.deepEqual(await request(`/notifications/${studentInbox[0].id}/read`, login.accessToken, {}, key), read);
  await delay(12000);
  assert.equal((await notices()).length, 2);
  const events = await prisma.$queryRaw`SELECT facts,occurred_at,actor_id FROM v81_events WHERE organization_id=${fixture.organizationId}::uuid AND resource_type='COURSE_REMINDER'`;
  assert.equal(events.length, 2); assert.ok(events.every(e => e.actor_id === null && e.occurred_at >= resumedAt));
  console.log(JSON.stringify({ check: 'LIVE_BACKGROUND_REMINDER_MAINTENANCE_RESUME_STUDENT_TEACHER_INBOX_RESCAN_DEDUP', result: 'PASS',
    syntheticSchedule: true, realClockAndApplicationTimer: true,
    firstNoticeAfterResumeMs: Math.min(...delivered.map(n => n.createdAt.getTime())) - resumedAt.getTime(),
    nearDeadlinePublicationNotValidated: true, restartNotValidated: true }));
}
