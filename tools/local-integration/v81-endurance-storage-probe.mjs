import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initialEnduranceBands } from '../../backend/src/modules/v8/domain/endurance-table.ts';

export async function probeEnduranceStorage(prisma, fixture) {
  const tableId = randomUUID(), now = new Date();
  const rows = initialEnduranceBands({ gender: 'male', gradeGroup: 'freshman_sophomore', runType: '1000m' }, randomUUID);
  await prisma.$executeRaw`INSERT INTO v81_endurance_tables(id,organization_id,gender,grade_group,run_type,created_at)
    VALUES(${tableId}::uuid,${fixture.organizationId}::uuid,'male','freshman_sophomore','1000m',${now})`;
  const insert = (bands, version) => prisma.$executeRaw`INSERT INTO v81_endurance_table_revisions
    (table_id,organization_id,version,bands,actor_id,request_id,created_at)
    VALUES(${tableId}::uuid,${fixture.organizationId}::uuid,${version},${JSON.stringify(bands)}::jsonb,
      ${fixture.adminUserId}::uuid,${randomUUID()},${now})`;
  await insert(rows, 1);
  const invalid = [[], rows.slice(0, 50).concat(rows.slice(51)), [rows[0], ...rows],
    [{ ...rows[0], score: 99, tier: 'fail' }, ...rows.slice(1)],
    [{ ...rows[0], maxSeconds: 240 }, ...rows.slice(1)],
    [{ ...rows[0], minSeconds: 0.1 }, ...rows.slice(1)],
    [{ ...rows[0], note: null }, ...rows.slice(1)]];
  for (const bands of invalid) await assert.rejects(insert(bands, 2));
  await assert.rejects(insert(rows, 3));
  await assert.rejects(prisma.$executeRaw`UPDATE v81_endurance_table_revisions SET bands='[]'::jsonb WHERE table_id=${tableId}::uuid`);
  await assert.rejects(prisma.$executeRaw`DELETE FROM v81_endurance_table_revisions WHERE table_id=${tableId}::uuid`);
  const next = rows.map((row, index) => index === 0 ? { ...row, note: 'Synthetic updated rule note' } : row);
  await insert(next, 2);
  const stored = await prisma.$queryRaw`SELECT version,bands FROM v81_endurance_table_revisions WHERE table_id=${tableId}::uuid ORDER BY version`;
  assert.deepEqual(stored.map(row => row.version), [1, 2]);
  assert.deepEqual(stored[0].bands, rows);
  assert.deepEqual(stored[1].bands, next);
  console.log(JSON.stringify({ check: 'ENDURANCE_DATABASE_IMMUTABLE_REVISIONS_AND_WHOLE_TABLE_CONSTRAINTS', result: 'PASS' }));
}
