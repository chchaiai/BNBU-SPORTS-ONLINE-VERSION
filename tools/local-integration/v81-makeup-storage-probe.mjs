import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { seedExerciseSessionStudent } from '../../backend/test/helpers/exercise-session.ts';

export async function probeMakeupStorage(prisma, fixture) {
  const member = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase());
  const removed = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase(), 'REMOVED');
  const now = new Date(), requestId = randomUUID();
  await prisma.$executeRaw`INSERT INTO v81_course_rules(class_section_id,organization_id,minimum_minutes,weekly_limit,course_target,general_target,
    regular_deadline,closing_deadline,settlement_planned_at,published_at,version)
    VALUES(${fixture.teacherAActiveSectionId}::uuid,${fixture.organizationId}::uuid,30,3,600,600,
      '2027-01-23T00:00:00Z','2027-01-30T00:00:00Z','2027-01-30T01:00:00Z',${now},1)`;
  const windowId = randomUUID(), startsAt = new Date('2027-01-24T00:00:00Z'), endsAt = new Date('2027-01-26T00:00:00Z');
  const grant = (overrides = {}) => {
    const w = { id: randomUUID(), actor: fixture.teacherUserId, enrollment: member.enrollmentId, version: 1, startsAt, endsAt, createdAt: now, ...overrides };
    return prisma.$executeRaw`INSERT INTO v81_makeup_windows(id,organization_id,class_section_id,enrollment_id,rule_version,starts_at,ends_at,actor_id,request_id,created_at)
      VALUES(${w.id}::uuid,${fixture.organizationId}::uuid,${fixture.teacherAActiveSectionId}::uuid,${w.enrollment}::uuid,${w.version},
        ${w.startsAt},${w.endsAt},${w.actor}::uuid,${requestId},${w.createdAt})`;
  };
  await assert.rejects(grant({ actor: fixture.adminUserId }));
  await assert.rejects(grant({ enrollment: removed.enrollmentId }));
  await assert.rejects(grant({ version: 2 }));
  await assert.rejects(grant({ startsAt: new Date('2027-01-22T23:59:59Z') }));
  await assert.rejects(grant({ endsAt: new Date('2027-01-30T00:00:00.001Z') }));
  await assert.rejects(grant({ createdAt: endsAt }));
  await grant({ id: windowId });
  await assert.rejects(prisma.$executeRaw`UPDATE v81_makeup_windows SET ends_at=ends_at+interval '1 hour' WHERE id=${windowId}::uuid`);
  await assert.rejects(prisma.$executeRaw`DELETE FROM v81_makeup_windows WHERE id=${windowId}::uuid`);
  const session = async startedAt => {
    const id = randomUUID();
    await prisma.exerciseSession.create({ data: { id, organizationId: fixture.organizationId, studentId: member.studentId,
      enrollmentId: member.enrollmentId, classSectionId: fixture.teacherAActiveSectionId, semesterId: fixture.semesterId,
      startedByAuthSessionId: member.authSessionId, status: 'COMPLETED', startedAt, businessDate: new Date('2027-01-25T00:00:00Z'),
      completedAt: startedAt, endReason: 'USER_COMPLETED', actualDurationSeconds: 0n, pausedDurationSeconds: 0n,
      createdAt: startedAt, updatedAt: startedAt } });
    return id;
  };
  const startedAt = new Date('2027-01-25T00:00:00Z'), sessionId = await session(startedAt);
  const link = (id, time) => prisma.$executeRaw`INSERT INTO v81_makeup_session_sources(session_id,window_id,created_at)
    VALUES(${id}::uuid,${windowId}::uuid,${time})`;
  await link(sessionId, startedAt);
  const revoke = (actor = fixture.teacherUserId) => prisma.$executeRaw`INSERT INTO v81_makeup_revocations(window_id,actor_id,reason,request_id,created_at)
    VALUES(${windowId}::uuid,${actor}::uuid,'Synthetic revoke future starts',${requestId},'2027-01-25T00:01:00Z')`;
  await assert.rejects(revoke(fixture.adminUserId));
  await revoke(); await assert.rejects(revoke());
  const later = new Date('2027-01-25T00:02:00Z'), laterSession = await session(later);
  await assert.rejects(link(laterSession, later));
  await assert.rejects(prisma.$executeRaw`DELETE FROM v81_makeup_revocations WHERE window_id=${windowId}::uuid`);
  await assert.rejects(prisma.$executeRaw`DELETE FROM v81_makeup_session_sources WHERE session_id=${sessionId}::uuid`);
  assert.equal((await prisma.$queryRaw`SELECT session_id FROM v81_makeup_session_sources WHERE window_id=${windowId}::uuid`).length, 1);
  assert.equal((await prisma.exerciseSession.findUniqueOrThrow({ where: { id: sessionId } })).status, 'COMPLETED');
  console.log(JSON.stringify({ check: 'MAKEUP_STORAGE_SCOPE_PUBLISHED_WINDOW_IMMUTABLE_REVOCATION_SESSION_SOURCE', result: 'PASS', storageMetadataOnly: true, syntheticTimes: true }));
}
