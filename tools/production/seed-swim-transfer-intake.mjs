// Test-only historical intake fixture; its deliberately aged acceptance is not an HTTP receipt.
import assert from 'node:assert/strict';
import { loadRuntimeSecrets } from '/app/dist/common/config/file-json-secret-loader.js';
import { validateEnvironment } from '/app/dist/common/config/environment.js';
import { PrismaService } from '/app/dist/common/database/prisma.service.js';
const [recordId, ...mediaIds] = process.argv.slice(2);
assert.equal(mediaIds.length, 2);
for (const id of [recordId, ...mediaIds]) assert.match(id, /^[0-9a-f-]{36}$/);
await loadRuntimeSecrets(process.env);
const db = new PrismaService(validateEnvironment(process.env).RUNTIME_CONFIG);
try {
  const result = await db.$transaction(async tx => {
    const record = await tx.exerciseRecord.findUniqueOrThrow({ where: { id: recordId }, include: { session: true } });
    assert.equal(record.organizationId, '01a096c2-20a2-706b-8c69-802f67dee12c');
    assert.equal(record.status, 'DRAFT');
    assert.equal(record.sportType, 'SWIMMING');
    assert.match(record.description, /^Synthetic transfer expiry fixture /);
    const existing = await tx.$queryRaw`SELECT record_id FROM v81_swim_intakes WHERE record_id=${recordId}::uuid`;
    assert.equal(existing.length, 0);
    const media = await tx.mediaEvidence.findMany({ where: { id: { in: mediaIds }, sessionId: record.sessionId, ownerStudentId: record.studentId, uploadStatus: 'PENDING_UPLOAD' } });
    assert.equal(media.length, 2);
    const endedAt = record.session.completedAt;
    assert.ok(endedAt);
    const acceptedAt = new Date(endedAt.getTime() + 5 * 60000);
    const deadline = new Date(acceptedAt.getTime() + 30 * 60000);
    assert.ok(deadline < new Date());
    await tx.$executeRaw`INSERT INTO v81_swim_intakes(record_id,organization_id,accepted_at,session_ended_at,transfer_deadline,intake_kind,delay_reason)
      VALUES(${recordId}::uuid,${record.organizationId}::uuid,${acceptedAt},${endedAt},${deadline},'ON_TIME',NULL)`;
    for (const [index, mediaId] of mediaIds.entries()) {
      const hash = media.find(item => item.id === mediaId).declaredContentSha256;
      assert.match(hash, /^[0-9a-f]{64}$/);
      const phase = index === 0 ? 'BEFORE' : 'AFTER';
      await tx.$executeRaw`INSERT INTO v81_swim_intake_items(record_id,media_id,phase,position,content_sha256)
        VALUES(${recordId}::uuid,${mediaId}::uuid,${phase},${index + 1},${hash})`;
    }
    return { recordId, acceptedAt, deadline, baseline: 'Deliberately historical acceptance seeded for this new fixture; materials initialized now. This is not proof of a real elapsed upload window.' };
  });
  console.log(JSON.stringify(result));
} finally { await db.$disconnect(); }
