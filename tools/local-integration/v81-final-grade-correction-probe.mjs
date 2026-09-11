import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import Ajv from '../../backend/node_modules/ajv/dist/2020.js';
import addFormats from '../../backend/node_modules/ajv-formats/dist/index.js';
import {seedExerciseSessionStudent} from '../../backend/test/helpers/exercise-session.ts';
export async function probeFinalGradeCorrection({prisma,fixture,request,baseUrl,student,teacherToken,adminToken,token,otherTeacherTokens}) {
  const [database]=await prisma.$queryRaw`SELECT current_database() AS name`;assert.ok(['v81_runtime_test','bnbu_sports_test'].includes(database.name));
  if(database.name==='bnbu_sports_test')assert.equal(process.env.TEST_DATABASE_RESET_CONFIRMATION,'BNBU_SPORTS_EPHEMERAL_TEST_DATABASE_V1');
  if(process.env.V81_GRADE_UNARCHIVED!=='1')await prisma.semester.update({where:{id:fixture.semesterId},data:{status:'ARCHIVED'}});
  const path=`/enrollments/${student.enrollmentId}/final-grades`;
  const before=await prisma.$queryRaw`SELECT version,report::text AS canonical,report_sha256 FROM v81_settlement_report_revisions WHERE class_section_id=${fixture.teacherAActiveSectionId}::uuid ORDER BY version`;
  assert.ok(before.length);
  const history=await request(path,teacherToken);assert.ok(history.items.length);
  const body={expectedVersion:history.items[0].version,finalGrade:98,published:true,correctionReason:'Synthetic archived grade correction'};
  const post=(input,access=teacherToken,key=randomUUID(),route=path+'/corrections')=>fetch(baseUrl+route,{method:'POST',headers:{authorization:`Bearer ${access}`,'content-type':'application/json','idempotency-key':key},body:JSON.stringify(input)});
  assert.equal((await post({...body,correctionReason:' '})).status,422);
  for(const access of [adminToken,token])assert.equal((await post(body,access)).status,403);
  for(const {token:access} of otherTeacherTokens)assert.equal((await post(body,access)).status,404);
  const ungraded=await seedExerciseSessionStudent(prisma,fixture,randomUUID().slice(0,8).toUpperCase(),'ACTIVE',false);
  assert.equal((await post({...body,expectedVersion:1},teacherToken,randomUUID(),`/enrollments/${ungraded.enrollmentId}/final-grades/corrections`)).status,409);
  assert.deepEqual(await prisma.$queryRaw`SELECT version FROM v81_final_grade_revisions WHERE enrollment_id=${ungraded.enrollmentId}::uuid`,[]);
  const closedSection=await prisma.classSection.findUniqueOrThrow({where:{id:fixture.teacherAClosedSectionId}});
  const noReport=await seedExerciseSessionStudent(prisma,{...fixture,semesterId:closedSection.semesterId,teacherAActiveSectionId:fixture.teacherAClosedSectionId},randomUUID().slice(0,8).toUpperCase(),'ACTIVE',false);
  await prisma.$executeRaw`INSERT INTO v81_final_grade_revisions(enrollment_id,organization_id,version,final_grade,published,actor_id,created_at)
    VALUES(${noReport.enrollmentId}::uuid,${fixture.organizationId}::uuid,1,50,true,${fixture.teacherUserId}::uuid,now())`;
  assert.equal((await post({...body,expectedVersion:1},teacherToken,randomUUID(),`/enrollments/${noReport.enrollmentId}/final-grades/corrections`)).status,409);
  const absent=await prisma.$queryRaw`SELECT version FROM v81_final_grade_revisions WHERE enrollment_id=${noReport.enrollmentId}::uuid ORDER BY version`;
  assert.deepEqual(absent,[{version:1}]);
  const absentEvents=await prisma.$queryRaw`SELECT id FROM v81_events WHERE resource_type='FINAL_GRADE' AND resource_id=${noReport.enrollmentId}::uuid`;
  assert.equal(absentEvents.length,0);
  assert.equal((await post({...body,note:'unsupported'})).status,422);
  const key=randomUUID();
  const gradeRows=await prisma.$queryRaw`SELECT * FROM v81_final_grade_revisions WHERE enrollment_id=${student.enrollmentId}::uuid ORDER BY version`;
  const auditRows=await prisma.$queryRaw`SELECT * FROM v81_events WHERE resource_type='FINAL_GRADE' AND resource_id=${student.enrollmentId}::uuid ORDER BY version`;
  await prisma.$executeRawUnsafe("CREATE FUNCTION probe_reject_grade_report() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic grade report failure'; END; $$");
  let trigger=false;
  try {
    await prisma.$executeRawUnsafe("CREATE TRIGGER probe_reject_grade_report BEFORE INSERT ON v81_settlement_report_revisions FOR EACH ROW WHEN (NEW.kind='CORRECTION') EXECUTE FUNCTION probe_reject_grade_report()");trigger=true;
    assert.equal((await post(body,teacherToken,key)).status,500);
    assert.deepEqual(await prisma.$queryRaw`SELECT * FROM v81_final_grade_revisions WHERE enrollment_id=${student.enrollmentId}::uuid ORDER BY version`,gradeRows);
    assert.deepEqual(await prisma.$queryRaw`SELECT * FROM v81_events WHERE resource_type='FINAL_GRADE' AND resource_id=${student.enrollmentId}::uuid ORDER BY version`,auditRows);
  } finally {
    if(trigger)await prisma.$executeRawUnsafe('DROP TRIGGER probe_reject_grade_report ON v81_settlement_report_revisions');
    await prisma.$executeRawUnsafe('DROP FUNCTION probe_reject_grade_report()');
  }
  const response=await post(body,teacherToken,key);assert.equal(response.status,201);
  const result=(await response.json()).data;assert.equal(result.finalGrade,98);assert.equal(result.version,body.expectedVersion+1);
  assert.deepEqual((await (await post(body,teacherToken,key)).json()).data,result);
  assert.equal((await post(body)).status,409);
  const after=await prisma.$queryRaw`SELECT version,report::text AS canonical,report_sha256 FROM v81_settlement_report_revisions WHERE class_section_id=${fixture.teacherAActiveSectionId}::uuid ORDER BY version`;
  assert.equal(after.length,before.length+1);assert.deepEqual(after.slice(0,-1),before);
  const report=JSON.parse(after.at(-1).canonical),row=[...report.rows,...report.extras].find(row=>row.enrollmentId===student.enrollmentId);
  assert.equal(row.finalGrade.latestRevision.finalGrade,98);assert.equal(row.finalGrade.publishedRevision.finalGrade,98);
  assert.equal(report.correction.enrollmentId,student.enrollmentId);assert.equal(report.correction.gradeVersion,result.version);
  const read=await request(`/class-sections/${fixture.teacherAActiveSectionId}/settlement-reports/${after.at(-1).version}`,teacherToken);
  assert.deepEqual(read.report,report);
  const document=JSON.parse(fs.readFileSync(new URL('../../backend/src/generated/openapi.document.generated.json',import.meta.url),'utf8'));
  const ajv=new Ajv({strict:false,allErrors:true});addFormats(ajv);
  const validate=ajv.compile({$ref:'#/components/schemas/V81SettlementReportDetail',components:document.components});
  assert.ok(validate(read),JSON.stringify(validate.errors));
  console.log(JSON.stringify({check:'GRADE_REPORT_FAILURE_ROLLS_BACK_GRADE_AUDIT_SAME_KEY_RETRY_REPORT_SCHEMA',result:'PASS'}));
  const own=await request(`/student/enrollments/${student.enrollmentId}/settlement-result`,token);
  assert.doesNotMatch(JSON.stringify(own),/finalGrade|gradeVersion|correctionReason/);
  assert.equal((await post({expectedVersion:result.version,finalGrade:99,published:true},teacherToken,randomUUID(),path)).status,409);
  const responses=await Promise.all([99,100].map(finalGrade=>post({...body,expectedVersion:result.version,finalGrade})));
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
  const winner=(await responses.find(r=>r.status===201).json()).data;
  const latest=await request(path,teacherToken);assert.equal(latest.items[0].version,result.version+1);assert.equal(latest.items[0].finalGrade,winner.finalGrade);
  const count=await prisma.$queryRaw`SELECT count(*)::integer AS count FROM v81_settlement_report_revisions WHERE class_section_id=${fixture.teacherAActiveSectionId}::uuid`;
  assert.equal(count[0].count,before.length+2);
  const reportEvents=await prisma.$queryRaw`SELECT event_outcome,actor_role_snapshot FROM v81_events
    WHERE organization_id=${fixture.organizationId}::uuid AND resource_type='SETTLEMENT_REPORT'
      AND facts->>'classSectionId'=${fixture.teacherAActiveSectionId}`;
  assert.ok(reportEvents.length>0);
  assert.ok(reportEvents.every(event=>event.event_outcome==='SUCCEEDED'&&event.actor_role_snapshot==='TEACHER'));
  const correctionAudit=await prisma.$queryRaw`SELECT event_outcome,actor_role_snapshot FROM v81_events
    WHERE resource_type='FINAL_GRADE' AND resource_id=${student.enrollmentId}::uuid AND version>${body.expectedVersion}
    ORDER BY version`;
  assert.deepEqual(correctionAudit,[
    {event_outcome:'SUCCEEDED',actor_role_snapshot:'TEACHER'},
    {event_outcome:'SUCCEEDED',actor_role_snapshot:'TEACHER'},
  ]);
  console.log(JSON.stringify({check:'GRADE_CORRECTION_OTHER_TEACHER_NO_ORIGINAL_GRADE_NO_REPORT_ROLLBACK_CONCURRENT_SINGLE_WINNER',result:'PASS',archived:process.env.V81_GRADE_UNARCHIVED!=='1'}));
  console.log(JSON.stringify({check:'FINAL_GRADE_CORRECTION_ATOMIC_VERSION_REPORT_REPLAY_HISTORY_PRIVATE_GRADE',result:'PASS',archived:process.env.V81_GRADE_UNARCHIVED!=='1',fixture:'initial report and optional archived state prepared in isolated database'}));
}
