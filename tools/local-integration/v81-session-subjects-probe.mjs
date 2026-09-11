import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { seedExerciseSessionStudent } from '../../backend/test/helpers/exercise-session.ts';

export async function probeSessionSubjects({ prisma, fixture }) {
  const student = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase());
  const preferenceId = randomUUID(), eventId = randomUUID(), now = new Date();
  await prisma.userPreference.create({ data: { id: preferenceId, organizationId: fixture.organizationId, userId: student.userId,
    locale: 'en', pushEnabled: false, emailEnabled: true, createdAt: now, updatedAt: now } });
  await prisma.userPreferenceEvent.create({ data: { id: eventId, organizationId: fixture.organizationId, userPreferenceId: preferenceId,
    actorUserId: student.userId, authSessionId: student.authSessionId, requestId: randomUUID(), eventVersion: 1,
    changedFields: ['locale'], occurredAt: now } });
  const before = await prisma.userPreferenceEvent.findUniqueOrThrow({ where: { id: eventId } });
  await prisma.$transaction(async tx => {
    await tx.userPreference.delete({ where: { id: preferenceId } });
    await tx.authSession.delete({ where: { id: student.authSessionId } });
  });
  assert.equal(await prisma.authSession.findUnique({ where: { id: student.authSessionId } }), null);
  assert.equal(await prisma.userPreference.findUnique({ where: { id: preferenceId } }), null);
  assert.deepEqual(await prisma.userPreferenceEvent.findUniqueOrThrow({ where: { id: eventId } }), before);
  const [joined] = await prisma.$queryRaw`SELECT s.retired_at AS session_retired,p.retired_at AS preference_retired
    FROM user_preference_events e JOIN v81_auth_session_subjects s ON s.id=e.auth_session_id AND s.organization_id=e.organization_id
    JOIN v81_user_preference_subjects p ON p.id=e.user_preference_id AND p.organization_id=e.organization_id WHERE e.id=${eventId}::uuid`;
  assert.ok(joined.session_retired && joined.preference_retired);
  const columns = await prisma.$queryRaw`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'
    AND table_name IN ('v81_auth_session_subjects','v81_push_device_subjects','v81_user_preference_subjects')`;
  assert.equal(columns.length, 15);
  assert.ok(columns.every(c => ['id', 'organization_id', 'user_id', 'created_at', 'retired_at'].includes(c.column_name)));
  await assert.rejects(prisma.$executeRaw`DELETE FROM v81_auth_session_subjects WHERE id=${student.authSessionId}::uuid`);
  await assert.rejects(prisma.$executeRaw`UPDATE v81_user_preference_subjects SET retired_at=NULL WHERE id=${preferenceId}::uuid`);
  console.log(JSON.stringify({ check: 'SESSION_PREFERENCE_PHYSICAL_DELETE_EVENT_HISTORY_NO_CREDENTIAL_SUBJECT', result: 'PASS', migratedForeignKeys: 12,
    directSyntheticStorageTest: true, accountDeletionConfirmationImplemented: false }));
}
