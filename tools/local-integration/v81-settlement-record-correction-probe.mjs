import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';

export async function probeCorrectionRollback({prisma,baseUrl,teacherToken,path,input,key,recordId}) {
  const [database]=await prisma.$queryRaw`SELECT current_database() AS name`;
  assert.equal(database.name,'v81_runtime_test');
  const snapshot=async()=>{
    const [row]=await prisma.$queryRaw`SELECT w.stage,w.version,
      (SELECT count(*) FROM review_records WHERE record_id=${recordId}::uuid) AS reviews,
      (SELECT count(*) FROM notifications WHERE target_id=${recordId}::uuid) AS notifications,
      (SELECT count(*) FROM v81_events WHERE resource_id=${recordId}::uuid) AS events,
      (SELECT credited_minutes FROM v81_credit_projections WHERE record_id=${recordId}::uuid) AS credit
      FROM v81_record_workflows w WHERE record_id=${recordId}::uuid`;
    return row;
  };
  const before=await snapshot();
  await prisma.$executeRawUnsafe("CREATE FUNCTION probe_reject_settlement_correction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic settlement storage failure'; END; $$");
  let triggerCreated=false;
  try {
    await prisma.$executeRawUnsafe("CREATE TRIGGER probe_reject_settlement_correction BEFORE INSERT ON v81_settlement_report_revisions FOR EACH ROW WHEN (NEW.kind='CORRECTION') EXECUTE FUNCTION probe_reject_settlement_correction()");
    triggerCreated=true;
    const response=await fetch(baseUrl+path,{method:'POST',headers:{authorization:`Bearer ${teacherToken}`,
      'content-type':'application/json','idempotency-key':key},body:JSON.stringify(input)});
    assert.equal(response.status,500);
    assert.deepEqual(await snapshot(),before);
  } finally {
    if(triggerCreated)await prisma.$executeRawUnsafe('DROP TRIGGER probe_reject_settlement_correction ON v81_settlement_report_revisions');
    await prisma.$executeRawUnsafe('DROP FUNCTION probe_reject_settlement_correction()');
  }
  console.log(JSON.stringify({check:'SETTLEMENT_REPORT_STORAGE_FAILURE_ROLLS_BACK_REVIEW_CREDIT_EVENTS_NOTIFICATIONS',result:'PASS',failure:'deliberately injected in isolated runtime test database; trigger removed'}));
}

export async function seedCorrectionReport({prisma,fixture,report}) {
  // Synthetic storage fixture only: this does not prove the initial settlement command.
  const id=randomUUID(),now=new Date();
  await prisma.$executeRaw`INSERT INTO v81_settlement_report_revisions
    (id,organization_id,class_section_id,confirmed_roster_id,actor_id,version,kind,report,created_at,request_id)
    VALUES(${id}::uuid,${fixture.organizationId}::uuid,${report.classSectionId}::uuid,${report.confirmedRosterId}::uuid,
      ${fixture.teacherUserId}::uuid,1,'INITIAL',${JSON.stringify({...report,isSettlementSnapshot:true})}::jsonb,${now},${randomUUID()})`;
  const [stored]=await prisma.$queryRaw`SELECT report::text AS canonical,report_sha256 FROM v81_settlement_report_revisions WHERE id=${id}::uuid`;
  return {id,...stored};
}

export async function verifyCorrectionReport({prisma,fixture,original,recordId,request,adminToken}) {
  const rows=await prisma.$queryRaw`SELECT *,report::text AS canonical FROM v81_settlement_report_revisions
    WHERE class_section_id=${fixture.teacherAActiveSectionId}::uuid ORDER BY version`;
  assert.equal(rows.length,2);
  assert.equal(rows[0].id,original.id);assert.equal(rows[0].canonical,original.canonical);
  assert.equal(rows[0].report_sha256,original.report_sha256);
  const revision=rows[1];assert.equal(revision.kind,'CORRECTION');assert.equal(revision.previous_report_id,original.id);
  assert.equal(revision.report.correction.recordId,recordId);
  assert.equal(revision.report.rows[0].progress.creditedSeconds,0);
  assert.equal(revision.report.rows[0].progress.invalidActualSeconds,3600);
  assert.equal(rows[0].report.rows[0].progress.creditedSeconds,3600);
  assert.equal(createHash('sha256').update(revision.canonical).digest('hex'),revision.report_sha256);
  const [event]=await prisma.$queryRaw`SELECT * FROM v81_events WHERE id=${revision.report.correction.eventId}::uuid`;
  assert.equal(event.event_type,'FACT_CORRECTED');assert.equal(event.resource_id,recordId);
  assert.equal(event.request_id,revision.request_id);assert.equal(event.actor_id,fixture.teacherUserId);
  const reportEvents=await prisma.$queryRaw`SELECT facts FROM v81_events WHERE resource_id=${revision.id}::uuid AND resource_type='SETTLEMENT_REPORT'`;
  assert.equal(reportEvents.length,1);assert.equal(reportEvents[0].facts.reportSha256,revision.report_sha256);
  const summary=await request(`/admin/class-sections/${fixture.teacherAActiveSectionId}/settlement-summary`,adminToken);
  assert.equal(summary.settled,true);assert.equal(summary.reportVersion,2);
  assert.equal(summary.settledAt,revision.created_at.toISOString());
  assert.doesNotMatch(JSON.stringify(summary),/studentNumber|fullName|finalGrade|actorId|correctionReason|recordId|"rows"/);
  console.log(JSON.stringify({check:'ADMIN_SETTLEMENT_SUMMARY_FOLLOWS_CORRECTION_VERSION_WITHOUT_PRIVATE_FACTS',result:'PASS'}));
  console.log(JSON.stringify({check:'SETTLED_RECORD_CORRECTION_HTTP_REPLAY_APPENDS_REPORT_PRESERVES_ORIGINAL_AUDIT_AND_RECOMPUTED_CREDIT',result:'PASS',initialReport:'synthetic storage fixture; not formal settlement acceptance'}));
}
