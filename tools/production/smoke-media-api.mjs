import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';
import { v7 as uuidv7 } from 'uuid';
import { seedFoundationFixture, seedExerciseSessionStudent } from '/app/production-smoke-helpers.mjs';
import { loadRuntimeSecrets } from '/app/dist/common/config/file-json-secret-loader.js';
import { validateEnvironment } from '/app/dist/common/config/environment.js';
import { PrismaService } from '/app/dist/common/database/prisma.service.js';
import { TokenService } from '/app/dist/modules/auth/token.service.js';
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG, db=new PrismaService(config);
let fixture;
const results=[];
try {
  fixture=await seedFoundationFixture(db,'-PROD-'+Date.now().toString(36).toUpperCase());
  const student=await seedExerciseSessionStudent(db,fixture,'PROD');
  const issuer=new TokenService(config,{now:()=>new Date()},{next:uuidv7});
  const {token}=await issuer.issue({userId:student.userId,organizationId:fixture.organizationId,role:'STUDENT',sessionId:student.authSessionId,tokenVersion:0});
  const request=async(path,body,key=randomUUID())=>{
    const response=await fetch('https://www.student.bnbusports.cn/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{})});
    const value=await response.json();
    assert.ok(response.ok,JSON.stringify({path,status:response.status,code:value.code,error:value.error}));return value.data;
  };
  const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#246088'}}).png().toBuffer();
  const digest=createHash('sha256').update(bytes).digest('hex');
  const input={businessPurpose:'EXEMPTION_APPLICATION',enrollmentId:student.enrollmentId,mediaType:'IMAGE',mimeType:'image/png',fileSizeBytes:bytes.length,captureSource:'FILE_PICKER',declaredContentSha256:digest};
  const key=randomUUID(), upload=await request('/media-uploads',input,key);
  const replay=await request('/media-uploads',input,key);assert.equal(replay.mediaId,upload.mediaId);
  results.push({check:'HTTPS-media-initiate-and-idempotent-replay',status:'PASS'});
  const put=await fetch(upload.uploadUrl,{method:upload.uploadMethod,headers:upload.requiredHeaders,body:bytes});assert.equal(put.status,200);
  await request(`/media-uploads/${upload.uploadSessionId}/confirm`,{etag:put.headers.get('etag').replaceAll('"','')});
  let media;
  for(let attempt=0;attempt<30;attempt++){
    media=await request(`/media/${upload.mediaId}`);
    if(media.uploadStatus==='AVAILABLE'||media.uploadStatus==='FAILED')break;
    await delay(1000);
  }
  assert.equal(media.uploadStatus,'AVAILABLE');assert.equal(media.verifiedContentSha256,digest);assert.equal(media.verifiedMimeType,'image/png');
  results.push({check:'COS-upload-confirm-production-worker-scanner-AVAILABLE',status:'PASS',mediaId:upload.mediaId});
  const access=await request(`/media/${upload.mediaId}/access-url`,{purpose:'VIEW_ORIGINAL'});
  const download=await fetch(access.accessUrl);assert.equal(download.status,200);assert.ok(Buffer.from(await download.arrayBuffer()).equals(bytes));
  results.push({check:'API-authorized-COS-download-identical-bytes',status:'PASS'});
  const row=await db.mediaEvidence.findUnique({where:{id:upload.mediaId}});assert.equal(row.uploadStatus,'AVAILABLE');
  results.push({check:'PostgreSQL-media-result-readback',status:'PASS',organizationId:fixture.organizationId});
} finally {
  if(fixture){
    await db.user.updateMany({where:{organizationId:{in:[fixture.organizationId,fixture.isolationOrganizationId]}},data:{status:'DISABLED',tokenVersion:{increment:1}}});
    results.push({check:'synthetic-accounts-disabled',status:'PASS'});
  }
  await db.$disconnect();
  console.log(JSON.stringify(results));
}
