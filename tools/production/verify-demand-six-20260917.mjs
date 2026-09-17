// Mutations are confined to the SIX17 synthetic organization created for this acceptance.
import 'reflect-metadata';
import assert from 'node:assert/strict';import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {join} from 'node:path';import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {v7 as uuidv7} from 'uuid';
import {loadRuntimeSecrets} from './dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from './dist/common/config/environment.js';import {PrismaService} from './dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG,db=new PrismaService(config);
const f=JSON.parse(await readFile('/acceptance/demand-six-20260917.json','utf8'));assert.match(f.fixture.teacherEmail,/six17-/);
const checks=[],records=[],requests=[];const origin='https://www.teacher.bnbusports.cn/api/v1';
async function api(path,token,body,expected=200,idempotencyKey=randomUUID()){const requestId=randomUUID();const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':idempotencyKey,'x-request-id':requestId},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(40000)});const result=await response.json();requests.push({path,status:response.status,requestId});assert.equal(response.status,expected,JSON.stringify({path,status:response.status,code:result.code,details:result.details,requestId}));return result.data;}
async function waitFor(get,ready){for(let i=0;i<36;i++){const value=await get();if(ready(value))return value;await new Promise(r=>setTimeout(r,5000));}throw Error('ACCEPTANCE_TIMEOUT');}
const directory=await mkdtemp(join(tmpdir(),'ai-review-acceptance-'));
try{
 const organization=await db.organization.findUniqueOrThrow({where:{id:f.fixture.organizationId}});assert.match(organization.organizationCode,/^BNBU-TEST-SIX17-/);
 await db.studentProfile.update({where:{id:f.student.studentId,organizationId:f.fixture.organizationId},data:{studentNumber:'2999999017',fullName:'Synthetic AI Student',collegeName:'SCC',majorName:'JC',dateOfBirth:new Date('2004-01-01'),regionCode:'HK'}});
 const image=await sharp({create:{width:320,height:240,channels:3,background:'#dddddd'}}).png().toBuffer();
 const videoPath=join(directory,'synthetic.mp4');execFileSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=25','-f','lavfi','-i','sine=frequency=440','-t','2','-c:v','libx264','-threads','1','-c:a','aac',videoPath],{timeout:30000});
 const video=await readFile(videoPath);
 for(const [kind,bytes] of [['IMAGE',image],['VIDEO',video],['IMAGE',image]]){
  const now=new Date(),sessionId=uuidv7(),org=f.fixture.organizationId;
  // Synthetic completed exercise is fixture setup. All media and submissions below use real public APIs.
  await db.exerciseSession.create({data:{id:sessionId,organizationId:org,studentId:f.student.studentId,enrollmentId:f.student.enrollmentId,classSectionId:f.fixture.teacherAActiveSectionId,semesterId:f.fixture.semesterId,startedByAuthSessionId:f.student.authSessionId,status:'COMPLETED',startedAt:new Date(+now-120000),businessDate:new Date(new Date(+now+28800000).toISOString().slice(0,10)+'T00:00:00Z'),completedAt:now,endReason:'USER_COMPLETED',actualDurationSeconds:120n,pausedDurationSeconds:0n,createdAt:now,updatedAt:now}});
  const upload=await api('/media-uploads',f.studentSession.accessToken,{sessionId,businessPurpose:'EXERCISE_RECORD',mediaType:kind,mimeType:kind==='VIDEO'?'video/mp4':'image/png',fileSizeBytes:bytes.length,captureSource:'IN_APP_CAMERA',declaredContentSha256:createHash('sha256').update(bytes).digest('hex')},201);
  const put=await fetch(upload.uploadUrl,{method:upload.uploadMethod,headers:upload.requiredHeaders,body:bytes,signal:AbortSignal.timeout(60000)});assert.equal(put.status,200);
  const confirmed=await api(`/media-uploads/${upload.uploadSessionId}/confirm`,f.studentSession.accessToken,{etag:put.headers.get('etag').replace(/^"|"$/g,'')});
  await api(`/media/${upload.mediaId}/bind`,f.studentSession.accessToken,{sessionId,expectedVersion:confirmed.version});
  await waitFor(()=>api(`/media/${upload.mediaId}`,f.studentSession.accessToken),v=>v.uploadStatus==='AVAILABLE');
  const draft=await api('/exercise-records',f.studentSession.accessToken,{sessionId,creditType:'GENERAL',sportType:'RUNNING',description:`SIX17 synthetic ${kind} acceptance`,clientRequestId:randomUUID()},201);
  const submitKey=randomUUID();const submitted=await api(`/exercise-records/${draft.id}/submit`,f.studentSession.accessToken,{mediaIds:[upload.mediaId],expectedVersion:draft.version},200,submitKey);
  assert.deepEqual(await api(`/exercise-records/${draft.id}/submit`,f.studentSession.accessToken,{mediaIds:[upload.mediaId],expectedVersion:draft.version},200,submitKey),submitted);
  records.push({id:draft.id,mediaId:upload.mediaId,kind});assert.equal(submitted.workflowStage,'VALID');assert.equal(submitted.currentReview.result,'VALID');assert.ok(submitted.creditedDurationSeconds>=0);if(records.length===1)assert.equal(submitted.creditedDurationSeconds,120);
  const result=await waitFor(()=>api(`/exercise-records/${draft.id}`,f.teacherToken),v=>['SUCCEEDED','FAILED'].includes(v.aiReview?.status));
  assert.equal(result.aiReview.status,'SUCCEEDED',JSON.stringify(result.aiReview));assert.equal(result.workflowStage,result.aiReview.recommendation==='SUGGEST_PASS'?'VALID':'PENDING_TEACHER');assert.notEqual(result.currentReview.result,'INVALID');
  if(kind==='VIDEO')assert.ok(result.aiReview.flags.includes('VIDEO_SAMPLED'));
  if(records.length===3)assert.ok(result.aiReview.flags.includes('EXACT_DUPLICATE'));
  const own=await api(`/exercise-records/${draft.id}`,f.studentSession.accessToken);assert.equal(own.aiReview,undefined);
  checks.push({kind,recordId:draft.id,ai:result.aiReview,initialValid:true,aiExceptionsRouted:true,studentAdviceHidden:true});
 }
 const filtered=await api('/exercise-records?aiReview=SUSPECTED_RISK',f.teacherToken);assert.ok(filtered.some(row=>row.id===records[2].id));
 const first=await api(`/exercise-records/${records[0].id}`,f.teacherToken);
 assert.equal(first.workflowStage,'PENDING_TEACHER');
 await api(`/exercise-records/${first.id}/v81-reviews`,f.teacherToken,{action:'VALID',expectedVersion:first.workflowVersion,publicComment:'Synthetic teacher decision independently confirmed'},201);
 const final=await api(`/exercise-records/${first.id}`,f.teacherToken);assert.equal(final.workflowStage,'VALID');assert.deepEqual(final.aiReview,first.aiReview);
 checks.push({teacherFinalDecision:'VALID',aiAdviceRetained:true,recordId:first.id});
 const second=await api(`/exercise-records/${records[1].id}`,f.teacherToken);
 await api(`/exercise-records/${second.id}/v81-reviews`,f.teacherToken,{action:'INVALID',reasonCode:'SESSION_MISMATCH',expectedVersion:second.workflowVersion,publicComment:'Synthetic evidence is a generated test pattern, not an exercise'},201);
 const invalid=await api(`/exercise-records/${second.id}`,f.studentSession.accessToken);assert.equal(invalid.workflowStage,'INVALID');assert.equal(invalid.creditedDurationSeconds,0);
 checks.push({teacherInvalidDecision:true,studentReadback:true,recordId:second.id});
 const jobs=await db.v81AiReviewJob.findMany({where:{organizationId:f.fixture.organizationId},select:{recordId:true,status:true,attempts:true,provider:true,model:true}});
 assert.equal(jobs.length,3);assert.ok(jobs.reduce((n,j)=>n+j.attempts,0)<=9);
 assert.ok(jobs.every(j=>j.provider==='TENCENT_IMS_TOKENHUB'&&j.status==='SUCCEEDED'));
 await writeFile('/acceptance/result.json',JSON.stringify({result:'PASS',scope:'Real public HTTP + private COS + deployed automatic worker + Tencent IMS/TokenHub; synthetic exercise setup',organizationId:f.fixture.organizationId,checks,jobs,requests},null,2));
 console.log(JSON.stringify({result:'PASS',records:records.length,checks:checks.length,jobs}));
}finally{await writeFile('/acceptance/records.json',JSON.stringify({records,requests},null,2));await db.$disconnect();await rm(directory,{recursive:true,force:true});}
