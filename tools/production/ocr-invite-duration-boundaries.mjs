import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const s=JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json'));
const sectionId='01a0976a-b1f1-72af-b08c-55b2b17576c2',checks=[];
async function api(path,body){const r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${s.teacherToken}`,'content-type':'application/json','idempotency-key':randomUUID()},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});return {status:r.status,...await r.json()};}
const course=await api(`/class-sections/${sectionId}`);assert.equal(course.status,200);assert.ok(JSON.stringify(course.data).includes('Synthetic'));
for(const minutes of [4,121,5.5]){const r=await api(`/class-sections/${sectionId}/course-invites`,{expiresInMinutes:minutes});assert.equal(r.status,422);checks.push({minutes,status:r.status});}
let last;
try{
  for(const minutes of [null,120]){const before=Date.now();const r=await api(`/class-sections/${sectionId}/course-invites`,minutes===null?{}:{expiresInMinutes:minutes});assert.equal(r.status,201);last=r.data;const expiry=Date.parse(last.expiresAt);assert.ok(expiry>=before+(minutes??30)*60000-1000&&expiry<=Date.now()+(minutes??30)*60000);checks.push({minutes:minutes??'default30',status:r.status,expiresAt:last.expiresAt});}
}finally{
  if(last){const revoked=await api(`/class-sections/${sectionId}/course-invites/revocations`,{inviteToken:last.inviteToken});assert.equal(revoked.status,201);assert.equal(revoked.data.status,'REVOKED');}
}
const result={result:'PASS',observedAt:new Date().toISOString(),sectionId,checks,cleanup:'last invitation revoked; previous rotated automatically'};fs.writeFileSync('evidence/ocr-triplatform-20260913/invite-duration-boundaries.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
