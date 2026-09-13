// Semester governance restricted to the task's synthetic organization.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const state=JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json')),checks=[];let semester;
async function api(path,token,body,status=body?201:200,key=randomUUID()){
 const r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const v=await r.json();assert.equal(r.status,status,JSON.stringify({path,status:r.status,code:v.code}));return v.data;
}
try{
 assert.equal((await api('/me',state.adminToken)).user.organizationId,state.fixture.organizationId);
 const input={academicYear:'2026-2027',termCode:'SECOND',displayName:'Synthetic semester regression 20260913',startDate:'2027-02-01',endDate:'2027-06-30'},key=randomUUID();
 await api('/admin/semesters',state.teacherToken,input,403);checks.push('TEACHER_SEMESTER_CREATE_DENIED');
 semester=await api('/admin/semesters',state.adminToken,input,201,key);assert.equal(semester.status,'UPCOMING');assert.deepEqual(await api('/admin/semesters',state.adminToken,input,201,key),semester);checks.push('UPCOMING_SEMESTER_CREATE_AND_REPLAY');
 const update={...input,endDate:'2027-07-01',expectedVersion:semester.version};
 semester=await api(`/admin/semesters/${semester.id}`,state.adminToken,update);assert.equal(semester.endDate,'2027-07-01');
 await api(`/admin/semesters/${semester.id}`,state.adminToken,update,409);checks.push('UPCOMING_SEMESTER_UPDATE_STALE_VERSION_DENIED');
 const check=await api(`/admin/semesters/${semester.id}/switch-check?limit=1`,state.adminToken);assert.equal(check.ready,false);assert.ok(check.checks.some(c=>c.code==='TARGET_START_DATE'&&c.status==='BLOCKED'));assert.ok(check.totalCourseCount>1);
 await api(`/admin/semesters/${semester.id}/switch`,state.adminToken,{expectedVersion:semester.version,currentSemesterId:check.current.id,currentSemesterVersion:check.current.version},409);checks.push('SEMESTER_SWITCH_FUTURE_DATE_AND_UNSETTLED_WORK_BLOCKED');
 assert.equal((await api('/semesters/current',state.adminToken)).id,state.fixture.semesterId);checks.push('CURRENT_SEMESTER_PRESERVED');
}finally{const r={check:'CLOUD_SEMESTER_GOVERNANCE',observedAt:new Date().toISOString(),organizationId:state.fixture.organizationId,semesterId:semester?.id,checks,allChecksCompleted:checks.includes('CURRENT_SEMESTER_PRESERVED')};fs.writeFileSync('evidence/ocr-triplatform-20260913/cloud-semester-governance.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));}
