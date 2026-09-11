import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { RuntimeLogSource, safeHttpRuntimeRecord } from '../../backend/src/common/logging/runtime-log-source.ts';
import { OrganizationTimeService } from '../../backend/src/common/time/organization-time.service.ts';

export async function probeRuntimeLogSource({ prisma, fixture, baseUrl, teacherToken, otherTeacherTokens, sourceDirectory }) {
  assert.ok(sourceDirectory);
  const organization=await prisma.organization.findUniqueOrThrow({where:{id:fixture.organizationId}});
  const day=new OrganizationTimeService().businessDate(new Date(),organization.timezone);
  const source=new RuntimeLogSource({runtimeLogDirectory:sourceDirectory});
  const requestIds=[randomUUID(),randomUUID()];
  for (const [i,token] of [teacherToken,otherTeacherTokens.find(t=>t.role==='OTHER_ORGANIZATION').token].entries()) {
    const response=await fetch(baseUrl+'/auth/account-security?private=SYNTHETIC_SENSITIVE_MARKER',{
      headers:{authorization:`Bearer ${token}`,'x-request-id':requestIds[i]}});
    assert.equal(response.status,200);
  }
  let result;
  for (let i=0;i<30;i++) {
    try { result=await source.read(fixture.organizationId,day,day,organization.timezone); }
    catch (error) { if (!['RUNTIME_LOG_SOURCE_UNAVAILABLE','RUNTIME_LOG_SOURCE_INCOMPLETE'].includes(error.message)) throw error; }
    if (result?.records.some(r=>r.requestId===requestIds[0])) break;
    await delay(200);
  }
  assert.ok(result?.records.some(r=>r.requestId===requestIds[0]));
  assert.ok(!result.records.some(r=>r.requestId===requestIds[1]));
  assert.ok(result.records.every(r=>r.organizationId===fixture.organizationId));
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC_SENSITIVE_MARKER'));
  assert.equal(result.sourceType,'STRUCTURED_HTTP_RUNTIME');
  assert.equal(result.coverage,'AVAILABLE_SCOPED_HTTP_RECORDS_ONLY');
  const sanitized=safeHttpRuntimeRecord({msg:'http_request_completed',organizationId:fixture.organizationId,time:new Date().toISOString(),
    requestId:randomUUID(),operationId:'getCurrentSemester',method:'GET',statusCode:200,durationMs:1,outcome:'SUCCEEDED',
    path:'/SYNTHETIC_SENSITIVE_MARKER',authorization:'SYNTHETIC_SENSITIVE_MARKER',password:'SYNTHETIC_SENSITIVE_MARKER',
    payload:{name:'SYNTHETIC_SENSITIVE_MARKER'},actorUserId:'SYNTHETIC_SENSITIVE_MARKER',userAgent:'SYNTHETIC_SENSITIVE_MARKER'});
  assert.ok(!JSON.stringify(sanitized).includes('SYNTHETIC_SENSITIVE_MARKER'));
  assert.equal(sanitized.route,'/api/v1/semesters/current');
  assert.equal(safeHttpRuntimeRecord({msg:'startup',payload:'SYNTHETIC_SENSITIVE_MARKER'}),null);
  await assert.rejects(new RuntimeLogSource({runtimeLogDirectory:null}).read(fixture.organizationId,day,day,organization.timezone),/SOURCE_UNAVAILABLE/u);
  await assert.rejects(source.read(fixture.organizationId,'2026-02-30',day,organization.timezone),/DATE_INVALID/u);
  console.log(JSON.stringify({check:'LIVE_RUNTIME_LOG_SOURCE_ORGANIZATION_DATE_WHITELIST_PRIVATE_FIELDS_UNAVAILABLE',result:'PASS',
    realApplicationStdout:true,coverage:'SCOPED_HTTP_ONLY',runtimeZipNotImplemented:true}));
}
