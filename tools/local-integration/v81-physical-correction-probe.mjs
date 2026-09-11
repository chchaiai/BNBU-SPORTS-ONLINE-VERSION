import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import fs from 'node:fs';import Ajv from '../../backend/node_modules/ajv/dist/2020.js';import addFormats from '../../backend/node_modules/ajv-formats/dist/index.js';
import {seedExerciseSessionStudent} from '../../backend/test/helpers/exercise-session.ts';
import {setTimeout as delay} from 'node:timers/promises';
export async function probePhysicalCorrection({prisma,fixture,request,baseUrl,outside,teacherToken,adminToken,otherTeacherTokens,readMailboxJson=async url=>(await fetch(url)).json()}) {
  const path=`/enrollments/${outside.enrollmentId}/physical-results`,reportPath=`/class-sections/${fixture.teacherAActiveSectionId}/settlement-reports`;
  const history=await request(path,teacherToken);assert.equal(history.items[0].elapsedSeconds,271);
  const before=await request(reportPath+'/1',teacherToken);
  const body={runType:'1000m',elapsedSeconds:272,testedOn:'2026-09-07',expectedVersion:1,correctionReason:'Synthetic archived raw result correction'};
  const post=(data,access=teacherToken,key=randomUUID(),route=path+'/corrections')=>fetch(baseUrl+route,{method:'POST',headers:{authorization:`Bearer ${access}`,'content-type':'application/json','idempotency-key':key},body:JSON.stringify(data)});
  assert.equal((await post({...body,correctionReason:' '})).status,422);
  assert.equal((await post({...body,runType:'800m'})).status,422);
  assert.equal((await post(body,adminToken)).status,403);
  for(const {token}of otherTeacherTokens)assert.equal((await post(body,token)).status,404);
  const notifications=await prisma.notification.count({where:{targetId:outside.enrollmentId,notificationType:'RAW_ENDURANCE_RESULT'}});
  const key=randomUUID();
  const [database]=await prisma.$queryRaw`SELECT current_database() AS name`;assert.ok(['v81_runtime_test','bnbu_sports_test'].includes(database.name));
  if(database.name==='bnbu_sports_test')assert.equal(process.env.TEST_DATABASE_RESET_CONFIRMATION,'BNBU_SPORTS_EPHEMERAL_TEST_DATABASE_V1');
  const missing=await seedExerciseSessionStudent(prisma,fixture,randomUUID().slice(0,8).toUpperCase(),'ACTIVE',false);
  await prisma.studentProfile.update({where:{id:missing.studentId},data:{gender:'MALE'}});
  assert.equal((await post(body,teacherToken,randomUUID(),`/enrollments/${missing.enrollmentId}/physical-results/corrections`)).status,409);
  assert.deepEqual(await prisma.$queryRaw`SELECT version FROM v81_physical_result_revisions WHERE enrollment_id=${missing.enrollmentId}::uuid`,[]);
  assert.equal(await prisma.notification.count({where:{targetId:missing.enrollmentId,notificationType:'RAW_ENDURANCE_RESULT'}}),0);
  assert.deepEqual(await prisma.$queryRaw`SELECT id FROM v81_events WHERE resource_type='PHYSICAL_RESULT' AND resource_id=${missing.enrollmentId}::uuid`,[]);
  const noReportCourse=await prisma.classSection.findUniqueOrThrow({where:{id:fixture.teacherAClosedSectionId},select:{semesterId:true}});
  const noReport=await seedExerciseSessionStudent(prisma,{...fixture,semesterId:noReportCourse.semesterId,teacherAActiveSectionId:fixture.teacherAClosedSectionId},randomUUID().slice(0,8).toUpperCase(),'ACTIVE',false);
  await prisma.studentProfile.update({where:{id:noReport.studentId},data:{gender:'MALE'}});
  await prisma.$executeRaw`INSERT INTO v81_physical_result_revisions(enrollment_id,organization_id,version,run_type,elapsed_seconds,tested_on,actor_id,request_id,created_at)
    VALUES(${noReport.enrollmentId}::uuid,${fixture.organizationId}::uuid,1,'1000m',270,'2026-09-07',${fixture.teacherUserId}::uuid,${randomUUID()},now())`;
  const noReportRows=await prisma.$queryRaw`SELECT * FROM v81_physical_result_revisions WHERE enrollment_id=${noReport.enrollmentId}::uuid`;
  assert.equal((await post(body,teacherToken,randomUUID(),`/enrollments/${noReport.enrollmentId}/physical-results/corrections`)).status,409);
  assert.deepEqual(await prisma.$queryRaw`SELECT * FROM v81_physical_result_revisions WHERE enrollment_id=${noReport.enrollmentId}::uuid`,noReportRows);
  assert.equal(await prisma.notification.count({where:{targetId:noReport.enrollmentId,notificationType:'RAW_ENDURANCE_RESULT'}}),0);
  assert.deepEqual(await prisma.$queryRaw`SELECT id FROM v81_events WHERE resource_type='PHYSICAL_RESULT' AND resource_id=${noReport.enrollmentId}::uuid`,[]);
  const events=await prisma.$queryRaw`SELECT id FROM v81_events WHERE resource_type='PHYSICAL_RESULT' AND resource_id=${outside.enrollmentId}::uuid ORDER BY version`;
  await prisma.$executeRawUnsafe("CREATE FUNCTION probe_reject_physical_report() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic physical report failure'; END; $$");
  let trigger=false;
  try {
    await prisma.$executeRawUnsafe("CREATE TRIGGER probe_reject_physical_report BEFORE INSERT ON v81_settlement_report_revisions FOR EACH ROW WHEN (NEW.kind='CORRECTION') EXECUTE FUNCTION probe_reject_physical_report()");trigger=true;
    assert.equal((await post(body,teacherToken,key)).status,500);
    assert.deepEqual(await request(path,teacherToken),history);
    assert.equal(await prisma.notification.count({where:{targetId:outside.enrollmentId,notificationType:'RAW_ENDURANCE_RESULT'}}),notifications);
    assert.deepEqual(await prisma.$queryRaw`SELECT id FROM v81_events WHERE resource_type='PHYSICAL_RESULT' AND resource_id=${outside.enrollmentId}::uuid ORDER BY version`,events);
  } finally {
    if(trigger)await prisma.$executeRawUnsafe('DROP TRIGGER probe_reject_physical_report ON v81_settlement_report_revisions');
    await prisma.$executeRawUnsafe('DROP FUNCTION probe_reject_physical_report()');
  }
  const response=await post(body,teacherToken,key);assert.equal(response.status,201);
  const result=(await response.json()).data;assert.equal(result.version,2);assert.equal(result.elapsedSeconds,272);
  assert.deepEqual((await (await post(body,teacherToken,key)).json()).data,result);
  assert.equal((await post(body)).status,409);
  assert.equal(await prisma.notification.count({where:{targetId:outside.enrollmentId,notificationType:'RAW_ENDURANCE_RESULT'}}),notifications+1);
  assert.deepEqual(await request(reportPath+'/1',teacherToken),before);
  const report=await request(reportPath+'/2',teacherToken);
  assert.equal(report.report.correction.physicalVersion,2);
  assert.equal([...report.report.rows,...report.report.extras].find(row=>row.enrollmentId===outside.enrollmentId).physical.result.elapsedSeconds,272);
  const doc=JSON.parse(fs.readFileSync(new URL('../../backend/src/generated/openapi.document.generated.json',import.meta.url),'utf8'));
  const ajv=new Ajv({strict:false,allErrors:true});addFormats(ajv);const valid=ajv.compile({$ref:'#/components/schemas/V81SettlementReportDetail',components:doc.components});
  assert.ok(valid(report),JSON.stringify(valid.errors));
  assert.deepEqual((await request(path,teacherToken)).items.map(row=>row.elapsedSeconds),[272,271]);
  assert.equal((await post({runType:'1000m',elapsedSeconds:273,testedOn:'2026-09-07',expectedVersion:2},teacherToken,randomUUID(),path)).status,409);
  const responses=await Promise.all([273,274].map(elapsedSeconds=>post({...body,expectedVersion:2,elapsedSeconds})));
  assert.deepEqual(responses.map(response=>response.status).sort(),[201,409]);
  const winner=(await responses.find(response=>response.status===201).json()).data;
  assert.equal(winner.version,3);
  assert.deepEqual((await request(path,teacherToken)).items.map(row=>row.elapsedSeconds),[winner.elapsedSeconds,272,271]);
  assert.equal(await prisma.notification.count({where:{targetId:outside.enrollmentId,notificationType:'RAW_ENDURANCE_RESULT'}}),notifications+2);
  assert.deepEqual(await request(reportPath+'/1',teacherToken),before);
  assert.deepEqual(await request(reportPath+'/2',teacherToken),report);
  const latestReport=await request(reportPath+'/3',teacherToken);
  assert.equal(latestReport.report.correction.physicalVersion,3);
  assert.equal([...latestReport.report.rows,...latestReport.report.extras].find(row=>row.enrollmentId===outside.enrollmentId).physical.result.elapsedSeconds,winner.elapsedSeconds);
  assert.ok(valid(latestReport),JSON.stringify(valid.errors));
  const organization=await prisma.organization.findUniqueOrThrow({where:{id:fixture.organizationId}});
  const priorMessages=await readMailboxJson('http://mailpit:8025/api/v1/messages?limit=50');
  const priorIds=new Set((priorMessages.messages??[]).map(item=>item.ID));
  const challenge=await request('/auth/student-sign-in-codes',null,{organizationCode:organization.organizationCode,account:outside.email,channel:'EMAIL',locale:'en'});
  let code;
  for(let attempt=0;attempt<30&&!code;attempt++) {
    const messages=await readMailboxJson('http://mailpit:8025/api/v1/messages?limit=50');
    const message=messages.messages?.find(item=>!priorIds.has(item.ID)&&JSON.stringify(item.To??[]).toLowerCase().includes(outside.email));
    if(message) {
      const detail=await readMailboxJson(`http://mailpit:8025/api/v1/message/${encodeURIComponent(message.ID)}`);
      code=String(detail.Text??'').match(/(?:code is|验证码是)\s*(\d{4,10})/u)?.[1];
    }
    if(!code)await delay(500);
  }
  assert.ok(code,'Student sign-in email not received');
  const login=await request('/auth/student-sign-in-codes/verify',null,{challengeId:challenge.challengeId,code,deviceId:randomUUID()});
  const own=await request(`/student/enrollments/${outside.enrollmentId}/physical-result`,login.accessToken);
  assert.deepEqual(own,{status:'RECORDED',result:{version:3,runType:'1000m',elapsedSeconds:winner.elapsedSeconds,testedOn:'2026-09-07'}});
  const ownReport=await request(`/student/enrollments/${outside.enrollmentId}/settlement-result`,login.accessToken);
  assert.equal(ownReport.available,true);assert.equal(ownReport.reportVersion,3);
  assert.equal(ownReport.result.physical.result.elapsedSeconds,winner.elapsedSeconds);
  assert.doesNotMatch(JSON.stringify(ownReport),/finalGrade|correctionReason|physicalVersion|actorId/);
  const denied=await fetch(baseUrl+`/student/enrollments/${missing.enrollmentId}/physical-result`,{headers:{authorization:`Bearer ${login.accessToken}`}});
  assert.equal(denied.status,404);
  assert.equal((await post({...body,expectedVersion:3},login.accessToken)).status,403);
  console.log(JSON.stringify({check:'PHYSICAL_CORRECTION_NO_REPORT_ROLLBACK_STUDENT_LATEST_SCOPE_PRIVACY',result:'PASS'}));
  console.log(JSON.stringify({check:'PHYSICAL_CORRECTION_MISSING_ORIGINAL_NO_SIDE_EFFECT_CONCURRENT_SINGLE_WINNER_HISTORY',result:'PASS'}));
  console.log(JSON.stringify({check:'PHYSICAL_REPORT_FAILURE_ROLLS_BACK_RESULT_NOTIFICATION_AUDIT_SAME_KEY_RECOVERY',result:'PASS'}));
  console.log(JSON.stringify({check:'FORMAL_SETTLEMENT_ARCHIVE_PHYSICAL_CORRECTION_REPORT_HISTORY_NOTIFICATION_REPLAY_SCOPE_SCHEMA',result:'PASS'}));
}
