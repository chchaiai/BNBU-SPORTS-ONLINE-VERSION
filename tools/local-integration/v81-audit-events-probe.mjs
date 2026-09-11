import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function probeAuditEvents({ prisma, fixture, request, baseUrl, adminToken, teacherToken }) {
  const group = randomUUID(), ids = Array.from({ length: 6 }, () => randomUUID());
  const times = ['2026-09-07T15:59:59.999Z','2026-09-07T16:00:00Z','2026-09-08T10:00:00Z','2026-09-08T15:59:59.999Z','2026-09-08T16:00:00Z'];
  for (let i = 0; i < times.length; i++) await prisma.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at)
    VALUES(${ids[i]}::uuid,${fixture.organizationId}::uuid,'UNRECOGNIZED_ACTION',${fixture.teacherAActiveSectionId}::uuid,'PERSISTED_NEW',
      ${fixture.teacherUserId}::uuid,${group},${i + 1},${JSON.stringify({ password:'SYNTHETIC_SENSITIVE_MARKER', finalGrade:123, rawSnapshot:{name:'SYNTHETIC_SENSITIVE_MARKER'} })}::jsonb,${new Date(times[i])})`;
  await prisma.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at)
    VALUES(${ids[5]}::uuid,${fixture.isolationOrganizationId}::uuid,'UNRECOGNIZED_ACTION',${fixture.teacherCSectionId}::uuid,'PERSISTED_NEW',
      ${fixture.teacherCUserId}::uuid,${group},1,'{}'::jsonb,${new Date(times[2])})`;
  const path='/admin/audit-events', filters=`?limit=2&requestId=${group}&action=UNRECOGNIZED_ACTION.PERSISTED_NEW&startDate=2026-09-08&endDate=2026-09-08`;
  const first=await request(path+filters,adminToken);
  assert.equal(first.timezone,'Asia/Shanghai'); assert.deepEqual(first.items.map(e=>e.id),[ids[3],ids[2]]); assert.ok(first.nextCursor);
  const second=await request(path+filters+'&cursor='+encodeURIComponent(first.nextCursor),adminToken);
  assert.deepEqual(second.items.map(e=>e.id),[ids[1]]); assert.equal(second.nextCursor,null);
  const all=[...first.items,...second.items];
  assert.ok(all.every(e=>e.source==='V81' && e.outcome===null && e.actorRoleSnapshot==='TEACHER' && e.reasonCode===null));
  const snapshots = await prisma.$queryRaw`SELECT actor_role_snapshot FROM v81_events WHERE request_id=${group}`;
  assert.equal(snapshots.length, 6); assert.ok(snapshots.every(row => row.actor_role_snapshot === 'TEACHER'));
  assert.ok(all.every(e=>Object.keys(e.safeMetadata).join(',')==='version'));
  assert.ok(!JSON.stringify(all).includes('SYNTHETIC_SENSITIVE_MARKER'));
  const combined=await request(path+filters+`&actorUserId=${fixture.teacherUserId}&targetType=UNRECOGNIZED_ACTION&targetId=${fixture.teacherAActiveSectionId}`,adminToken);
  assert.deepEqual(combined.items,first.items);
  assert.deepEqual((await request(path+filters+'&outcome=SUCCEEDED',adminToken)).items,[]);
  assert.deepEqual(await request(`${path}/V81/${ids[2]}`,adminToken),first.items[1]);
  const original=await prisma.auditLog.findFirstOrThrow({where:{organizationId:fixture.organizationId}});
  const foundation=await request(`${path}/FOUNDATION/${original.id}`,adminToken);
  assert.equal(foundation.outcome,original.outcome); assert.equal(foundation.actorRoleSnapshot,original.actorRoleSnapshot);
  for (const [route,token,status] of [[path,teacherToken,403],[`${path}/V81/${ids[5]}`,adminToken,404],
    [path+'?limit=51',adminToken,422],[path+'?startDate=2026-02-30',adminToken,422],
    [path+filters+'&source=FOUNDATION&cursor='+encodeURIComponent(first.nextCursor),adminToken,422]])
    assert.equal((await fetch(baseUrl+route,{headers:{authorization:`Bearer ${token}`}})).status,status);
  try {
    for (const permissions of [[],['COURSE_VIEW'],['AUDIT_QUERY']]) {
      await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUB',permissions=${JSON.stringify(permissions)}::jsonb WHERE user_id=${fixture.adminUserId}::uuid`;
      assert.equal((await fetch(baseUrl+path+filters,{headers:{authorization:`Bearer ${adminToken}`}})).status,permissions.includes('AUDIT_QUERY')?200:403);
    }
  } finally { await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUPER',permissions='[]'::jsonb WHERE user_id=${fixture.adminUserId}::uuid`; }
  assert.equal(Number((await prisma.$queryRaw`SELECT count(*) AS n FROM v81_events WHERE request_id=${group}`)[0].n),6);
  console.log(JSON.stringify({check:'UNIFIED_AUDIT_DATE_RANGE_FILTERS_PAGINATION_SOURCE_ROLE_UNKNOWN_METADATA_PRIVACY_PERMISSION',result:'PASS',syntheticEvents:true}));
}
