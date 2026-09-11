import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function probeHistorySubjects({ prisma, fixture }) {
  const [missing] = await prisma.$queryRaw`SELECT count(*)::int AS n FROM users u LEFT JOIN v81_user_subjects s ON s.id=u.id
    WHERE s.id IS NULL OR s.organization_id<>u.organization_id`;
  assert.equal(missing.n, 0);
  const columns = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='v81_user_subjects' ORDER BY ordinal_position`;
  assert.deepEqual(columns.map(c => c.column_name), ['id', 'organization_id', 'role_at_creation', 'created_at', 'retired_at']);
  const profiles = await prisma.$queryRaw`SELECT t.id FROM teacher_profiles t JOIN v81_teacher_subjects s ON s.id=t.id
    AND s.organization_id=t.organization_id AND s.user_id=t.user_id WHERE t.organization_id=${fixture.organizationId}::uuid`;
  assert.ok(profiles.length >= 2);
  await assert.rejects(prisma.$executeRaw`UPDATE v81_user_subjects SET role_at_creation='STUDENT' WHERE id=${fixture.adminUserId}::uuid`);
  await assert.rejects(prisma.$executeRaw`DELETE FROM v81_user_subjects WHERE id=${fixture.adminUserId}::uuid`);
  const id = randomUUID(), email = `synthetic-subject-${id}@example.test`, now = new Date();
  const input = { id, organizationId: fixture.organizationId, role: 'ADMIN', status: 'ACTIVE', primaryEmail: email,
    primaryEmailNormalized: email, createdAt: now, updatedAt: now };
  await prisma.user.create({ data: input });
  const before = await prisma.$queryRaw`SELECT * FROM v81_user_subjects WHERE id=${id}::uuid`;
  assert.equal(before.length, 1); assert.equal(before[0].retired_at, null);
  // Only this synthetic, relation-free login row is deleted; existing business fixtures remain intact.
  await prisma.user.delete({ where: { id } });
  assert.equal(await prisma.user.findUnique({ where: { id } }), null);
  const [retired] = await prisma.$queryRaw`SELECT * FROM v81_user_subjects WHERE id=${id}::uuid`;
  assert.ok(retired.retired_at instanceof Date);
  assert.equal(retired.role_at_creation, 'ADMIN');
  assert.ok(!JSON.stringify(retired).includes(email));
  await assert.rejects(prisma.user.create({ data: input }));
  await assert.rejects(prisma.$executeRaw`UPDATE v81_user_subjects SET retired_at=NULL WHERE id=${id}::uuid`);
  const foreignKeys = await prisma.$queryRaw`SELECT confrelid::regclass::text AS target,count(*)::int AS count FROM pg_constraint
    WHERE contype='f' AND confrelid IN ('users'::regclass,'student_profiles'::regclass,'teacher_profiles'::regclass,'admin_profiles'::regclass)
    GROUP BY confrelid ORDER BY target`;
  console.log(JSON.stringify({ check: 'HISTORY_SUBJECT_BACKFILL_NEW_ID_RETIRE_IMMUTABLE_NO_PERSONAL_DATA_NO_RESTORE', result: 'PASS', remainingCurrentIdentityForeignKeys: foreignKeys,
    accountDeletionEndpointImplemented: false, businessForeignKeysMigrated: false }));
}
