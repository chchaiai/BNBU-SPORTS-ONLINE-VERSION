import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import Ajv from '../../backend/node_modules/ajv/dist/2020.js';
import addFormats from '../../backend/node_modules/ajv-formats/dist/index.js';
import {approvedRuleTemplate} from '../../backend/src/modules/v8/domain/rule-template.ts';

export async function seedHistoricalSettlementRules({prisma,fixture}) {
  const [database]=await prisma.$queryRaw`SELECT current_database() AS name`;
  assert.ok(['v81_runtime_test','bnbu_sports_test'].includes(database.name));
  if(database.name==='bnbu_sports_test') assert.equal(process.env.TEST_DATABASE_RESET_CONFIRMATION,'BNBU_SPORTS_EPHEMERAL_TEST_DATABASE_V1');
  const templateId=randomUUID(),published=new Date('2026-08-01T00:00:00Z');
  await prisma.$executeRaw`INSERT INTO v81_rule_templates(id,organization_id,version,display_name,rules,actor_id,request_id,published_at)
    VALUES(${templateId}::uuid,${fixture.organizationId}::uuid,1,'Synthetic historical settlement template',
      ${JSON.stringify(approvedRuleTemplate)}::jsonb,${fixture.adminUserId}::uuid,${randomUUID()},${published})`;
  await prisma.$executeRaw`INSERT INTO v81_course_rules(class_section_id,organization_id,minimum_minutes,weekly_limit,
    course_target,general_target,regular_deadline,closing_deadline,settlement_planned_at,published_at,version,template_id)
    VALUES(${fixture.teacherAActiveSectionId}::uuid,${fixture.organizationId}::uuid,30,4,600,600,
      '2026-08-31T15:59:59Z'::timestamptz,'2026-09-07T15:59:59Z'::timestamptz,'2026-09-07T16:00:00Z'::timestamptz,
      ${published},1,${templateId}::uuid)`;
}

