import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {V81CompositeRosterService} from '../../backend/src/modules/v8/v81-composite-roster.ts';
import {V81SettlementCheckService} from '../../backend/src/modules/v8/v81-settlement-check.ts';
import {requireUnsettledCourse} from '../../backend/src/modules/v8/v81-settlement-write-guard.ts';
import {V81PhysicalResultsService} from '../../backend/src/modules/v8/v81-physical-results.ts';
import {V81FinalGradesService} from '../../backend/src/modules/v8/v81-final-grades.ts';
import {V81SettlementReportsService,settlementPreviewFingerprint} from '../../backend/src/modules/v8/v81-settlement-reports.ts';

export async function probeSettlementCommand({tx,prisma,fixture,outside,checks,at}) {
  const clock={now:()=>at}, principal={role:'TEACHER',organizationId:fixture.organizationId,userId:fixture.teacherUserId};
  const composite=new V81CompositeRosterService(prisma,clock);
  const service=new V81SettlementReportsService(composite,checks,clock,{next:randomUUID});
  const classId=fixture.teacherAActiveSectionId;
  const preview=await composite.previewInTransaction(tx,principal,classId);
  const input={expectedVersion:0,previewFingerprint:settlementPreviewFingerprint(preview)};
  await requireUnsettledCourse(tx,fixture.organizationId,classId);
  assert.equal(settlementPreviewFingerprint({...preview,generatedAt:'2030-01-01T00:00:00Z'}),input.previewFingerprint);
  const earlyClock={now:()=>new Date(at.getTime()-1)};
  const early=new V81SettlementReportsService(composite,new V81SettlementCheckService(prisma,earlyClock),earlyClock,{next:randomUUID});
  await assert.rejects(early.confirmInTransaction(tx,principal,classId,input,randomUUID()),{code:'CONFLICT_STATE_TRANSITION'});
  await assert.rejects(service.confirmInTransaction(tx,{...principal,role:'ADMIN'},classId,input,randomUUID()),{code:'PERMISSION_RESOURCE_SCOPE_DENIED'});
  await assert.rejects(service.confirmInTransaction(tx,{...principal,userId:fixture.teacherBUserId},classId,input,randomUUID()),{code:'PERMISSION_RESOURCE_NOT_FOUND'});
  await tx.$executeRaw`INSERT INTO v81_physical_result_revisions
    (enrollment_id,organization_id,version,run_type,elapsed_seconds,tested_on,actor_id,request_id,created_at)
    VALUES(${outside.enrollmentId}::uuid,${fixture.organizationId}::uuid,2,'1000m',271,'2026-09-07'::date,
      ${fixture.teacherUserId}::uuid,${randomUUID()},${new Date()})`;
  await assert.rejects(service.confirmInTransaction(tx,principal,classId,input,randomUUID()),{code:'CONFLICT_VERSION_MISMATCH'});
  const current=await composite.previewInTransaction(tx,principal,classId);
  const accepted={...input,previewFingerprint:settlementPreviewFingerprint(current)};
  const result=await service.confirmInTransaction(tx,principal,classId,accepted,randomUUID());
  assert.equal(result.version,1);assert.equal(result.report.isSettlementSnapshot,true);
  assert.equal(result.report.extras.find(row=>row.enrollmentId===outside.enrollmentId).physical.result.version,2);
  const [stored]=await tx.$queryRaw`SELECT report::text AS canonical,report_sha256 FROM v81_settlement_report_revisions WHERE id=${result.id}::uuid`;
  assert.equal(createHash('sha256').update(stored.canonical).digest('hex'),result.reportSha256);
  const events=await tx.$queryRaw`SELECT facts FROM v81_events WHERE resource_id=${result.id}::uuid AND resource_type='SETTLEMENT_REPORT'`;
  assert.equal(events.length,1);assert.equal(events[0].facts.reportSha256,stored.report_sha256);
  const blocked={code:'CONFLICT_STATE_TRANSITION',details:{reason:'SETTLED_FACT_CORRECTION_REQUIRED'}};
  await assert.rejects(requireUnsettledCourse(tx,fixture.organizationId,classId),blocked);
  await requireUnsettledCourse(tx,fixture.organizationId,fixture.teacherBActiveSectionId);
  // Invoke real write services in the same rollback transaction; receipt transport is tested separately.
  const idempotency={execute:async(_input,work)=>work(tx),success:value=>value};
  const physical=new V81PhysicalResultsService(prisma,idempotency,clock,{next:randomUUID});
  const grade=new V81FinalGradesService(prisma,idempotency,clock,{next:randomUUID});
  await assert.rejects(physical.appendInTransaction(tx,principal,outside.enrollmentId,
    {expectedVersion:2,runType:'1000m',elapsedSeconds:272,testedOn:'2026-09-07'},randomUUID()),blocked);
  await assert.rejects(grade.write(principal,outside.enrollmentId,
    {expectedVersion:0,finalGrade:90,published:true},randomUUID(),randomUUID()),blocked);
  const [unchanged]=await tx.$queryRaw`SELECT
    (SELECT max(version) FROM v81_physical_result_revisions WHERE enrollment_id=${outside.enrollmentId}::uuid) AS physical,
    (SELECT count(*) FROM v81_final_grade_revisions WHERE enrollment_id=${outside.enrollmentId}::uuid) AS grades`;
  assert.equal(unchanged.physical,2);assert.equal(unchanged.grades,0n);
  console.log(JSON.stringify({check:'SETTLED_COURSE_PHYSICAL_FINAL_GRADE_WRITES_REJECTED_NO_FACTS_ADDED_OTHER_COURSE_UNAFFECTED',result:'PASS'}));
  const {probeSettledMembership}=await import('./v81-settlement-membership-probe.mjs');
  await probeSettledMembership({tx,prisma,principal,classId,outside,clock,confirmedRosterId:current.confirmedRosterId});
  await assert.rejects(service.confirmInTransaction(tx,principal,classId,accepted,randomUUID()),{code:'CONFLICT_VERSION_MISMATCH'});
  console.log(JSON.stringify({check:'SETTLEMENT_INTERNAL_COMMAND_TIME_SCOPE_STALE_PREVIEW_SNAPSHOT_HASH_AUDIT_DUPLICATE',result:'PASS',boundary:'internal transaction only; HTTP not exposed'}));
}
