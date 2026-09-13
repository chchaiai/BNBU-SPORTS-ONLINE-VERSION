// Bounded public HTTPS regression using this task's isolated synthetic sessions.
import fs from 'node:fs';import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const state=JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json'));
const base='https://www.teacher.bnbusports.cn/api/v1';
const beta=JSON.parse(fs.readFileSync('.local/ocr-beta-course.json')),session=JSON.parse(fs.readFileSync('.local/ocr-beta-private.json'));const section=beta.sectionId,enrollment=beta.enrollmentId;
async function auth(path,body){const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const v=await r.json();assert.equal(r.status,200,JSON.stringify({path,status:r.status,code:v.code}));return v.data;}
session.session=await auth('/auth/refresh',{refreshToken:session.session.refreshToken});fs.writeFileSync('.local/ocr-beta-private.json',JSON.stringify(session),{mode:0o600});for(const role of ['teacher','admin'])state[role+'Token']=(await auth('/auth/password-login',{account:state[role].email,password:state[role].password})).accessToken;fs.writeFileSync('.local/ocr-triplatform-20260913-private.json',JSON.stringify(state),{mode:0o600});
const tokens={student:session.session.accessToken,teacher:state.teacherToken,admin:state.adminToken};
const checks=[];
const groups={
 student:['/me','/organizations/current','/semesters/current','/student-progress','/exercise-sessions/active','/exercise-records','/student/proof-todos','/student/help-articles','/notifications','/me/preferences','/sport-catalog','/activity-conversion-rules',`/enrollments/${enrollment}`,`/enrollments/${enrollment}/roster-status`,`/student/enrollments/${enrollment}/physical-result`,`/student/enrollments/${enrollment}/settlement-result`,`/enrollments/${enrollment}/makeup-windows`],
 teacher:['/me','/teacher/semesters','/class-sections','/teacher-progress','/exemption-application-details','/activity-certification-applications',...['v81-rules','history-settings','settlement-check','settlement-reports','composite-roster','ocr-batches','roster-basis','makeup-windows'].map(p=>`/class-sections/${section}/${p}`)],
 admin:['/me','/health/admin','/admin/subadmins','/admin/teacher-accounts','/admin/semesters','/admin/course-directory','/admin/feedback','/admin/help-articles','/admin/endurance-tables','/admin/audit-events','/admin/exercise-goal','/admin/review-services/ocr','/admin/review-services/ocr/revisions','/rule-templates',...['roster-summary','physical-summary','settlement-summary'].map(p=>`/admin/class-sections/${section}/${p}`)]
};
for(const [role,paths] of Object.entries(groups))for(const path of paths){
 const r=await fetch(base+path,{headers:{authorization:`Bearer ${tokens[role]}`},signal:AbortSignal.timeout(15000)});
 const value=await r.json();
 // These two legacy routes are explicitly default-denied by operation policies.
 const expected=path==='/sport-catalog'?503:path==='/activity-conversion-rules'?403:200;
 checks.push({role,path,status:r.status,expected,requestId:value.requestId??value.meta?.requestId,pass:r.status===expected});
 if(r.status===401)break;
}
const batch=JSON.parse(fs.readFileSync('evidence/ocr-triplatform-20260913/cloud-ocr-http.json')).batches[0].id;
for(const path of [`/ocr-batches/${batch}`,'/admin/review-services/ocr','/admin/subadmins']){
 const r=await fetch(base+path,{headers:{authorization:`Bearer ${tokens.student}`},signal:AbortSignal.timeout(15000)});
 const value=await r.json();checks.push({role:'student',path,status:r.status,expected:403,requestId:value.requestId??value.meta?.requestId,pass:r.status===403});
}
const result={check:'CLOUD_POST_INVITE_BRAND_THREE_ROLE_READ_REGRESSION',productionRelease:'public-note-locale-20260913',observedAt:new Date().toISOString(),organizationId:state.fixture.organizationId,scope:'Read routes and student role denials; not full mutation or UI acceptance',passed:checks.filter(c=>c.pass).length,total:checks.length,checks};
fs.writeFileSync('evidence/ocr-triplatform-20260913/post-backend-rollback-read-regression.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({check:result.check,passed:result.passed,total:result.total,failures:checks.filter(c=>!c.pass)}));assert.ok(checks.every(c=>c.pass),'Review recorded failures');
