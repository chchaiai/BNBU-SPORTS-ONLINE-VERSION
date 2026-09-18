import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

export async function ordinaryHistorySummary(tx,organizationId,cutoff){
 const [summary]=await tx.$queryRaw`SELECT count(*)::int AS records,
   count(*) FILTER(WHERE w.stage='VALID')::int AS valid,
   count(*) FILTER(WHERE w.stage IS DISTINCT FROM 'VALID')::int AS not_valid,
   count(*) FILTER(WHERE p.record_id IS NULL)::int AS missing_credit_projection,
   coalesce(sum(p.credited_minutes),0)::int AS credited_minutes,
   count(*) FILTER(WHERE p.credited_minutes>0)::int AS credited_records,
   count(*) FILTER(WHERE p.reason='BELOW_THRESHOLD')::int AS below_threshold,
   count(*) FILTER(WHERE p.reason='CREDIT_LIMIT')::int AS credit_limit
 FROM exercise_records r LEFT JOIN v81_record_workflows w ON w.record_id=r.id
 LEFT JOIN v81_credit_projections p ON p.record_id=r.id
 WHERE r.organization_id=${organizationId}::uuid AND r.submitted_at IS NOT NULL AND r.submitted_at<=${cutoff}
 AND NOT EXISTS(SELECT 1 FROM v81_history_session_sources h WHERE h.session_id=r.session_id)`;
 return summary;
}
async function makeupFingerprint(tx,organizationId){
 const [state]=await tx.$queryRaw`SELECT count(*)::int AS records,
 md5(coalesce(string_agg(concat_ws('|',r.id::text,r.status,r.version::text,w::text),'~' ORDER BY r.id),'')) AS fingerprint
 FROM exercise_records r JOIN v81_history_session_sources h ON h.session_id=r.session_id
 LEFT JOIN v81_record_workflows w ON w.record_id=r.id WHERE r.organization_id=${organizationId}::uuid`;
 const [history]=await tx.$queryRaw`SELECT count(*)::int AS reviews,md5(coalesce(string_agg(rr::text,'~' ORDER BY rr.id),'')) AS fingerprint
 FROM review_records rr JOIN exercise_records r ON r.id=rr.record_id
 JOIN v81_history_session_sources h ON h.session_id=r.session_id WHERE r.organization_id=${organizationId}::uuid`;
 return {state,history};
}
async function rulesFingerprint(tx,organizationId){
 const [rules]=await tx.$queryRaw`SELECT md5(coalesce(string_agg(s::text,'~' ORDER BY s.record_id),'')) AS fingerprint
 FROM v81_record_rule_snapshots s JOIN exercise_records r ON r.id=s.record_id WHERE r.organization_id=${organizationId}::uuid`;
 return rules.fingerprint;
}