export async function probeSettlementHttp({prisma,fixture,request,baseUrl,teacherToken,adminToken,otherTeacherTokens,outside}) {
  const course=`/class-sections/${fixture.teacherAActiveSectionId}`,path=course+'/settlement-reports';
  const post=(body,token=teacherToken,key=randomUUID())=>fetch(baseUrl+path,{method:'POST',headers:{authorization:`Bearer ${token}`,
    'content-type':'application/json','idempotency-key':key},body:JSON.stringify(body)});
  const missing=await request(course+'/settlement-preview',teacherToken);
  const summaryPath=`/admin/class-sections/${fixture.teacherAActiveSectionId}/settlement-summary`;
  const unsettled=await request(summaryPath,adminToken);
  assert.equal(unsettled.settled,false);assert.equal(unsettled.reportVersion,null);assert.equal(unsettled.settledAt,null);
  assert.equal(unsettled.ready,false);
  assert.equal(missing.canConfirm,false);assert.equal(missing.expectedVersion,0);
  assert.equal(missing.checks.find(c=>c.code==='RAW_PHYSICAL_RESULTS').count,1);
  const oldInput={expectedVersion:0,previewFingerprint:missing.previewFingerprint};
  assert.equal((await post(oldInput)).status,409);
  await prisma.studentProfile.update({where:{id:outside.studentId},data:{gender:'MALE'}});
  await request(`/enrollments/${outside.enrollmentId}/physical-results`,teacherToken,
    {expectedVersion:0,runType:'1000m',elapsedSeconds:271,testedOn:'2026-09-07'});
  const ready=await request(course+'/settlement-preview',teacherToken);
  assert.equal(ready.canConfirm,true);assert.notEqual(ready.previewFingerprint,missing.previewFingerprint);
  const document=JSON.parse(fs.readFileSync(new URL('../../backend/src/generated/openapi.document.generated.json',import.meta.url),'utf8'));
  const ajv=new Ajv({strict:false,allErrors:true});addFormats(ajv);
  const previewSchema=document.paths['/class-sections/{classSectionId}/settlement-preview'].get.responses['200'].content['application/json'].schema.properties.data;
  const validatePreview=ajv.compile({...previewSchema,components:document.components});
  assert.ok(validatePreview(ready),JSON.stringify(validatePreview.errors));
  assert.equal((await post(oldInput)).status,409);
  const input={expectedVersion:0,previewFingerprint:ready.previewFingerprint};
  assert.equal((await post({...input,report:{}})).status,422);
  assert.equal((await post(input,adminToken)).status,403);
  for(const {token} of otherTeacherTokens)assert.equal((await post(input,token)).status,404);
  const keys=[randomUUID(),randomUUID()];
  const responses=await Promise.all(keys.map(key=>post(input,teacherToken,key)));
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
  const winner=responses.findIndex(r=>r.status===201),result=(await responses[winner].json()).data;
  assert.deepEqual((await (await post(input,teacherToken,keys[winner])).json()).data,result);
  assert.equal((await post({...input,previewFingerprint:'0'.repeat(64)},teacherToken,keys[winner])).status,409);
  assert.equal(result.version,1);assert.equal(result.report.isSettlementSnapshot,true);
  const validateReport=ajv.compile({$ref:'#/components/schemas/V81SettlementReportDetail',components:document.components});
  assert.ok(validateReport(result),JSON.stringify(validateReport.errors));
  assert.deepEqual(await request(path+'/1',teacherToken),result);
  const saved=await request(path,teacherToken);assert.equal(saved.items.length,1);
  assert.equal((await request(course+'/settlement-preview',teacherToken)).canConfirm,false);
  const check=await request(course+'/settlement-check',teacherToken);
  assert.deepEqual(check.checks.find(c=>c.code==='CONFIRMED_COMPOSITE_ROSTER'),{code:'CONFIRMED_COMPOSITE_ROSTER',status:'CLEAR',count:0});
  assert.equal(check.ready,true);
  const summary=await request(summaryPath,adminToken);
  assert.equal(summary.settled,true);assert.equal(summary.reportVersion,1);assert.equal(summary.ready,true);
  assert.deepEqual(summary.checks,check.checks);
  assert.doesNotMatch(JSON.stringify(summary),/studentId|enrollmentId|studentNumber|fullName|finalGrade|actorId|source_rows|"rows"/);
  const summarySchema=document.paths['/admin/class-sections/{classSectionId}/settlement-summary'].get.responses['200'].content['application/json'].schema.properties.data;
  const validateSummary=ajv.compile({...summarySchema,components:document.components});assert.ok(validateSummary(summary),JSON.stringify(validateSummary.errors));
  assert.equal((await fetch(baseUrl+summaryPath,{headers:{authorization:`Bearer ${teacherToken}`}})).status,403);
  assert.equal((await fetch(baseUrl+`/admin/class-sections/${fixture.teacherCSectionId}/settlement-summary`,{headers:{authorization:`Bearer ${adminToken}`}})).status,404);
  try {
    for(const permissions of [[],['SEMESTER_MANAGE'],['COURSE_VIEW']]) {
      await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUB',permissions=${JSON.stringify(permissions)}::jsonb WHERE user_id=${fixture.adminUserId}::uuid`;
      assert.equal((await fetch(baseUrl+summaryPath,{headers:{authorization:`Bearer ${adminToken}`}})).status,permissions.includes('COURSE_VIEW')?200:403);
    }
  } finally {await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUPER',permissions='[]'::jsonb WHERE user_id=${fixture.adminUserId}::uuid`;}
  console.log(JSON.stringify({check:'ADMIN_COURSE_SETTLEMENT_AGGREGATE_REAL_REPORT_SCHEMA_PRIVACY_SCOPE_GRANT_REVOCATION',result:'PASS'}));
  const reports=await prisma.$queryRaw`SELECT id FROM v81_settlement_report_revisions WHERE class_section_id=${fixture.teacherAActiveSectionId}::uuid`;
  assert.deepEqual(reports,[{id:result.id}]);
  const events=await prisma.$queryRaw`SELECT id FROM v81_events WHERE resource_type='SETTLEMENT_REPORT' AND resource_id=${result.id}::uuid`;
  assert.equal(events.length,1);
  const blockedWrite=await fetch(baseUrl+`/enrollments/${outside.enrollmentId}/physical-results`,{method:'POST',
    headers:{authorization:`Bearer ${teacherToken}`,'content-type':'application/json','idempotency-key':randomUUID()},
    body:JSON.stringify({expectedVersion:1,runType:'1000m',elapsedSeconds:272,testedOn:'2026-09-07'})});
  assert.equal(blockedWrite.status,409);
  const exported=await request(path+'/1/export',teacherToken);assert.ok(exported.fileName.endsWith('-v1.xlsx'));
  const target=await request('/admin/semesters',adminToken,{academicYear:'2027-2028',termCode:'FIRST',
    displayName:'Synthetic switch check target',startDate:'2027-08-01',endDate:'2028-01-31'});
  const total=await prisma.classSection.count({where:{organizationId:fixture.organizationId,semesterId:fixture.semesterId}});
  for(const suffix of ['?limit=1','?limit=1&after=ffffffff-ffff-4fff-8fff-ffffffffffff']) {
    const aggregate=await request(`/admin/semesters/${target.id}/switch-check`+suffix,adminToken);
    assert.equal(aggregate.ready,false);
    assert.deepEqual(aggregate.checks.find(c=>c.code==='FORMAL_COURSE_SETTLEMENT'),
      {code:'FORMAL_COURSE_SETTLEMENT',status:total>1?'BLOCKED':'CLEAR',count:total-1});
    assert.equal(aggregate.checks.find(c=>c.code==='COURSE_UNFINISHED_WORK').count,total-1);
    if(suffix.includes('after='))assert.deepEqual(aggregate.courses,[]);
  }
  console.log(JSON.stringify({check:'SEMESTER_PREFLIGHT_COUNTS_FORMAL_REPORT_AND_OFF_PAGE_UNFINISHED_COURSES',result:'PASS'}));
  if(process.env.V81_SETTLED_SEMESTER_SWITCH==='1') {
    assert.equal(total,1);
    const arrived=await request('/admin/semesters',adminToken,{academicYear:'2026-2027',termCode:'SECOND',
      displayName:'Synthetic arrived next semester',startDate:'2026-09-08',endDate:'2027-06-30'});
    const before=await request(`/admin/semesters/${arrived.id}/switch-check`,adminToken);
    assert.equal(before.ready,true);assert.equal(before.courses[0].ready,true);
    const members=await prisma.enrollment.findMany({where:{classSectionId:fixture.teacherAActiveSectionId},orderBy:{id:'asc'}});
    const key=randomUUID(),body={expectedVersion:before.target.version,currentSemesterId:before.current.id,currentSemesterVersion:before.current.version};
    if(process.env.V81_SEMESTER_MAINTENANCE==='1') {
      const snapshot=await prisma.semester.findMany({where:{organizationId:fixture.organizationId},orderBy:{id:'asc'}});
      const policy=await prisma.systemPolicy.findUniqueOrThrow({where:{organizationId:fixture.organizationId}});
      const maintenance=await request('/system-mode/changes',adminToken,{mode:'MAINTENANCE',expectedVersion:policy.version,
        reason:'Synthetic semester maintenance boundary',titleZh:'本地测试维护',titleEn:'Local test maintenance',
        bodyZh:'合成维护测试',bodyEn:'Synthetic maintenance test',estimatedRecoveryAt:new Date(Date.now()+3600000).toISOString()});
      try {
        const blocked=await fetch(baseUrl+`/admin/semesters/${arrived.id}/switch`,{method:'POST',headers:{
          authorization:`Bearer ${adminToken}`,'content-type':'application/json','idempotency-key':key},body:JSON.stringify(body)});
        assert.equal(blocked.status,503);
        assert.deepEqual(await prisma.semester.findMany({where:{organizationId:fixture.organizationId},orderBy:{id:'asc'}}),snapshot);
      } finally {
        await request('/system-mode/changes',adminToken,{mode:'NORMAL',expectedVersion:maintenance.policyVersion,
          reason:'Synthetic semester maintenance finished'});
      }
      console.log(JSON.stringify({check:'SETTLED_SEMESTER_SWITCH_MAINTENANCE_DENIED_NO_STATUS_CHANGE_RECOVERY',result:'PASS'}));
    }
    const switched=process.env.V81_SEMESTER_CLIENT==='1'
      ? await (await import('./v81-semester-client-probe.mjs')).switchThroughPortal({baseUrl,adminToken,targetId:arrived.id,key})
      : await request(`/admin/semesters/${arrived.id}/switch`,adminToken,body,key);
    assert.equal(switched.archived.id,fixture.semesterId);assert.equal(switched.current.id,arrived.id);
    assert.deepEqual(await request(`/admin/semesters/${arrived.id}/switch`,adminToken,body,key),switched);
    assert.equal((await prisma.semester.findUniqueOrThrow({where:{id:fixture.semesterId}})).status,'ARCHIVED');
    assert.deepEqual(await request(path+'/1',teacherToken),result);
    const archivedSummary=await request(summaryPath,adminToken);
    assert.equal(archivedSummary.settled,true);assert.equal(archivedSummary.reportVersion,summary.reportVersion);
    assert.equal(archivedSummary.settledAt,summary.settledAt);assert.deepEqual(archivedSummary.checks,summary.checks);
    assert.equal((await request(path+'/1/export',teacherToken)).fileName,exported.fileName);
    assert.deepEqual(await prisma.enrollment.findMany({where:{classSectionId:fixture.teacherAActiveSectionId},orderBy:{id:'asc'}}),members);
    assert.equal(await prisma.semester.count({where:{organizationId:fixture.organizationId,status:'CURRENT'}}),1);
    console.log(JSON.stringify({check:'ONE_COURSE_FORMAL_HTTP_SETTLEMENT_SWITCH_ARCHIVE_REPLAY_REPORT_EXPORT_HISTORY_PRESERVED',result:'PASS',fixture:'one-course semester prepared before business facts; historical published rules; report and switch use real HTTP'}));
    if(process.env.V81_PHYSICAL_CORRECTION==='1') {
      const {probePhysicalCorrection}=await import('./v81-physical-correction-probe.mjs');
      await probePhysicalCorrection({prisma,fixture,request,baseUrl,outside,teacherToken,adminToken,otherTeacherTokens});
    }
  }
  console.log(JSON.stringify({check:'SETTLEMENT_REAL_HTTP_MISSING_FACTS_STALE_PREVIEW_SCOPE_CONCURRENT_SINGLE_REPORT_REPLAY_READ_EXPORT',result:'PASS',clock:'real server clock',fixture:'historical rules seeded only in isolated test database'}));
}
