import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {V81SettlementCheckService} from '../../backend/src/modules/v8/v81-settlement-check.ts';

export async function probeSettlementFacts({prisma,fixture,student,outside}) {
  const classId=fixture.teacherAActiveSectionId;
  const rule=(await prisma.$queryRaw`SELECT settlement_planned_at FROM v81_course_rules WHERE class_section_id=${classId}::uuid`)[0];
  const at=rule.settlement_planned_at;
  const service=new V81SettlementCheckService(prisma,{now:()=>at});
  const beforeService=new V81SettlementCheckService(prisma,{now:()=>new Date(at.getTime()-1)});
  const get=(checks,code)=>checks.checks.find(check=>check.code===code);
  const rollback=new Error('ROLLBACK_SYNTHETIC_SETTLEMENT_FACTS');
  try {
    await prisma.$transaction(async tx=>{
      const before=await beforeService.checkInTransaction(tx,fixture.organizationId,classId);
      assert.equal(get(before,'SETTLEMENT_SCHEDULE').status,'BLOCKED');
      assert.deepEqual(get(before,'RAW_PHYSICAL_RESULTS'),{code:'RAW_PHYSICAL_RESULTS',status:'UNAVAILABLE',count:1});
      await tx.$executeRaw`INSERT INTO v81_physical_result_revisions
        (enrollment_id,organization_id,version,run_type,elapsed_seconds,tested_on,actor_id,request_id,created_at)
        VALUES(${outside.enrollmentId}::uuid,${fixture.organizationId}::uuid,1,'1000m',270,'2026-09-07'::date,
          ${fixture.teacherUserId}::uuid,${randomUUID()},${new Date()})`;
      const complete=await service.checkInTransaction(tx,fixture.organizationId,classId);
      assert.deepEqual(get(complete,'RAW_PHYSICAL_RESULTS'),{code:'RAW_PHYSICAL_RESULTS',status:'CLEAR',count:0});
      assert.equal(get(complete,'SETTLEMENT_SCHEDULE').status,'CLEAR');
      assert.equal(get(complete,'ROSTER_IDENTITY_AMBIGUITY').status,'CLEAR');
      assert.equal(get(complete,'ROSTER_REGISTRATION_INCOMPLETE').status,'CLEAR');
      assert.equal(complete.ready,false); // An actual composite confirmation is still required.
      if(process.env.V81_SETTLEMENT_COMMAND==='1') {
        const {probeSettlementCommand}=await import('./v81-settlement-command-probe.mjs');
        await probeSettlementCommand({tx,prisma,fixture,outside,checks:service,at});
      }
      await tx.user.update({where:{id:student.userId},data:{emailVerifiedAt:null}});
      const unverified=await service.checkInTransaction(tx,fixture.organizationId,classId);
      assert.deepEqual(get(unverified,'ROSTER_REGISTRATION_INCOMPLETE'),{code:'ROSTER_REGISTRATION_INCOMPLETE',status:'UNAVAILABLE',count:1});
      assert.equal(get(unverified,'RAW_PHYSICAL_RESULTS').count,null);
      await tx.studentProfile.update({where:{id:student.studentId},data:{fullName:'Synthetic identity conflict'}});
      const conflict=await service.checkInTransaction(tx,fixture.organizationId,classId);
      assert.deepEqual(get(conflict,'ROSTER_IDENTITY_AMBIGUITY'),{code:'ROSTER_IDENTITY_AMBIGUITY',status:'BLOCKED',count:1});
      throw rollback;
    },{timeout:30000,isolationLevel:'Serializable'});
    assert.fail('Synthetic transaction must roll back');
  } catch(error) { if(error!==rollback)throw error; }
  const persisted=await prisma.$queryRaw`SELECT count(*) AS count FROM v81_physical_result_revisions WHERE enrollment_id=${outside.enrollmentId}::uuid`;
  assert.equal(persisted[0].count,0n);
  if(process.env.V81_SETTLEMENT_COMMAND==='1') {
    const reports=await prisma.$queryRaw`SELECT count(*) AS count FROM v81_settlement_report_revisions WHERE class_section_id=${classId}::uuid`;
    assert.equal(reports[0].count,0n);
  }
  console.log(JSON.stringify({check:'SETTLEMENT_REAL_FACTS_PHYSICAL_COUNTS_IDENTITY_PENDING_POLICY_SERVER_TIME_BOUNDARY',result:'PASS',clock:'injected for synthetic transaction test',fixtureChanges:'rolled back'}));
}
