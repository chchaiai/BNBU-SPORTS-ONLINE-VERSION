// Bounded OCR failures; pauses only the task's synthetic organization, then restores it.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const state=JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json'));
const t=state.teacherToken,a=state.adminToken,s=state.studentSession.accessToken;
const section=state.fixture.teacherAActiveSectionId,checks=[];let restore=false,batch;
async function api(path,token,body,expected=body===undefined?200:201,key=randomUUID()){
 const form=body instanceof FormData,r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${token}`,'idempotency-key':key,...(form?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:form?body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
 const value=await r.json();assert.equal(r.status,expected,JSON.stringify({path,status:r.status,code:value.code}));return value.data;
}
const configPath='/admin/review-services/ocr';
function input(c,enabled,reason){return {provider:c.provider,region:c.region,timeoutMs:c.timeoutMs,enabled,reason,expectedVersion:c.version};}
try{
 assert.match((await api(`/class-sections/${section}`,t)).displayName,/^Synthetic/);
 const before=(await api(configPath,a)).configuration;assert.equal(before.enabled,true);
 for(const role of [t,s])await api(configPath+'/revisions',role,input(before,false,'Synthetic denied change'),403);
 checks.push('NON_ADMIN_CONFIGURATION_WRITE_DENIED');
 for(const bad of [{secret:'SYNTHETIC_REJECTED'},{endpoint:'https://invalid.example'},{provider:'UNAPPROVED'}])
  await api(configPath+'/revisions',a,{...input(before,true,'Synthetic invalid configuration'),...bad},422);
 checks.push('SECRET_ENDPOINT_PROVIDER_INPUT_REJECTED');
 const form=new FormData();form.append('pages',new Blob([fs.readFileSync('.local/ocr-smoke/ocr-synthetic-roster.png')],{type:'image/png'}),'synthetic-pause-check.png');
 await api(`/class-sections/${section}/ocr-roster-batches`,s,form,403);
 batch=await api(`/class-sections/${section}/ocr-roster-batches`,t,form);
 checks.push('STUDENT_UPLOAD_DENIED_TEACHER_UPLOAD_ACCEPTED');
 const paused=await api(configPath+'/revisions',a,input(before,false,'Synthetic pause/recovery regression'));restore=true;
 assert.equal((await api(configPath,a)).executionEnabled,false);
 await api(`/ocr-batches/${batch.id}/pages/${batch.pages[0].id}/recognition`,t,{expectedAttempt:0},503);
 checks.push('PAUSED_RECOGNITION_FAILS_CLOSED_WITHOUT_PROVIDER_CALL');
 await api(configPath+'/revisions',a,input(before,true,'Synthetic stale version'),409);
 checks.push('STALE_CONFIGURATION_VERSION_REJECTED');
 await api(configPath+'/revisions',a,input(paused,true,'Synthetic restore after pause regression'));restore=false;
 assert.equal((await api(configPath,a)).executionEnabled,true);checks.push('CONFIGURATION_RECOVERED');
}finally{
 if(restore){const current=(await api(configPath,a)).configuration;await api(configPath+'/revisions',a,input(current,true,'Synthetic recovery after interrupted regression'));checks.push('FINALLY_CONFIGURATION_RESTORED');}
 const r={check:'CLOUD_OCR_NEGATIVE_REGRESSION',observedAt:new Date().toISOString(),organizationId:state.fixture.organizationId,batchId:batch?.id,checks,allChecksCompleted:checks.includes('CONFIGURATION_RECOVERED')};
 fs.writeFileSync('evidence/ocr-triplatform-20260913/cloud-ocr-negative.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));
}
