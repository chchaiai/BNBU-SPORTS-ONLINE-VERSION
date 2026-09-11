import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function probeOcrPhysicalStorage(prisma, fixture, member) {
  const batch = (await prisma.$queryRaw`SELECT * FROM v81_ocr_batches WHERE organization_id=${fixture.organizationId}::uuid AND purpose='PHYSICAL'`)[0];
  const student = await prisma.studentProfile.findUniqueOrThrow({ where: { id: member.studentId } });
  const page = batch.source_manifest[0], requestId = randomUUID(), rowId = randomUUID();
  const runType = student.gender === 'MALE' ? '1000m' : '800m';
  const selections = [{ pageId: page.id, attempt: 1, tableIndex: 0, headerRow: 0,
    columns: { studentNumber: 0, name: 1, runType: 2, elapsed: 3, testedOn: 4 } }];
  const row = { id: rowId, source: { pageId: page.id, attempt: 1, tableIndex: 0, sourceRow: 1, evidence: {} },
    values: { studentNumber: student.studentNumber, name: student.fullName, runType, elapsed: '4:30', testedOn: '2026-09-08' },
    ocrIssues: [], reviewedAgainstSource: false };
  const draft = (version, content) => prisma.$executeRaw`INSERT INTO v81_ocr_draft_revisions(batch_id,version,selections,draft_rows,actor_id,request_id,created_at)
    VALUES(${batch.id}::uuid,${version},${JSON.stringify(selections)}::jsonb,${JSON.stringify([content])}::jsonb,
      ${fixture.teacherUserId}::uuid,${requestId},${new Date()})`;
  const link = (version = 2, actor = fixture.teacherUserId, linkRequest = requestId) => prisma.$executeRaw`
    INSERT INTO v81_ocr_physical_confirmations(batch_id,row_id,draft_version,enrollment_id,result_version,actor_id,request_id,created_at)
    VALUES(${batch.id}::uuid,${rowId}::uuid,${version},${member.enrollmentId}::uuid,1,${actor}::uuid,${linkRequest},${new Date()})`;
  await draft(1, row);
  await assert.rejects(link(1));
  const reviewed = { ...row, reviewedAgainstSource: true };
  await draft(2, reviewed);
  await prisma.$executeRaw`INSERT INTO v81_physical_result_revisions(enrollment_id,organization_id,version,run_type,elapsed_seconds,tested_on,actor_id,request_id,created_at)
    VALUES(${member.enrollmentId}::uuid,${fixture.organizationId}::uuid,1,${runType},270,'2026-09-08'::date,
      ${fixture.teacherUserId}::uuid,${requestId},${new Date()})`;
  await assert.rejects(link(1));
  await assert.rejects(link(2, fixture.adminUserId));
  await assert.rejects(link(2, fixture.teacherUserId, randomUUID()));
  await link();
  await assert.rejects(link());
  await assert.rejects(prisma.$executeRaw`UPDATE v81_ocr_physical_confirmations SET draft_version=1 WHERE batch_id=${batch.id}::uuid`);
  await assert.rejects(prisma.$executeRaw`DELETE FROM v81_ocr_physical_confirmations WHERE batch_id=${batch.id}::uuid`);
  await assert.rejects(draft(3, { ...reviewed, values: { ...reviewed.values, elapsed: '5:30' } }));
  await assert.rejects(draft(3, { ...reviewed, reviewedAgainstSource: false }));
  await draft(3, reviewed);
  const stored = await prisma.$queryRaw`SELECT draft_version,result_version FROM v81_ocr_physical_confirmations WHERE batch_id=${batch.id}::uuid`;
  assert.deepEqual(stored, [{ draft_version: 2, result_version: 1 }]);
  console.log(JSON.stringify({ check: 'OCR_PHYSICAL_SOURCE_LINK_LATEST_REVIEW_ACTOR_REQUEST_UNIQUE_IMMUTABLE_CONFIRMED_ROW', result: 'PASS', storageMetadataOnly: true }));
}
