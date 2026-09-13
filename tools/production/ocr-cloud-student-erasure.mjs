// Final erasure of TEST ALPHA only; preserves TEST BETA and all real organizations.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const s=JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json')),checks=[];
async function api(path,token,body,expected=body?201:200,key=randomUUID()){
 const r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const v=await r.json();assert.equal(r.status,expected,JSON.stringify({path,status:r.status,code:v.code}));return v.data;
}
try{
 const me=await api('/me',s.studentSession.accessToken),profile=me.studentProfile;
 assert.equal(me.user.organizationId,s.fixture.organizationId);assert.equal(profile.id,s.student.studentId);assert.equal(profile.studentNumber,'9900000001');assert.equal(profile.fullName,'TEST ALPHA');
 const path=`/admin/students/${profile.id}/delete`,body={expectedVersion:profile.version,confirmationStudentNumber:profile.studentNumber,reason:'Synthetic full-cloud erasure acceptance after preserved-history verification'};
 await api(path,s.teacherToken,body,403);checks.push('TEACHER_ERASURE_DENIED');
 const key=randomUUID(),deleted=await api(path,s.adminToken,body,201,key);assert.equal(deleted.deleted,true);assert.deepEqual(await api(path,s.adminToken,body,201,key),deleted);checks.push('ADMIN_STUDENT_ERASURE_AND_REPLAY');
 await api(`/students/${profile.id}`,s.adminToken,undefined,404);checks.push('STUDENT_PROFILE_NO_LONGER_READABLE');
}finally{const result={check:'CLOUD_SYNTHETIC_STUDENT_ERASURE',observedAt:new Date().toISOString(),organizationId:s.fixture.organizationId,studentId:s.student.studentId,checks,allChecksCompleted:checks.includes('STUDENT_PROFILE_NO_LONGER_READABLE')};fs.writeFileSync('evidence/ocr-triplatform-20260913/cloud-student-erasure.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
