// Bounded public HTTPS regression using this task's isolated synthetic sessions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const state=JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json'));
const base='https://www.teacher.bnbusports.cn/api/v1';
const section=state.fixture.teacherAActiveSectionId,enrollment=state.student.enrollmentId;
const tokens={student:state.studentSession.accessToken,teacher:state.teacherToken,admin:state.adminToken};
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
const result={check:'CLOUD_THREE_ROLE_READ_REGRESSION',observedAt:new Date().toISOString(),organizationId:state.fixture.organizationId,scope:'Read routes and student role denials; not full mutation or UI acceptance',passed:checks.filter(c=>c.pass).length,total:checks.length,checks};
fs.writeFileSync('evidence/ocr-triplatform-20260913/cloud-read-regression.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));assert.ok(checks.every(c=>c.pass),'Review recorded failures');
