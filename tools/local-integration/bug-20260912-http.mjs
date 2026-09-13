import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {request as httpRequest} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {createTestPrisma} from '../../backend/test/helpers/database.ts';
const fixture=JSON.parse(readFileSync('/workspace/.browser-state/demand-fixture.json','utf8'));
const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;
const db=createTestPrisma(url.href);
async function api(path,token,body,key=randomUUID()) {
 const response=await fetch('http://127.0.0.1:3199/api/v1'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':key,...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const value=await response.json();return {status:response.status,data:value.data,error:value.error??value.code};
}
const pass=check=>console.log(JSON.stringify({check,result:'PASS'}));
try {
 assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name,'v81_browser_test');
 const login=async account=>{const result=await api('/auth/password-login',null,{account,password:fixture.password});assert.equal(result.status,200);return result.data.accessToken;};
 const teacher=await login(fixture.teacherEmail),admin=await login(fixture.adminEmail);
 const challenge=await api('/auth/student-sign-in-codes',null,{organizationCode:fixture.organizationCode,account:fixture.studentEmail,channel:'EMAIL',locale:'en'});assert.equal(challenge.status,202);
 let code;
 for(let n=0;n<40&&!code;n++) {
  const messages=await(await fetch('http://mailpit:8025/api/v1/messages?limit=100')).json();
  const message=messages.messages.find(item=>JSON.stringify(item.To).includes(fixture.studentEmail));
  if(message){const full=await(await fetch('http://mailpit:8025/api/v1/message/'+message.ID)).json();code=full.Text.match(/\b\d{6}\b/)?.[0];}
  if(!code)await delay(250);
 }
 const signed=await api('/auth/student-sign-in-codes/verify',null,{challengeId:challenge.data.challengeId,code,deviceId:randomUUID()});assert.equal(signed.status,200);const student=signed.data.accessToken;
 let me=(await api('/me',student)).data;
 assert.equal((await api('/me/email-verification-challenges',student,{email:'synthetic@example.invalid',locale:'en',expectedVersion:me.user.version})).status,422);
 pass('STUDENT_EMAIL_WITHOUT_BNBU_REJECTED');
 const body={collegeName:'Synthetic Updated College',majorName:'Software',dateOfBirth:'2004-02-29',regionCode:'OTHER',expectedVersion:me.studentProfile.version};
 assert.equal((await api('/me/student-profile',student,body)).status,422);
 body.otherRegionName='Japan';const key=randomUUID();
 const completed=await api('/me/student-profile',student,body,key);assert.equal(completed.status,200,JSON.stringify(completed.error));
 assert.equal(completed.data.studentProfile.otherRegionName,'Japan');
 assert.equal((await api('/me/student-profile',student,body,key)).status,200);
 assert.equal((await api('/me/student-profile',student,body)).status,409);
 assert.equal((await api('/me/student-profile',teacher,body)).status,403);
 assert.equal((await api('/me',student)).data.studentProfile.otherRegionName,'Japan');
 pass('SELF_PROFILE_COUNTRY_PERSISTENCE_IDEMPOTENCY_AND_SCOPE');
 assert.equal((await api('/students/'+fixture.studentId,admin)).data.email,fixture.studentEmail);
 assert.equal('email' in (await api('/students/'+fixture.studentId,teacher)).data,false);
 assert.equal('email' in (await api('/me',student)).data.studentProfile,false);
 pass('SUPER_ADMIN_EMAIL_DETAIL_WITHOUT_TEACHER_OR_STUDENT_DISCLOSURE');

 const started=await api('/exercise-sessions',student,{enrollmentId:fixture.enrollmentId,clientObservedAt:new Date().toISOString()});assert.equal(started.status,201,JSON.stringify(started.error));
 const ended=await api(`/exercise-sessions/${started.data.id}/finish`,student,{expectedVersion:started.data.version,clientObservedAt:new Date().toISOString()});assert.equal(ended.status,200);
 const content=sessionId=>({sessionId,creditType:'GENERAL',sportType:'YOGA',description:'Synthetic bug regression',clientRequestId:randomUUID()});
 const short=await api('/exercise-records',student,content(ended.data.id));assert.equal(short.status,422,JSON.stringify(short));
 assert.equal(await db.exerciseRecord.count({where:{sessionId:ended.data.id}}),0);
 pass('SHORT_SESSION_NO_RECORD_NO_TEACHER_REVIEW');
 const session=await api(`/enrollments/${fixture.enrollmentId}/historical-sessions`,student,{startedAt:`${fixture.past}T16:00:00+08:00`,durationSeconds:2100});assert.equal(session.status,201);
 const sessionId=session.data.id;
 const draft=await api('/exercise-records',student,content(sessionId));assert.equal(draft.status,201,JSON.stringify(draft.error));
 const mediaIds=[];
 for(const [file,mimeType,mediaType,durationSeconds] of [['demand-photo.jpg','image/jpeg','IMAGE',null],['bug-20260912-video.mp4','video/mp4','VIDEO',3]]) {
  const bytes=readFileSync('/workspace/.browser-state/'+file);
  const initiated=await api('/media-uploads',student,{sessionId,businessPurpose:'EXERCISE_RECORD',mediaType,mimeType,fileSizeBytes:bytes.length,declaredContentSha256:createHash('sha256').update(bytes).digest('hex'),durationSeconds,captureSource:'FILE_PICKER'});assert.equal(initiated.status,201,JSON.stringify(initiated.error));
  const objectUrl=new URL(initiated.data.uploadUrl),host=objectUrl.host;objectUrl.hostname='media-minio';objectUrl.port='9000';
  const etag=await new Promise((resolve,reject)=>{const req=httpRequest(objectUrl,{method:'PUT',headers:{...initiated.data.requiredHeaders,host,'content-length':bytes.length}},res=>{res.resume();res.on('end',()=>res.statusCode<300?resolve(res.headers.etag.replaceAll('"','')):reject(new Error('Object upload failed')));});req.on('error',reject);req.end(bytes);});
  const confirmed=await api(`/media-uploads/${initiated.data.uploadSessionId}/confirm`,student,{etag});assert.equal(confirmed.status,200);
  const bound=await api(`/media/${initiated.data.mediaId}/bind`,student,{sessionId,expectedVersion:confirmed.data.version});assert.equal(bound.status,200);
  let media;
  for(let n=0;n<60;n++){media=await api('/media/'+initiated.data.mediaId,student);if(media.data.uploadStatus==='AVAILABLE')break;assert.notEqual(media.data.uploadStatus,'FAILED',JSON.stringify(media.data));await delay(250);}
  assert.equal(media.data.uploadStatus,'AVAILABLE');mediaIds.push(media.data.id);
 }
 const submitted=await api(`/exercise-records/${draft.data.id}/submit`,student,{expectedVersion:draft.data.version,mediaIds});assert.equal(submitted.status,200,JSON.stringify(submitted.error));
 const workflow=await api(`/exercise-records/${draft.data.id}/workflow`,teacher);assert.equal(workflow.status,200);
 const reviewed=await api(`/exercise-records/${draft.data.id}/v81-reviews`,teacher,{action:'RETURN_FOR_SUPPLEMENT',reasonCode:'UNCLEAR_EVIDENCE',publicComment:'Synthetic public note remains visible',supplementHours:24,expectedVersion:workflow.data.version});assert.equal(reviewed.status,201,JSON.stringify(reviewed.error));
 pass('EXACT_THRESHOLD_PHOTO_VIDEO_UPLOAD_AND_TEACHER_REVIEW');
 const {writeFileSync}=await import('node:fs');writeFileSync('/workspace/.browser-state/bug-20260912-browser.json',JSON.stringify({...fixture,recordId:draft.data.id,studentToken:student,mediaIds,shortSessionId:ended.data.id}));
}finally{await db.$disconnect();}
