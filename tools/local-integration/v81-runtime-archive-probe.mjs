import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { OrganizationTimeService } from '../../backend/src/common/time/organization-time.service.ts';
const { CFB } = createRequire(new URL('../../backend/package.json', import.meta.url))('xlsx');

export async function probeRuntimeArchive({ prisma, fixture, request, baseUrl, adminToken, teacherToken, localStorage }) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: fixture.organizationId } });
  const date = new OrganizationTimeService().businessDate(new Date(), org.timezone);
  const diagnosticEventId = randomUUID(), diagnosticRequestId = randomUUID();
  if (process.env.V81_RUNTIME_ARCHIVE_DIAGNOSTICS === '1') {
    await prisma.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at)
      VALUES(${diagnosticEventId}::uuid,${fixture.organizationId}::uuid,'DIAGNOSTIC_TEST',${randomUUID()}::uuid,'OBSERVED',${fixture.adminUserId}::uuid,${diagnosticRequestId},1,
      '{"secret":"SYNTHETIC_ARCHIVE_PRIVATE_FACT"}'::jsonb,now())`;
    assert.equal((await fetch(baseUrl + '/auth/account-security', { headers: { authorization: `Bearer ${adminToken}`, 'x-request-id': diagnosticRequestId } })).status, 200);
  }
  const path = '/admin/runtime-archives', body = { startDate: date, endDate: date }, key = randomUUID();
  const raw = (route, token, payload) => fetch(baseUrl + route, { method: payload ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
    ...(payload ? { body: JSON.stringify(payload) } : {}) });
  assert.equal((await raw(path, teacherToken, body)).status, 403);
  assert.equal((await raw(path, adminToken, { ...body, startDate: '2026-02-30' })).status, 422);
  const created = await request(path, adminToken, body, key);
  assert.equal(created.status, 'QUEUED');
  assert.deepEqual(await request(path, adminToken, body, key), created);
  let job;
  for (let i = 0; i < 90; i++) {
    job = await request(`${path}/${created.id}`, adminToken);
    if (['SUCCEEDED', 'FAILED'].includes(job.status)) break;
    await delay(500);
  }
  assert.equal(job.status, 'SUCCEEDED', `archive worker terminal state: ${job.status}/${job.failureCode}`);
  assert.ok(job.recordCount > 0);
  assert.equal(job.coverage, 'AVAILABLE_SCOPED_HTTP_RECORDS_ONLY');
  const cap = await request(`${path}/${job.id}/download-url`, adminToken, { expectedVersion: job.version });
  const url = new URL(cap.downloadUrl, baseUrl);
  const download = await fetch(url, { headers: { authorization: `Bearer ${adminToken}` } });
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-type'), /application\/zip/);
  assert.match(download.headers.get('cache-control'), /no-store/);
  const bytes = Buffer.from(await download.arrayBuffer());
  assert.equal(bytes.length, job.byteLength);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), job.sha256);
  const zip = CFB.read(bytes, { type: 'buffer' });
  const text = name => {
    const entry = CFB.find(zip, name);
    assert.ok(entry, `ZIP entry ${name}`);
    return Buffer.from(entry.content).toString('utf8');
  };
  const manifest = JSON.parse(text('manifest.json'));
  const records = text('runtime.ndjson').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(manifest.archiveId, job.id);
  assert.equal(records.length, job.recordCount);
  assert.ok(records.every(r => r.organizationId === fixture.organizationId));
  assert.ok(!JSON.stringify(records).includes('SYNTHETIC_SENSITIVE_MARKER'));
  if (process.env.V81_RUNTIME_ARCHIVE_DIAGNOSTICS === '1') {
    const audit = text('audit.ndjson').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    assert.equal(audit.length, manifest.auditEventCount);
    const event = audit.find(r => r.id === diagnosticEventId);
    assert.ok(event);
    assert.equal(event.outcome, null);
    assert.equal(event.actorRoleSnapshot, null);
    assert.deepEqual(event.safeMetadata, { version: 1 });
    assert.ok(!text('audit.ndjson').includes('SYNTHETIC_ARCHIVE_PRIVATE_FACT'));
    const health = JSON.parse(text('health.json'));
    assert.equal(health.requestCount, records.length);
    assert.equal(health.serverErrorCount, records.filter(r => r.statusCode >= 500).length);
    assert.equal(health.infrastructureHealth, 'UNAVAILABLE');
    const links = JSON.parse(text('requests.json'));
    const link = links.find(r => r.requestId === diagnosticRequestId);
    assert.ok(link.httpRecordIndexes.length > 0);
    assert.ok(link.auditEvents.some(r => r.id === diagnosticEventId && r.source === 'V81'));
    for (const index of link.httpRecordIndexes) assert.equal(records[index].requestId, diagnosticRequestId);
    console.log(JSON.stringify({ check: 'RUNTIME_ARCHIVE_AUDIT_HEALTH_REQUEST_CORRELATION_PRIVATE_FACTS', result: 'PASS' }));
  }
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { authorization: `Bearer ${teacherToken}` } })).status, 403);
  if (process.env.V81_RUNTIME_ARCHIVE_ACCESS === '1') {
    try {
      await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUB',permissions='[]'::jsonb WHERE user_id=${fixture.adminUserId}::uuid`;
      assert.equal((await fetch(url, { headers: { authorization: `Bearer ${adminToken}` } })).status, 403);
      await prisma.$executeRaw`UPDATE v81_admin_access SET permissions='["AUDIT_QUERY"]'::jsonb WHERE user_id=${fixture.adminUserId}::uuid`;
      assert.equal((await fetch(url, { headers: { authorization: `Bearer ${adminToken}` } })).status, 200);
    } finally {
      await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUPER',permissions='[]'::jsonb WHERE user_id=${fixture.adminUserId}::uuid`;
    }
    // Explicit synthetic expiry fixture: preserve the stored digest and session binding.
    await prisma.$executeRaw`UPDATE v81_runtime_archive_capabilities SET created_at=now()-interval '5 minutes',expires_at=now()-interval '1 minute' WHERE archive_id=${job.id}::uuid`;
    assert.equal((await fetch(url, { headers: { authorization: `Bearer ${adminToken}` } })).status, 404);
    const renewed = await request(`${path}/${job.id}/download-url`, adminToken, { expectedVersion: job.version });
    assert.equal((await fetch(new URL(renewed.downloadUrl, baseUrl), { headers: { authorization: `Bearer ${adminToken}` } })).status, 200);
    console.log(JSON.stringify({ check: 'RUNTIME_ARCHIVE_CURRENT_PERMISSION_REVOKE_RESTORE_SYNTHETIC_EXPIRY_REISSUE', result: 'PASS' }));
  }
  const cancelled = await request(`${path}/${job.id}/cancellation`, adminToken, { expectedVersion: job.version });
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal((await fetch(url, { headers: { authorization: `Bearer ${adminToken}` } })).status, 404);
  if (process.env.V81_RUNTIME_ARCHIVE_CLEANUP === '1') {
    const { S3Client, HeadObjectCommand } = createRequire(new URL('../../backend/package.json', import.meta.url))('@aws-sdk/client-s3');
    const s3 = new S3Client({ endpoint: localStorage.endpoint, region: 'us-east-1', forcePathStyle: true,
      credentials: { accessKeyId: localStorage.accessKeyId, secretAccessKey: localStorage.secretAccessKey } });
    try {
      let cleaned = [];
      for (let i = 0; i < 90; i++) {
        cleaned = await prisma.$queryRaw`SELECT * FROM v81_runtime_archive_cleanup WHERE archive_id=${job.id}::uuid`;
        if (cleaned.length) break;
        await delay(500);
      }
      assert.equal(cleaned.length, 1, 'durable cleanup completion');
      const [stored] = await prisma.$queryRaw`SELECT storage_key FROM v81_runtime_archives WHERE id=${job.id}::uuid`;
      await assert.rejects(s3.send(new HeadObjectCommand({ Bucket: localStorage.bucket, Key: stored.storage_key })),
        error => error.$metadata?.httpStatusCode === 404);
      assert.deepEqual(await request(`${path}/${job.id}`, adminToken), cancelled);
      const events = await prisma.$queryRaw`SELECT facts FROM v81_events WHERE resource_type='RUNTIME_ARCHIVE_CLEANUP' AND resource_id=${cleaned[0].id}::uuid`;
      assert.equal(events.length, 1);
      assert.deepEqual(events[0].facts, { archiveId: job.id, jobVersion: cancelled.version });
      console.log(JSON.stringify({ check: 'RUNTIME_ARCHIVE_CANCELLED_OBJECT_DELETED_TASK_HISTORY_RETAINED', result: 'PASS' }));
    } finally { s3.destroy(); }
  }
  if (process.env.V81_SYSTEM_AUDIT === '1') {
    const { probeSystemAudit } = await import('./v81-system-audit-probe.mjs');
    await probeSystemAudit({ prisma, fixture, request, adminToken, resourceType: 'RUNTIME_ARCHIVE', expectedCount: 2 });
    if (process.env.V81_RUNTIME_ARCHIVE_CLEANUP === '1')
      await probeSystemAudit({ prisma, fixture, request, adminToken, resourceType: 'RUNTIME_ARCHIVE_CLEANUP', expectedCount: 1 });
    const archivedEvents = text('audit.ndjson').trim().split('\n').map(line => JSON.parse(line));
    const claim = archivedEvents.find(e => e.targetId === job.id && e.actionType === 'RUNTIME_ARCHIVE.CLAIMED');
    assert.ok(claim);
    assert.equal(claim.actorRoleSnapshot, 'SYSTEM');
    assert.equal(claim.actorUserId, null);
    assert.equal(claim.outcome, 'SUCCEEDED');
    console.log(JSON.stringify({check:'PRIVATE_ZIP_STORED_SYSTEM_ACTOR_AND_OUTCOME',result:'PASS'}));
  }
  console.log(JSON.stringify({ check: 'RUNTIME_ARCHIVE_LIVE_WORKER_PRIVATE_ZIP_DOWNLOAD_CANCEL', result: 'PASS', recordCount: records.length }));
}
