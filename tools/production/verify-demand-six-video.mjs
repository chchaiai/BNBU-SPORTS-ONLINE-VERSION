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
 const videoPath=join(directory,'long.mp4');execFileSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=25','-f','lavfi','-i','sine=frequency=440','-t','11','-c:v','libx264','-threads','1','-c:a','aac',videoPath],{timeout:30000});
 const bytes=await readFile(videoPath);
  const now=new Date(),sessionId=uuidv7(),org=f.fixture.organizationId;
  // Synthetic completed exercise is fixture setup. All media and submissions below use real public APIs.
  await db.exerciseSession.create({data:{id:sessionId,organizationId:org,studentId:f.student.studentId,enrollmentId:f.student.enrollmentId,classSectionId:f.fixture.teacherAActiveSectionId,semesterId:f.fixture.semesterId,startedByAuthSessionId:f.student.authSessionId,status:'COMPLETED',startedAt:new Date(+now-120000),businessDate:new Date(new Date(+now+28800000).toISOString().slice(0,10)+'T00:00:00Z'),completedAt:now,endReason:'USER_COMPLETED',actualDurationSeconds:120n,pausedDurationSeconds:0n,createdAt:now,updatedAt:now}});

 const upload=await api('/media-uploads',f.studentSession.accessToken,{sessionId,businessPurpose:'EXERCISE_RECORD',mediaType:'VIDEO',mimeType:'video/mp4',fileSizeBytes:bytes.length,captureSource:'IN_APP_CAMERA',declaredContentSha256:createHash('sha256').update(bytes).digest('hex')},201);
 const put=await fetch(upload.uploadUrl,{method:upload.uploadMethod,headers:upload.requiredHeaders,body:bytes,signal:AbortSignal.timeout(60000)});assert.equal(put.status,200);
 const confirmed=await api(`/media-uploads/${upload.uploadSessionId}/confirm`,f.studentSession.accessToken,{etag:put.headers.get('etag').replace(/^"|"$/g,'')});
 await api(`/media/${upload.mediaId}/bind`,f.studentSession.accessToken,{sessionId,expectedVersion:confirmed.version});
 const failed=await waitFor(()=>api(`/media/${upload.mediaId}`,f.studentSession.accessToken),v=>v.uploadStatus==='FAILED');
 assert.equal(failed.failureCode,'MEDIA_VIDEO_DURATION_EXCEEDED');
 const draft=await api('/exercise-records',f.studentSession.accessToken,{sessionId,creditType:'GENERAL',sportType:'RUNNING',description:'Synthetic over-ten-second rejection',clientRequestId:randomUUID()},201);
 await api(`/exercise-records/${draft.id}/submit`,f.studentSession.accessToken,{mediaIds:[upload.mediaId],expectedVersion:draft.version},422);
 const jobs=await db.v81AiReviewJob.count({where:{organizationId:f.fixture.organizationId}});assert.equal(jobs,3);
 const result={result:'PASS',durationSeconds:11,declaredDurationOmitted:true,mediaFailureCode:failed.failureCode,submissionStatus:422,newAiCalls:0,requests};
 await writeFile('/acceptance/video-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await db.$disconnect();await rm(directory,{recursive:true,force:true});}
