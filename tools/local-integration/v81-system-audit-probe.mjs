import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function probeSystemAudit({ prisma, fixture, request, adminToken, resourceType, expectedCount, failedCount = 0 }) {
  const rows = await prisma.$queryRaw`SELECT id,actor_id,actor_role_snapshot,is_system_actor,event_type,event_outcome,event_reason_code
    FROM v81_events WHERE organization_id=${fixture.organizationId}::uuid AND resource_type=${resourceType} AND is_system_actor=true`;
  assert.equal(rows.length, expectedCount);
  assert.ok(rows.every(r => r.actor_id === null && r.actor_role_snapshot === 'SYSTEM'));
  assert.equal(rows.filter(r => r.event_outcome === 'FAILED').length, failedCount);
  for (const row of rows) {
    const detail = await request(`/admin/audit-events/V81/${row.id}`, adminToken);
    assert.equal(detail.actorUserId, null);
    assert.equal(detail.actorRoleSnapshot, 'SYSTEM');
    assert.equal(detail.outcome, row.event_outcome);
    assert.equal(detail.reasonCode, row.event_reason_code);
    assert.deepEqual(Object.keys(detail.safeMetadata), ['version']);
  }
  const failed = await request(`/admin/audit-events?source=V81&targetType=${resourceType}&outcome=FAILED`, adminToken);
  assert.equal(failed.items.length, failedCount);
  if (resourceType === 'OCR_JOB') {
    assert.ok(rows.filter(r => r.event_type === 'EXECUTION_FAILED').every(r => r.event_reason_code === 'OCR_PROVIDER_TIMEOUT'));
    const initiators = await prisma.$queryRaw`SELECT actor_id,actor_role_snapshot,is_system_actor FROM v81_events
      WHERE organization_id=${fixture.organizationId}::uuid AND resource_type='OCR_JOB' AND event_type='QUEUED'`;
    assert.equal(initiators.length, 3);
    assert.ok(initiators.every(r => r.actor_id === fixture.teacherUserId && r.actor_role_snapshot === 'TEACHER' && !r.is_system_actor));
    const jobs = await prisma.$queryRaw`SELECT actor_id FROM v81_ocr_jobs WHERE organization_id=${fixture.organizationId}::uuid`;
    assert.ok(jobs.every(j => j.actor_id === fixture.teacherUserId));
  }
  await assert.rejects(prisma.$executeRaw`UPDATE v81_events SET is_system_actor=false WHERE id=${rows[0].id}::uuid`);
  await assert.rejects(prisma.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,is_system_actor,request_id,version,facts)
    VALUES(${randomUUID()}::uuid,${fixture.organizationId}::uuid,'SYSTEM_IMPERSONATION_PROBE',${randomUUID()}::uuid,'REJECTED',
      ${fixture.teacherUserId}::uuid,true,${randomUUID()},1,'{}'::jsonb)`);
  console.log(JSON.stringify({check:'SYSTEM_AUDIT_DATABASE_HTTP_OUTCOME_FILTER_NO_USER_IMPERSONATION',resourceType,result:'PASS',events:rows.length,failedCount}));
}
