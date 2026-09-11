import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function probeEventActor({ prisma, fixture, request, adminToken }) {
  const id = randomUUID(), resource = randomUUID();
  await prisma.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,actor_role_snapshot)
    VALUES(${id}::uuid,${fixture.organizationId}::uuid,'ACTOR_PROBE',${resource}::uuid,'RECORDED',
      ${fixture.teacherUserId}::uuid,${randomUUID()},1,'{}'::jsonb,'ADMIN')`;
  const event = await request(`/admin/audit-events/V81/${id}`, adminToken);
  assert.equal(event.actorRoleSnapshot, 'TEACHER');
  assert.equal(event.actorUserId, fixture.teacherUserId);
  assert.equal(event.outcome, null);
  await assert.rejects(prisma.$executeRaw`UPDATE v81_events SET actor_role_snapshot='ADMIN' WHERE id=${id}::uuid`);
  const unknown = randomUUID();
  await prisma.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,request_id,version,facts)
    VALUES(${unknown}::uuid,${fixture.organizationId}::uuid,'ACTOR_PROBE',${resource}::uuid,'UNKNOWN_ACTOR',${randomUUID()},2,'{}'::jsonb)`;
  assert.equal((await request(`/admin/audit-events/V81/${unknown}`, adminToken)).actorRoleSnapshot, null);
  console.log(JSON.stringify({check:'V81_EVENT_ACTOR_INSERT_SNAPSHOT_HTTP_IMMUTABILITY_UNKNOWN',result:'PASS',synthetic:true}));
}
