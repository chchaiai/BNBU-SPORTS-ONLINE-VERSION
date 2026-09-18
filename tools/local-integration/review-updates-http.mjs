import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {createTestPrisma} from '../../backend/test/helpers/database.ts';
import {seedExerciseSessionStudent} from '../../backend/test/helpers/exercise-session.ts';
import {TEST_PASSWORD} from '../../backend/test/helpers/test-environment.ts';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../backend/package.json',import.meta.url)),{v7:uuidv7}=require('uuid');
const state=JSON.parse(await fs.readFile('.local/demand-six-browser-state.json','utf8'));
const db=createTestPrisma('postgresql://bnbu_test:demand-local-test-only@127.0.0.1:55433/bnbu_sports_test?schema=public');
const base=state.baseUrl+'/api/v1';let checks=0;
async function call(path,token,body,expected=body?201:200,key=randomUUID()){
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':key,...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();assert.equal(r.status,expected,JSON.stringify(j));checks++;return j.data;
}
try{
 state.student=await seedExerciseSessionStudent(db,state.fixture,'REVIEW18-'+randomUUID(),'ACTIVE',false);
 await db.studentProfile.update({where:{id:state.student.studentId},data:{majorName:'未分流'}});
 await fs.writeFile('.local/demand-six-browser-state.json',JSON.stringify(state));
 const teacher=(await call('/auth/password-login',null,{account:state.fixture.teacherEmail,password:TEST_PASSWORD},200)).accessToken;
 const admin=(await call('/auth/password-login',null,{account:state.fixture.adminEmail,password:TEST_PASSWORD},200)).accessToken;
 const org=await db.organization.findUniqueOrThrow({where:{id:state.fixture.organizationId}});
 const challenge=await call('/auth/student-sign-in-codes',null,{organizationCode:org.organizationCode,account:state.student.email,channel:'EMAIL',locale:'en'},202);
 let code;for(let i=0;i<30&&!code;i++){const m=await(await fetch('http://127.0.0.1:58025/api/v1/messages?limit=50')).json();const msg=m.messages?.find(x=>JSON.stringify(x.To).includes(state.student.email));if(msg){const detail=await(await fetch('http://127.0.0.1:58025/api/v1/message/'+msg.ID)).json();code=String(detail.Text??'').match(/(?:code is|验证码是)\s*(\d{4,10})/u)?.[1];}if(!code)await new Promise(r=>setTimeout(r,300));}assert.ok(code);
 const student=(await call('/auth/student-sign-in-codes/verify',null,{challengeId:challenge.challengeId,code,deviceId:randomUUID()},200)).accessToken;
 const path=`/class-sections/${state.fixture.teacherAActiveSectionId}/history-settings`;
 const current=await call(path,teacher);const settings={enabled:true,earliestDate:'2026-09-01',latestDate:'2026-12-31',maximumMinutes:180,expectedVersion:current.version};
 await call(path,student,settings,403);await call(path,teacher,{...settings,maximumMinutes:0},422);
 const key=randomUUID(),saved=await call(path,teacher,settings,201,key);assert.deepEqual(await call(path,teacher,settings,201,key),saved);assert.equal((await call(path,student)).maximumMinutes,180);
 await call(`/enrollments/${state.student.enrollmentId}/historical-sessions`,student,{startedAt:'2026-09-15T12:00:00+08:00',durationSeconds:181*60},422);
 const session=await call(`/enrollments/${state.student.enrollmentId}/historical-sessions`,student,{startedAt:'2026-09-15T12:00:00+08:00',durationSeconds:120*60});
 assert.equal((await db.exerciseSession.findUniqueOrThrow({where:{id:session.id}})).maximumDurationSeconds,10800);
 const draft=await call('/exercise-records',student,{sessionId:session.id,clientRequestId:randomUUID(),creditType:'COURSE_RELATED',sportType:'RUNNING'});
 const id=uuidv7(),now=new Date(),bytes=await require('sharp')({create:{width:64,height:64,channels:3,background:'green'}}).png().toBuffer();
 await db.mediaEvidence.create({data:{id,organizationId:state.fixture.organizationId,ownerStudentId:state.student.studentId,sessionId:session.id,initiatedByUserId:state.student.userId,businessPurpose:'EXERCISE_RECORD',mediaType:'IMAGE',captureSource:'IN_APP_CAMERA',declaredMimeType:'image/png',verifiedMimeType:'image/png',declaredFileSizeBytes:BigInt(bytes.length),verifiedFileSizeBytes:BigInt(bytes.length),declaredContentSha256:createHash('sha256').update(bytes).digest('hex'),verifiedContentSha256:createHash('sha256').update(bytes).digest('hex'),uploadStatus:'AVAILABLE',storageKey:`media/${state.fixture.organizationId}/${id}/image`,uploadedAt:now,boundAt:now,processingStartedAt:now,availableAt:now,createdAt:now,updatedAt:now,version:5}});
 const {S3Client,PutObjectCommand}=require('@aws-sdk/client-s3');const storage=new S3Client({endpoint:'http://127.0.0.1:59000',region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:'demand-local-test',secretAccessKey:'demand-local-test-secret-only'}});await storage.send(new PutObjectCommand({Bucket:'demand-browser',Key:`media/${state.fixture.organizationId}/${id}/image`,Body:bytes,ContentType:'image/png'}));storage.destroy();
 await call(`/media/${id}`,admin,null,404);
 const submitted=await call(`/exercise-records/${draft.id}/submit`,student,{expectedVersion:draft.version,mediaIds:[id]},200);assert.equal(submitted.workflowStage,'PENDING_TEACHER');assert.equal(submitted.creditedDurationSeconds,0);
 await call(`/exercise-records/${draft.id}/v81-reviews`,teacher,{action:'VALID',expectedVersion:submitted.workflowVersion});
 const reviewed=await call(`/exercise-records/${draft.id}`,student);assert.equal(reviewed.creditedDurationSeconds,7200);
 const rows=await call('/exercise-records?q='+encodeURIComponent((await db.studentProfile.findUniqueOrThrow({where:{id:state.student.studentId}})).studentNumber),admin);assert.equal(rows.length,1);assert.ok(rows[0].studentName);assert.equal(rows[0].creditedDurationSeconds,7200);
 const evidence=await call(`/exercise-records/${draft.id}/evidence-context`,admin);assert.deepEqual(evidence.mediaIds,[id]);await call(`/media/${id}`,admin);const access=await call(`/media/${id}/access-url`,admin,{purpose:'VIEW_ORIGINAL'},200);assert.equal((await fetch(access.accessUrl)).status,200);
 await db.v81AdminAccess.update({where:{userId:state.fixture.adminUserId},data:{kind:'SUB',permissions:['AUDIT_QUERY']}});await call(`/media/${id}`,admin,null,403);await db.v81AdminAccess.update({where:{userId:state.fixture.adminUserId},data:{kind:'SUPER',permissions:[]}});
 const other=(await call('/auth/password-login',null,{account:state.fixture.teacherBEmail,password:TEST_PASSWORD},200)).accessToken;
 await call(`/exercise-records/${draft.id}`,other,null,403);
 const outbox=await call('/health/admin/outbox',admin);assert.ok(outbox.items.some(x=>x.actor?.actorName&&x.actor?.operationOutcome==='SUCCEEDED'));await call('/health/admin/outbox',teacher,null,403);
 const summary={result:'PASS',checks,historyMinutes:120,configuredMaximum:180,pendingBeforeTeacher:true,creditedAfterTeacher:120,adminSearch:true,adminEvidence:true,unsubmittedEvidenceDenied:true,subadminScope:true,actorAttribution:true,teacherIsolation:true};
 await fs.writeFile('evidence/review-updates-20260918/http.json',JSON.stringify(summary,null,2));await fs.writeFile('.local/review-updates-tokens.json',JSON.stringify({student,teacher,admin,recordId:draft.id}));console.log(JSON.stringify(summary));
}finally{await db.$disconnect();}
