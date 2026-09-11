import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { FixedClock } from '../../backend/src/common/time/clock.ts';
import { V81SettlementCheckService } from '../../backend/src/modules/v8/v81-settlement-check.ts';
import { courseReminderDue, V81CourseRemindersService } from '../../backend/src/modules/v8/v81-course-reminders.ts';

export async function probeCourseReminder({ prisma, fixture, request, teacherToken }) {
  const deadline = new Date('2027-01-23T00:00:00Z'), due = new Date('2027-01-09T00:00:00Z');
  assert.equal(courseReminderDue(new Date('2026-09-01T00:00:00Z'), deadline, new Date(due.getTime() - 1)), false);
  assert.equal(courseReminderDue(new Date('2026-09-01T00:00:00Z'), deadline, due), true);
  assert.equal(courseReminderDue(new Date('2027-01-20T00:00:00Z'), deadline, new Date('2027-01-20T00:00:00Z')), true);
  assert.equal(courseReminderDue(new Date('2027-01-20T00:00:00Z'), deadline, due), false);
  assert.equal(courseReminderDue(due, deadline, deadline), false);
  const clock = new FixedClock(new Date(due.getTime() - 1));
  const service = new V81CourseRemindersService(prisma, clock, { next: () => randomUUID() }, new V81SettlementCheckService(prisma, clock));
  const sectionId = fixture.teacherAActiveSectionId;
  const student = await prisma.enrollment.findFirstOrThrow({ where: { classSectionId: sectionId, status: 'ACTIVE' }, include: { student: true } });
  const count = () => prisma.notification.count({ where: { organizationId: fixture.organizationId, notificationType: 'COURSE_DEADLINE_REMINDER' } });
  assert.equal(await count(), 0);
  await service.process(fixture.organizationId, sectionId); assert.equal(await count(), 0);
  clock.set(due);
  await prisma.systemPolicy.update({ where: { organizationId: fixture.organizationId }, data: { systemMode: 'MAINTENANCE' } });
  try { await service.process(fixture.organizationId, sectionId); assert.equal(await count(), 0); }
  finally { await prisma.systemPolicy.update({ where: { organizationId: fixture.organizationId }, data: { systemMode: 'NORMAL' } }); }
  await Promise.all([service.process(fixture.organizationId, sectionId), service.process(fixture.organizationId, sectionId)]);
  assert.equal(await count(), 2);
  await service.process(fixture.organizationId, sectionId); assert.equal(await count(), 2);
  const notices = await prisma.notification.findMany({ where: { organizationId: fixture.organizationId, notificationType: 'COURSE_DEADLINE_REMINDER' } });
  const own = notices.find(n => n.recipientUserId === student.student.userId);
  assert.ok(own); assert.equal(own.targetId, student.id); assert.equal(own.targetType, 'ENROLLMENT');
  assert.ok(own.body.includes('1200')); assert.ok(notices.every(n => n.createdAt.getTime() === due.getTime()));
  const teacherNotices = (await request('/notifications?limit=100', teacherToken)).filter(n => n.notificationType === 'COURSE_DEADLINE_REMINDER');
  assert.equal(teacherNotices.length, 1); assert.equal(teacherNotices[0].targetId, sectionId);
  const events = await prisma.$queryRaw`SELECT facts,actor_id FROM v81_events WHERE organization_id=${fixture.organizationId}::uuid AND resource_type='COURSE_REMINDER'`;
  assert.equal(events.length, 2); assert.ok(events.every(e => e.actor_id === null && e.facts.evaluatedAt === due.toISOString()));
  clock.set(deadline); await service.process(fixture.organizationId, sectionId); assert.equal(await count(), 2);
  console.log(JSON.stringify({ check: 'COURSE_DEADLINE_14_DAY_BOUNDARY_MAINTENANCE_CONCURRENT_DEDUP_PROGRESS_TEACHER_INBOX', result: 'PASS', syntheticClock: true, schedulerTimingNotValidated: true }));
}
