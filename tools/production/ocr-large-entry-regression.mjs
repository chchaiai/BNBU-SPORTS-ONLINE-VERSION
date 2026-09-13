// One synthetic file per OCR path; no concurrency or load testing.
import fs from 'node:fs';import assert from 'node:assert/strict';import https from 'node:https';import {randomUUID,createHash} from 'node:crypto';
const s=JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json')), f=JSON.parse(fs.readFileSync('.local/ocr-beta-course.json'));
const checks=[];
for(const purpose of ['roster','physical']){
  // PNG decoders permit trailing bytes. Preserve the existing readable synthetic table.
  const bytes=Buffer.concat([fs.readFileSync(`.local/ocr-smoke/ocr-synthetic-${purpose}.png`),Buffer.alloc(2200000)]);
  const form=new FormData();form.append('pages',new Blob([bytes],{type:'image/png'}),`synthetic-large-${purpose}.png`);
  const r=await fetch(`https://www.teacher.bnbusports.cn/api/v1/class-sections/${f.sectionId}/ocr-${purpose}-batches`,{method:'POST',headers:{authorization:`Bearer ${s.teacherToken}`,'idempotency-key':randomUUID()},body:form,signal:AbortSignal.timeout(65000)});
  const v=await r.json();assert.equal(r.status,201,JSON.stringify({purpose,status:r.status,code:v.code}));
  const source=await fetch(`https://www.teacher.bnbusports.cn/api/v1/ocr-batches/${v.data.id}/pages/${v.data.pages[0].id}/source`,{headers:{authorization:`Bearer ${s.teacherToken}`},signal:AbortSignal.timeout(65000)});
  assert.equal(source.status,200);const stored=(await source.json()).data;
  assert.equal(createHash('sha256').update(Buffer.from(stored.fileBase64,'base64')).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
  checks.push({purpose,bytes:bytes.length,batchId:v.data.id,status:r.status,sourceHashMatched:true});
}
async function rejectLength(path,length){return new Promise((resolve,reject)=>{const req=https.request({hostname:'www.teacher.bnbusports.cn',path,method:'POST',headers:{'Content-Length':length,Expect:'100-continue'},timeout:15000},res=>{res.resume();resolve(res.statusCode);req.destroy();});req.on('continue',()=>{req.destroy();reject(new Error('Oversize request was unexpectedly accepted'));});req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('Timeout')));req.flushHeaders();});}
for(const purpose of ['roster','physical'])assert.equal(await rejectLength(`/api/v1/class-sections/${f.sectionId}/ocr-${purpose}-batches`,102*1024*1024),413);
assert.equal(await rejectLength('/api/v1/auth/password-login',3*1024*1024),413);
const result={result:'PASS',observedAt:new Date().toISOString(),checks,oversizeBothPaths:413,unrelatedApiOriginalLimit:413,oversizeBodyBytesSent:0,recognitionNotRequested:true};
fs.writeFileSync('evidence/ocr-triplatform-20260913/ocr-large-entry-regression.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
