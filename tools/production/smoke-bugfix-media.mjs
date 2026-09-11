// Isolated synthetic course/media smoke. Run locally first and only deploy
// after the complete local gate. No existing school business rows are edited.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {v7 as uuidv7} from 'uuid';
import sharp from 'sharp';
import {seedFoundationFixture,seedExerciseSessionStudent} from '/app/production-smoke-helpers.mjs';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {TokenService} from '/app/dist/modules/auth/token.service.js';
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG,db=new PrismaService(config);
const origin=process.env.BNBU_SMOKE_ORIGIN??'https://www.student.bnbusports.cn';
assert.ok(['https://www.student.bnbusports.cn','http://127.0.0.1:3199'].includes(origin));
const results=[];let fixture;
try{
 fixture=await seedFoundationFixture(db,'-BUGMEDIA-'+Date.now().toString(36).toUpperCase());
 const student=await seedExerciseSessionStudent(db,fixture,'BUG'+Date.now().toString(36).toUpperCase());
 await db.classSection.update({where:{id:fixture.teacherAActiveSectionId},data:{checkInEndDate:new Date('2027-01-23T00:00:00Z'),dailyStartTime:new Date('1970-01-01T00:00:00Z'),dailyEndTime:new Date('1970-01-01T23:59:59Z')}});
 await db.v81AccountSecurity.createMany({data:[fixture.adminUserId,fixture.teacherUserId].map(userId=>({userId,organizationId:fixture.organizationId,mustChangePassword:false,passwordChangedAt:new Date()}))});
 await db.v81AdminAccess.create({data:{userId:fixture.adminUserId,organizationId:fixture.organizationId,kind:'SUPER',permissions:[],mustChangePassword:false}});
 const issuer=new TokenService(config,{now:()=>new Date()},{next:uuidv7});
 async function issue(userId,role){
  const now=new Date(),sessionId=uuidv7();await db.authSession.create({data:{id:sessionId,organizationId:fixture.organizationId,userId,status:'ACTIVE',tokenFamilyId:uuidv7(),createdAt:now,lastSeenAt:now,absoluteExpiresAt:new Date(+now+3600000),idleExpiresAt:new Date(+now+3600000)}});
  return (await issuer.issue({userId,organizationId:fixture.organizationId,role,sessionId,tokenVersion:0})).token;
 }
 const admin=await issue(fixture.adminUserId,'ADMIN'),teacher=await issue(fixture.teacherUserId,'TEACHER'),own=await issue(student.userId,'STUDENT');
 async function request(token,path,body,key=randomUUID()){
  const response=await fetch(origin+'/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json();assert.ok(response.ok,JSON.stringify({path,status:response.status,code:value.code,requestId:value.requestId}));return value.data;
 }
 const template=await request(admin,'/rule-templates',{displayName:'Synthetic bugfix smoke rule',expectedVersion:0});
 await request(teacher,`/class-sections/${fixture.teacherAActiveSectionId}/v81-rules`,{templateId:template.id,minimumMinutes:30,weeklyLimit:3,courseTarget:600,generalTarget:600,regularDeadline:'2027-01-23T00:00:00Z',closingDeadline:'2027-01-30T00:00:00Z',settlementPlannedAt:'2027-01-30T01:00:00Z',publish:true,expectedVersion:0});
 const started=await request(own,'/exercise-sessions',{enrollmentId:student.enrollmentId,clientObservedAt:new Date().toISOString()});await delay(1200);
 const paused=await request(own,`/exercise-sessions/${started.id}/pause`,{expectedVersion:started.version,clientObservedAt:new Date().toISOString()});
 const resumed=await request(own,`/exercise-sessions/${started.id}/resume`,{expectedVersion:paused.version,clientObservedAt:new Date().toISOString()});
 const finished=await request(own,`/exercise-sessions/${started.id}/finish`,{expectedVersion:resumed.version,clientObservedAt:new Date().toISOString()});assert.equal(finished.status,'COMPLETED');
 const record=await request(own,'/exercise-records',{sessionId:started.id,creditType:'GENERAL',sportType:'RUNNING',sportName:null,description:'Synthetic MP4 bugfix smoke; short session receives no credit',clientRequestId:randomUUID()});
 const sources=[{type:'IMAGE',mime:'image/png',bytes:await sharp({create:{width:8,height:8,channels:3,background:'#246088'}}).png().toBuffer(),duration:null},{type:'VIDEO',mime:'video/mp4',bytes:readFileSync('/app/media-recorder-fragmented.mp4'),duration:11}],mediaIds=[];
 for(const source of sources){
  const digest=createHash('sha256').update(source.bytes).digest('hex');
  const input={sessionId:started.id,businessPurpose:'EXERCISE_RECORD',mediaType:source.type,mimeType:source.mime,fileSizeBytes:source.bytes.length,captureSource:'IN_APP_CAMERA',declaredContentSha256:digest,durationSeconds:source.duration};
  const key=randomUUID(),upload=await request(own,'/media-uploads',input,key);assert.equal((await request(own,'/media-uploads',input,key)).mediaId,upload.mediaId);
  const storageUrl=value=>value;
  const localHeaders=value=>origin.startsWith('http:')?{host:new URL(value).host}:{};
  const put=await fetch(storageUrl(upload.uploadUrl),{method:upload.uploadMethod,headers:{...upload.requiredHeaders,...localHeaders(upload.uploadUrl)},body:source.bytes});assert.equal(put.status,200);
  const confirmed=await request(own,`/media-uploads/${upload.uploadSessionId}/confirm`,{etag:put.headers.get('etag').replaceAll('"','')});
  await request(own,`/media/${upload.mediaId}/bind`,{sessionId:started.id,expectedVersion:confirmed.version});
  let media;for(let attempt=0;attempt<45;attempt++){media=await request(own,`/media/${upload.mediaId}`);if(['AVAILABLE','FAILED'].includes(media.uploadStatus))break;await delay(1000);}
  assert.equal(media.uploadStatus,'AVAILABLE');assert.equal(media.verifiedContentSha256,digest);
  mediaIds.push(upload.mediaId);
 }
 const submitted=await request(own,`/exercise-records/${record.id}/submit`,{mediaIds,expectedVersion:record.version});assert.equal(submitted.status,'SUBMITTED');
 for(const [index,id] of mediaIds.entries()){
  const source=sources[index],access=await request(teacher,`/media/${id}/access-url`,{purpose:'VIEW_ORIGINAL'});
  const downloaded=await fetch(access.accessUrl);assert.equal(downloaded.status,200);assert.ok(Buffer.from(await downloaded.arrayBuffer()).equals(source.bytes));
  const anonymous=await fetch(access.accessUrl.split('?')[0]);assert.equal(anonymous.status,403);
  results.push({check:'REAL_STORAGE_SCAN_TEACHER_ORIGINAL_BYTES_PRIVATE',status:'PASS',mediaType:source.type,bytes:source.bytes.length,mediaId:id});
 }
 const evidence=await request(teacher,`/exercise-records/${record.id}/evidence-context`);assert.deepEqual([...evidence.mediaIds].sort(),[...mediaIds].sort());
 results.push({check:'COURSE_PUBLISH_SESSION_PAUSE_RESUME_FINISH_MP4_SUBMIT_TEACHER_ALL_EVIDENCE',status:'PASS',recordId:record.id,elapsedSeconds:finished.actualDurationSeconds,credit:'short-session-zero-credit'});
}finally{
 if(fixture){await db.user.updateMany({where:{organizationId:{in:[fixture.organizationId,fixture.isolationOrganizationId]}},data:{status:'DISABLED',tokenVersion:{increment:1}}});results.push({check:'SYNTHETIC_MEDIA_ACCOUNTS_DISABLED',status:'PASS',organizationId:fixture.organizationId});}
 await db.$disconnect();console.log(JSON.stringify(results));
}
