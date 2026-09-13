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
 const rulesPath=`/class-sections/${fixture.sectionId}/v81-rules`;
 const previous=(await api(rulesPath,teacher)).data;
 const ruleBody={templateId:previous.template_id,minimumMinutes:70,weeklyLimit:1,dailyLimit:1,
  courseTarget:previous.course_target,generalTarget:previous.general_target,regularDeadline:previous.regular_deadline,
  closingDeadline:previous.closing_deadline,settlementPlannedAt:previous.settlement_planned_at,publish:true,expectedVersion:previous.version};
 const changed=await api(rulesPath,teacher,ruleBody);assert.equal(changed.status,201,JSON.stringify(changed.error));
 const snapshots=await db.$queryRaw`SELECT * FROM v81_record_rule_snapshots WHERE record_id=${fixture.recordId}::uuid`;
 assert.equal(snapshots[0].minimum_minutes,35);assert.equal(snapshots[0].daily_limit,2);
 const sessionPath=`/enrollments/${fixture.enrollmentId}/historical-sessions`;
 assert.equal((await api(sessionPath,student,{startedAt:`${fixture.past}T15:00:00+08:00`,durationSeconds:3600})).status,422);
 const photo=readFileSync('/workspace/.browser-state/demand-photo.jpg');
 async function reviewedRecord(time,seconds) {
  const session=await api(sessionPath,student,{startedAt:`${fixture.past}T${time}:00+08:00`,durationSeconds:seconds});assert.equal(session.status,201,JSON.stringify(session.error));
  const sessionId=session.data.id;
  const draft=await api('/exercise-records',student,{sessionId,creditType:'GENERAL',sportType:'YOGA',description:'Synthetic versioned rules',clientRequestId:randomUUID()});assert.equal(draft.status,201,JSON.stringify(draft.error));
  const initiated=await api('/media-uploads',student,{sessionId,businessPurpose:'EXERCISE_RECORD',mediaType:'IMAGE',mimeType:'image/jpeg',fileSizeBytes:photo.length,declaredContentSha256:createHash('sha256').update(photo).digest('hex'),durationSeconds:null,captureSource:'FILE_PICKER'});assert.equal(initiated.status,201);
  const objectUrl=new URL(initiated.data.uploadUrl),host=objectUrl.host;objectUrl.hostname='media-minio';objectUrl.port='9000';
  const etag=await new Promise((resolve,reject)=>{const req=httpRequest(objectUrl,{method:'PUT',headers:{...initiated.data.requiredHeaders,host,'content-length':photo.length}},res=>{res.resume();res.on('end',()=>res.statusCode<300?resolve(res.headers.etag.replaceAll('"','')):reject(new Error('Object upload failed')));});req.on('error',reject);req.end(photo);});
  const confirmed=await api(`/media-uploads/${initiated.data.uploadSessionId}/confirm`,student,{etag});assert.equal(confirmed.status,200);
  assert.equal((await api(`/media/${initiated.data.mediaId}/bind`,student,{sessionId,expectedVersion:confirmed.data.version})).status,200);
  for(let n=0;n<40;n++){const media=await api('/media/'+initiated.data.mediaId,student);if(media.data.uploadStatus==='AVAILABLE')break;await delay(250);}
  assert.equal((await api(`/exercise-records/${draft.data.id}/submit`,student,{expectedVersion:draft.data.version,mediaIds:[initiated.data.mediaId]})).status,200);
  const workflow=await api(`/exercise-records/${draft.data.id}/workflow`,teacher);
  assert.equal((await api(`/exercise-records/${draft.data.id}/v81-reviews`,teacher,{action:'VALID',expectedVersion:workflow.data.version})).status,201);
  return draft.data.id;
 }
 const constrained=await reviewedRecord('15:00',4500);
 const credit=async id=>(await db.$queryRaw`SELECT credited_minutes FROM v81_credit_projections WHERE record_id=${id}::uuid`)[0].credited_minutes;
 assert.equal(await credit(fixture.recordId),60);assert.equal(await credit(constrained),0);
 pass('OLD_RECORD_RETAINS_OLD_RULE_NEW_RECORD_USES_NEW_LIMITS');
 const revised=await api(rulesPath,teacher,{...ruleBody,minimumMinutes:30,dailyLimit:3,weeklyLimit:7,expectedVersion:changed.data.version});assert.equal(revised.status,201);
 const fresh=await reviewedRecord('18:00',3600);
 assert.equal(await credit(fixture.recordId),60);assert.equal(await credit(constrained),0);assert.equal(await credit(fresh),60);
 pass('LATER_RELAXATION_DOES_NOT_RECALCULATE_PRIOR_RULE_COHORT');
 pass('FOLLOWUP_HTTP_POSTGRES_MEDIA_REGRESSION');
} finally {await db.$disconnect();}