/** One caller-owned transaction; all changes and the completion marker commit together. */
export async function applyOrdinaryHistory(tx,{organizationId,cutoff,expectedRecords,batchId,recomputeCredits,appendEvent}){
 await tx.$queryRaw`SELECT id FROM organizations WHERE id=${organizationId}::uuid FOR NO KEY UPDATE`;
 const completed=await tx.$queryRaw`SELECT id FROM v81_events WHERE organization_id=${organizationId}::uuid
   AND event_type='ORDINARY_HISTORY_VALID_APPLIED' AND request_id=${batchId}`;
 if(completed.length)return {alreadyApplied:true,after:await ordinaryHistorySummary(tx,organizationId,cutoff)};
 const before=await ordinaryHistorySummary(tx,organizationId,cutoff);
 assert.equal(before.records,expectedRecords,'Reviewed cohort size changed');
 const makeupBefore=await makeupFingerprint(tx,organizationId),rulesBefore=await rulesFingerprint(tx,organizationId);
 const records=await tx.$queryRaw`SELECT r.id,r.enrollment_id,r.status,r.version AS record_version,w.version AS workflow_version,w.stage,
   EXISTS(SELECT 1 FROM v81_settlement_report_revisions x WHERE x.class_section_id=r.class_section_id) AS settled,
   EXISTS(SELECT 1 FROM v81_record_rule_snapshots s WHERE s.record_id=r.id) AS has_snapshot,
   EXISTS(SELECT 1 FROM v81_course_rules cr WHERE cr.class_section_id=r.class_section_id AND cr.published_at IS NOT NULL) AS published
 FROM exercise_records r LEFT JOIN v81_record_workflows w ON w.record_id=r.id
 WHERE r.organization_id=${organizationId}::uuid AND r.submitted_at IS NOT NULL AND r.submitted_at<=${cutoff}
 AND NOT EXISTS(SELECT 1 FROM v81_history_session_sources h WHERE h.session_id=r.session_id)
 ORDER BY r.id FOR UPDATE OF r`;
 assert.equal(records.length,expectedRecords);
 assert.ok(records.every(row=>!row.settled&&row.has_snapshot&&row.published&&row.workflow_version&&['SUBMITTED','REVIEWED'].includes(row.status)), 'Cohort prerequisites changed');
 const now=new Date();let changed=0;
 for(const record of records){
   const previous=await tx.reviewRecord.findFirstOrThrow({where:{recordId:record.id},orderBy:{reviewVersion:'desc'}});
   if(record.stage==='VALID'&&previous.result==='VALID'&&record.status==='REVIEWED')continue;
   await tx.reviewRecord.create({data:{id:randomUUID(),organizationId,recordId:record.id,reviewVersion:previous.reviewVersion+1,
     previousReviewId:previous.id,result:'VALID',publicComment:'历史普通打卡统一设为有效；学时按原课程规则计算。',reviewedAt:now,createdAt:now}});
   const updated=await tx.$executeRaw`UPDATE v81_record_workflows SET stage='VALID',public_reason=NULL,public_comment=NULL,
     teacher_round_started_at=NULL,version=version+1,updated_at=${now}
     WHERE record_id=${record.id}::uuid AND version=${record.workflow_version}`;
   assert.equal(updated,1);
   await tx.exerciseRecord.update({where:{id:record.id,version:record.record_version},data:{status:'REVIEWED',version:{increment:1},updatedAt:now}});
   await appendEvent(tx,{organizationId,resourceType:'RECORD_REVIEW',resourceId:record.id,eventType:'ORDINARY_HISTORY_MARKED_VALID',
     requestId:batchId,version:record.workflow_version+1,occurredAt:now,outcome:'SUCCEEDED',
     facts:{cutoff:cutoff.toISOString(),previousStage:record.stage,previousReviewId:previous.id,previousReviewResult:previous.result,countingRules:'UNCHANGED',makeupExcluded:true}});
   changed++;
 }
 const enrollments=[...new Set(records.map(row=>row.enrollment_id))].sort();
 for(const enrollmentId of enrollments)await recomputeCredits(tx,enrollmentId,now);
 const after=await ordinaryHistorySummary(tx,organizationId,cutoff);
 assert.equal(after.not_valid,0);assert.equal(after.missing_credit_projection,0);
 const makeupAfter=await makeupFingerprint(tx,organizationId),rulesAfter=await rulesFingerprint(tx,organizationId);
 assert.deepEqual(makeupAfter,makeupBefore,'Makeup records or reviews changed');assert.equal(rulesAfter,rulesBefore,'Counting rule snapshots changed');
 const result={alreadyApplied:false,cutoff:cutoff.toISOString(),changed,enrollments:enrollments.length,before,after,
   addedCreditedMinutes:after.credited_minutes-before.credited_minutes,makeupRecordsAndReviewsUnchanged:true,ruleSnapshotsUnchanged:true};
 await appendEvent(tx,{organizationId,resourceType:'RECORD_HISTORY_POLICY',resourceId:organizationId,eventType:'ORDINARY_HISTORY_VALID_APPLIED',
   requestId:batchId,version:1,occurredAt:now,outcome:'SUCCEEDED',facts:result});
 return result;
}
