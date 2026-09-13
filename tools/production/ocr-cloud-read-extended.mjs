// Extended bounded read regression; staff auth is renewed, deleted student auth is not reused.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';
const privatePath='.local/ocr-triplatform-20260913-private.json',s=JSON.parse(fs.readFileSync(privatePath));
const base='https://www.teacher.bnbusports.cn/api/v1',checks=[];
async function login(role){const r=await fetch(base+'/auth/password-login',{method:'POST',headers:{'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({account:s[role].email,password:s[role].password}),signal:AbortSignal.timeout(20000)});const v=await r.json();assert.equal(r.status,200);assert.equal(v.data.user.organizationId,s.fixture.organizationId);s[role+'Token']=v.data.accessToken;fs.writeFileSync(privatePath,JSON.stringify(s),{mode:0o600});checks.push({method:'POST',path:'/auth/password-login',role,status:r.status,pass:true});}
async function get(path,role='teacher',expected=200){const r=await fetch(base+path,{headers:role?{authorization:`Bearer ${s[role+'Token']}`}:{},signal:AbortSignal.timeout(20000)});const bytes=Buffer.from(await r.arrayBuffer());let value;try{value=JSON.parse(bytes.toString());}catch{}
 checks.push({method:'GET',path,role:role||'anonymous',status:r.status,expected,pass:r.status===expected,requestId:value?.requestId??value?.meta?.requestId,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});return value?.data;}
try{
 await login('teacher');await login('admin');
 for(const p of ['/health/live','/health/ready','/system-mode','/system-mode/announcement','/app-release-policy?platform=ANDROID','/help-articles'])await get(p,null);
 for(const p of ['/students','/courses','/enrollments','/roster-alignment-results','/exemption-applications','/feedback','/auth/account-security'])await get(p);
 for(const p of ['/audit-logs','/system-mode/history'])await get(p,'admin');
 for(const p of ['/exports','/location-privacy-policy'])await get(p,'teacher',503);
 for(const p of ['/student-scores',`/class-sections/${s.fixture.teacherAClosedSectionId}/score-rules`])await get(p,'teacher',403);
 await get(`/teachers/${s.fixture.teacherProfileId}`);await get(`/teachers/${s.fixture.teacherProfileId}/class-sections`);await get(`/courses/${s.fixture.activeCourseId}`);
 const section=s.fixture.teacherAActiveSectionId;
 for(const suffix of ['', '/progress-target','/roster-imports','/physical-imports','/roster-basis/snapshots','/settlement-preview','/composite-roster/export'])await get(`/class-sections/${section}${suffix}`);
 await get(`/admin/review-services/manual-mode/${section}`,'admin');
 const templates=await get('/rule-templates','admin');if(templates?.items?.[0])await get(`/rule-templates/${templates.items[0].id}`,'admin');
 const events=await get('/admin/audit-events?limit=1','admin');if(events?.items?.[0]){const e=events.items[0];if(e.source&&e.id)await get(`/admin/audit-events/${e.source}/${e.id}`,'admin');}
 const batches=JSON.parse(fs.readFileSync('evidence/ocr-triplatform-20260913/cloud-ocr-http.json')).batches;
 for(const batch of batches){await get(`/ocr-batches/${batch.id}`);await get(`/ocr-batches/${batch.id}/draft`);await get(`/ocr-batches/${batch.id}/${batch.purpose==='roster'?'roster-confirmation':'physical-confirmations'}`);}
 const students=await get('/students','admin');const list=Array.isArray(students)?students:students?.items;
 const beta=list?.find(row=>row.studentNumber==='9900000002');if(beta)await get(`/students/${beta.id}`,'admin');
}finally{const r={check:'CLOUD_EXTENDED_READ_REGRESSION',observedAt:new Date().toISOString(),organizationId:s.fixture.organizationId,passed:checks.filter(c=>c.pass).length,total:checks.length,checks};fs.writeFileSync('evidence/ocr-triplatform-20260913/cloud-read-extended.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({passed:r.passed,total:r.total,failed:checks.filter(c=>!c.pass)}));assert.ok(checks.every(c=>c.pass));}
