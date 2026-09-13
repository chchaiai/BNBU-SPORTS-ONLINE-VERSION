// Publish rules only for the existing synthetic Zeta course, via authorized role APIs.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const file='.local/ocr-triplatform-20260913-private.json',staff=JSON.parse(fs.readFileSync(file));
async function api(path,token,body,method=body?'POST':'GET'){
 const r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+path,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),'content-type':'application/json','idempotency-key':randomUUID()},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 const v=await r.json();assert.ok(r.ok,JSON.stringify({path,status:r.status,code:v.code}));return v.data;
}
for(const role of ['teacher','admin'])staff[role+'Token']=(await api('/auth/password-login',null,{account:staff[role].email,password:staff[role].password})).accessToken;
fs.writeFileSync(file,JSON.stringify(staff),{mode:0o600});
const t=staff.teacherToken,a=staff.adminToken,id='01a0976a-b1f1-72af-b08c-55b2b17576c2',path='/class-sections/'+id;
assert.equal((await api('/me',t)).user.organizationId,'01a096c2-20a2-706b-8c69-802f67dee12c');
let course=await api(path,t);assert.equal(course.displayName,'Synthetic UTC public enrollment');
course=await api(path,t,{checkInWindowMode:'AVAILABLE',checkInStartDate:'2026-09-01',checkInEndDate:'2027-01-23',dailyStartTime:'00:00',dailyEndTime:'23:59',submissionDeadlineAt:'2027-01-23T15:59:59Z',expectedVersion:course.version},'PATCH');
const templates=await api('/rule-templates',a),goal=await api('/admin/exercise-goal',a);
assert.ok(goal.totalTargetMinutes>=600);
const input={templateId:templates.items[0].id,minimumMinutes:1,weeklyLimit:3,courseTarget:goal.totalTargetMinutes-600,generalTarget:600,regularDeadline:'2027-01-23T00:00:00Z',closingDeadline:'2027-01-30T00:00:00Z',settlementPlannedAt:'2027-01-30T01:00:00Z',publish:true,globalTargetVersion:goal.version,expectedVersion:0};
await api(path+'/v81-rules',t,input);
const rules=await api(path+'/v81-rules',t);
assert.equal(rules.course_target,input.courseTarget);assert.equal(rules.general_target,600);assert.ok(rules.published_at);
const result={check:'ZETA_EXERCISE_COURSE_READY',observedAt:new Date().toISOString(),sectionId:id,courseVersion:course.version,rules,scope:'Synthetic course fixture configuration; no real course or global rule changed'};
fs.writeFileSync('evidence/ocr-triplatform-20260913/zeta-course-ready.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
