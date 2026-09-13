// Review only the synthetic record submitted through the real student browser.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const stateFile='.local/ocr-triplatform-20260913-private.json',state=JSON.parse(fs.readFileSync(stateFile));
const base='https://www.teacher.bnbusports.cn/api/v1';
async function api(path,body,key=randomUUID()){
const r=await fetch(base+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+state.teacherToken,'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
const v=await r.json();assert.ok(r.ok,JSON.stringify({path,status:r.status,code:v.code}));return v.data;
}
const login=await fetch(base+'/auth/password-login',{method:'POST',headers:{'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({account:state.teacher.email,password:state.teacher.password}),signal:AbortSignal.timeout(20000)});
assert.equal(login.status,200);state.teacherToken=(await login.json()).data.accessToken;fs.writeFileSync(stateFile,JSON.stringify(state),{mode:0o600});
assert.equal((await api('/me')).user.organizationId,'01a096c2-20a2-706b-8c69-802f67dee12c');
const id='01a09822-6a8b-7719-93c8-e992bddfe59f',path='/exercise-records/'+id;
const record=await api(path);assert.equal(record.studentId,'01a09773-1521-768b-9f26-c362d7a5a01b');
assert.equal(record.sessionId,'01a0981d-a6d2-771a-a372-c44eb6aafcaf');
const before=await api(path+'/workflow');assert.equal(before.stage,'PENDING_TEACHER');
const body={action:'VALID',expectedVersion:before.version},key=randomUUID();
const reviewed=await api(path+'/v81-reviews',body,key);assert.equal(reviewed.stage,'VALID');assert.deepEqual(await api(path+'/v81-reviews',body,key),reviewed);
const after=await api(path+'/workflow');assert.equal(after.stage,'VALID');
const result={check:'ZETA_BROWSER_RECORD_TEACHER_HTTP_REVIEW',observedAt:new Date().toISOString(),recordId:id,beforeStage:before.stage,after,replayEqual:true,scope:'Synthetic acceptance decision via responsible teacher HTTP; not teacher browser acceptance'};
fs.writeFileSync('evidence/ocr-triplatform-20260913/zeta-browser-record-review.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
