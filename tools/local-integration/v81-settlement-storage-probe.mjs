import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';

export async function probeSettlementStorage({prisma,fixture,report}) {
  // Direct synthetic storage checks only. This is not the formal settlement command.
  const snapshot={...report,isSettlementSnapshot:true};
  const first=randomUUID(),second=randomUUID(),now=new Date();
  const insert=async ({id=randomUUID(),version=1,kind='INITIAL',previous=null,reason=null,
    organizationId=fixture.organizationId,classId=report.classSectionId,actorId=fixture.teacherUserId,
    sourceId=report.confirmedRosterId,value=snapshot,createdAt=now}={})=>prisma.$executeRaw`
    INSERT INTO v81_settlement_report_revisions(id,organization_id,class_section_id,confirmed_roster_id,actor_id,
      version,kind,previous_report_id,correction_reason,report,created_at,request_id)
    VALUES(${id}::uuid,${organizationId}::uuid,${classId}::uuid,${sourceId}::uuid,${actorId}::uuid,
      ${version},${kind},${previous}::uuid,${reason},${JSON.stringify(value)}::jsonb,${createdAt},${randomUUID()})`;
  for(const invalid of [{actorId:fixture.teacherBUserId},{organizationId:fixture.isolationOrganizationId},
    {classId:fixture.teacherBActiveSectionId},{value:{...snapshot,classSectionId:null}},
    {value:{...snapshot,rows:null}},{value:{...snapshot,isSettlementSnapshot:false}},
    {value:{...snapshot,ruleVersion:null}},{version:2,kind:'CORRECTION',previous:first,reason:'Synthetic correction'}])
    await assert.rejects(insert(invalid));
  await insert({id:first});
  const original=(await prisma.$queryRaw`SELECT * FROM v81_settlement_report_revisions WHERE id=${first}::uuid`)[0];
  assert.equal(original.report.isSettlementSnapshot,true);assert.match(original.report_sha256,/^[a-f0-9]{64}$/);
  const [canonical]=await prisma.$queryRaw`SELECT report::text AS text FROM v81_settlement_report_revisions WHERE id=${first}::uuid`;
  assert.equal(original.report_sha256,createHash('sha256').update(canonical.text).digest('hex'));
  await assert.rejects(prisma.$executeRaw`UPDATE v81_settlement_report_revisions SET report='{}'::jsonb WHERE id=${first}::uuid`);
  await assert.rejects(prisma.$executeRaw`DELETE FROM v81_settlement_report_revisions WHERE id=${first}::uuid`);
  await assert.rejects(insert());
  for(const reason of [null,'','   '])await assert.rejects(insert({version:2,kind:'CORRECTION',previous:first,reason}));
  const corrected={...snapshot,generatedAt:new Date(now.getTime()+1).toISOString()};
  const results=await Promise.allSettled([second,randomUUID()].map(id=>insert({id,version:2,kind:'CORRECTION',previous:first,
    reason:'Synthetic storage-only correction',value:corrected,createdAt:new Date(now.getTime()+1)})));
  assert.equal(results.filter(item=>item.status==='fulfilled').length,1);
  const revisions=await prisma.$queryRaw`SELECT * FROM v81_settlement_report_revisions WHERE class_section_id=${report.classSectionId}::uuid ORDER BY version`;
  assert.equal(revisions.length,2);assert.deepEqual(revisions[0],original);
  assert.equal(revisions[1].previous_report_id,first);assert.notEqual(revisions[1].report_sha256,original.report_sha256);
  await assert.rejects(insert({version:3,kind:'CORRECTION',previous:first,reason:'Wrong predecessor'}));
  console.log(JSON.stringify({check:'SETTLEMENT_REPORT_STORAGE_IMMUTABLE_SCOPE_HASH_PREDECESSOR_CONCURRENCY',result:'PASS',formalSettlement:false}));
}
