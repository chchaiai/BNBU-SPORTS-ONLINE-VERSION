import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prepareOcrRosterSnapshot } from '../../backend/src/modules/v8/domain/ocr-roster-snapshot.ts';

export async function probeOcrRosterBasisStorage(prisma, fixture, batchId) {
  const draft = (await prisma.$queryRaw`SELECT * FROM v81_ocr_draft_revisions WHERE batch_id=${batchId}::uuid ORDER BY version DESC LIMIT 1`)[0];
  const snapshot = prepareOcrRosterSnapshot(draft.draft_rows);
  const snapshotId = randomUUID(), requestId = randomUUID();
  const insert = (id, sourceRows = snapshot, sourceVersion = draft.version, actorId = fixture.teacherUserId) => prisma.$executeRaw`
    INSERT INTO v81_confirmed_rosters(id,organization_id,class_section_id,ocr_batch_id,source_version,source_sha256,source_rows,version,actor_id,request_id,confirmed_at)
    SELECT ${id}::uuid,organization_id,class_section_id,id,${sourceVersion},encode(sha256(convert_to(source_manifest::text,'UTF8')),'hex'),
      ${JSON.stringify(sourceRows)}::jsonb,1,${actorId}::uuid,${requestId},${new Date()} FROM v81_ocr_batches WHERE id=${batchId}::uuid`;
  await assert.rejects(insert(randomUUID(), snapshot, 1));
  await assert.rejects(insert(randomUUID(), [{ ...snapshot[0], rawStudentNumber: 'changed' }]));
  await assert.rejects(insert(randomUUID(), snapshot, draft.version, fixture.adminUserId));
  await insert(snapshotId);
  const current = await prisma.$queryRaw`SELECT id,roster_import_id,ocr_batch_id,source_rows FROM v81_current_confirmed_rosters
    WHERE class_section_id=${fixture.teacherAActiveSectionId}::uuid`;
  assert.equal(current.length, 1); assert.equal(current[0].id, snapshotId); assert.equal(current[0].roster_import_id, null);
  assert.equal(current[0].ocr_batch_id, batchId); assert.deepEqual(current[0].source_rows, snapshot);
  await assert.rejects(insert(randomUUID()));
  await assert.rejects(prisma.$executeRaw`UPDATE v81_confirmed_rosters SET source_rows='[]'::jsonb WHERE id=${snapshotId}::uuid`);
  await assert.rejects(prisma.$executeRaw`DELETE FROM v81_roster_basis_history WHERE class_section_id=${fixture.teacherAActiveSectionId}::uuid`);
  await assert.rejects(prisma.$executeRaw`INSERT INTO v81_ocr_draft_revisions(batch_id,version,selections,draft_rows,actor_id,request_id,created_at)
    VALUES(${batchId}::uuid,3,${JSON.stringify(draft.selections)}::jsonb,${JSON.stringify(draft.draft_rows)}::jsonb,
      ${fixture.teacherUserId}::uuid,${requestId},${new Date()})`);
  const history = await prisma.$queryRaw`SELECT version,ocr_batch_id FROM v81_roster_basis_history WHERE class_section_id=${fixture.teacherAActiveSectionId}::uuid`;
  assert.deepEqual(history, [{ version: 1, ocr_batch_id: batchId }]);
  console.log(JSON.stringify({ check: 'OCR_ROSTER_UNIFIED_BASIS_SOURCE_SNAPSHOT_LATEST_ACTOR_IMMUTABLE_DRAFT', result: 'PASS', confirmationStorageOnly: true }));
}
