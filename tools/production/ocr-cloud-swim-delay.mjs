// Real elapsed swimming delay probe. prepare and verify are separate invocations; never rewrites server time.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {setTimeout as delay} from 'node:timers/promises';
const f=JSON.parse(fs.readFileSync('.local/ocr-beta-course.json')),b=JSON.parse(fs.readFileSync('.local/ocr-beta-private.json')),staff=JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json')),checks=[];let s,t,session,record; const statePath=".local/ocr-swim-delay-private.json"; const phase=process.argv[2]; assert.ok(["prepare","verify"].includes(phase));
async function api(p,token,body,status=body?201:200,key=randomUUID()){const r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+p,{method:body?'POST':'GET',headers:{...(token?{authorization:`Bearer ${token}`} : {}),'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const v=await r.json();assert.equal(r.status,status,JSON.stringify({p,status:r.status,code:v.code,details:v.details}));return v.data;}
async function upload(file){const bytes=fs.readFileSync(file),u=await api('/media-uploads',s,{sessionId:session.id,businessPurpose:'EXERCISE_RECORD',mediaType:'IMAGE',mimeType:'image/png',fileSizeBytes:bytes.length,captureSource:'IN_APP_CAMERA',declaredContentSha256:createHash('sha256').update(bytes).digest('hex')});const put=await fetch(u.uploadUrl,{method:u.uploadMethod,headers:u.requiredHeaders,body:bytes,signal:AbortSignal.timeout(20000)});assert.equal(put.status,200);const c=await api(`/media-uploads/${u.uploadSessionId}/confirm`,s,{etag:put.headers.get('etag').replaceAll('"','')},200);await api(`/media/${u.mediaId}/bind`,s,{sessionId:session.id,expectedVersion:c.version},200);for(let i=0;i<40;i++){const m=await api(`/media/${u.mediaId}`,s);if(m.uploadStatus==='AVAILABLE')return u.mediaId;assert.notEqual(m.uploadStatus,'FAILED');await delay(1000);}throw Error('Media readiness timeout');}
try{
 b.session=await api('/auth/refresh',null,{refreshToken:b.session.refreshToken},200);fs.writeFileSync('.local/ocr-beta-private.json',JSON.stringify(b),{mode:0o600});s=b.session.accessToken;
 t=(await api('/auth/password-login',null,{account:staff.teacher.email,password:staff.teacher.password},200)).accessToken;staff.teacherToken=t;fs.writeFileSync('.local/ocr-triplatform-20260913-private.json',JSON.stringify(staff),{mode:0o600});
 assert.equal((await api('/me',s)).user.organizationId,f.organizationId);assert.match((await api(`/class-sections/${f.sectionId}`,t)).displayName,/^Synthetic electronic/);

 if(phase==='prepare'){
  assert.equal(fs.existsSync(statePath),false,'Existing delay fixture must be resumed');
  session=await api('/exercise-sessions',s,{enrollmentId:f.enrollmentId,clientObservedAt:new Date().toISOString()});
  fs.writeFileSync(statePath,JSON.stringify({session}),{mode:0o600});
  console.log(JSON.stringify({phase:'REAL_TIMER_STARTED',sessionId:session.id}));await delay(61000);
  const finished=await api('/exercise-sessions/'+session.id+'/finish',s,{expectedVersion:session.version,clientObservedAt:new Date().toISOString()},200);
  assert.ok(finished.actualDurationSeconds>=60);
  const finishedObservedAt=new Date().toISOString();
  record=await api('/exercise-records',s,{sessionId:session.id,creditType:'GENERAL',sportType:'SWIMMING',sportName:null,description:'Synthetic real elapsed offline delay acceptance',clientRequestId:randomUUID()});
  const mediaIds=[await upload('.local/ocr-smoke/ocr-synthetic-roster.png'),await upload('.local/ocr-smoke/ocr-synthetic-physical.png')];
  fs.writeFileSync(statePath,JSON.stringify({session,finished,record,mediaIds,finishedObservedAt,verifyAfter:new Date(Date.parse(finishedObservedAt)+905000).toISOString()}),{mode:0o600});
  checks.push('REAL_SESSION_FINISHED_COS_READY_AWAITING_15_MINUTES');
 }else{
  const saved=JSON.parse(fs.readFileSync(statePath));({session,record}=saved);
  assert.ok(Date.now()>=Date.parse(saved.verifyAfter),'Real 15-minute window has not elapsed');
  const p='/exercise-records/'+record.id, mediaIds=saved.mediaIds;
  const input={items:[{mediaId:mediaIds[0],phase:'BEFORE'},{mediaId:mediaIds[1],phase:'AFTER'}],expectedVersion:record.version};
  const denied=await fetch('https://www.teacher.bnbusports.cn/api/v1'+p+'/swim-intake',{method:'POST',headers:{authorization:'Bearer '+s,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify(input),signal:AbortSignal.timeout(20000)});
  const error=await denied.json();assert.equal(denied.status,422);assert.equal(error.code,'VALIDATION_FAILED');
  checks.push('AFTER_REAL_15_MINUTES_MISSING_REASON_REJECTED_422');
  input.delayReason='Synthetic offline delay test; real server session and existing materials retained';
  const key=randomUUID(), accepted=await api(p+'/swim-intake',s,input,201,key);assert.deepEqual(await api(p+'/swim-intake',s,input,201,key),accepted);assert.equal(accepted.intakeKind,'OFFLINE_DELAYED');
  const intake=await api(p+'/swim-intake',s);assert.equal(intake.readyForReview,true);assert.equal(intake.transferLate,false);assert.equal(intake.items.length,2);
  checks.push('DELAY_REASON_ACCEPTED_LOCKED_BATCH_REPLAY');
  const draft=await api(p,s);await api(p+'/submit',s,{mediaIds,expectedVersion:draft.version},200);
  const pending=await api(p,t), history=await api(p+'/reviews',t);
  const result=await api('/exercise-reviews/batch',t,{items:[{recordId:record.id,itemKey:'real-delayed-swim',result:'VALID',expectedVersion:pending.version,expectedReviewVersion:history[0]?.reviewVersion??0}]},200);
  assert.equal(result.items[0].status,'SUCCEEDED');assert.equal((await api(p+'/workflow',s)).stage,'VALID');checks.push('DELAYED_SWIM_TEACHER_REVIEW_VALID');
 }

}finally{const saved=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath)):{};const report={finishedObservedAt:saved.finishedObservedAt,verifyAfter:saved.verifyAfter,elapsedAfterFinishResponseMs:saved.finishedObservedAt?Date.now()-Date.parse(saved.finishedObservedAt):null,check:'CLOUD_REAL_ELAPSED_SWIM_DELAY',phase,observedAt:new Date().toISOString(),organizationId:f.organizationId,sessionId:session?.id,recordId:record?.id,checks,allChecksCompleted:checks.includes('DELAYED_SWIM_TEACHER_REVIEW_VALID'),limitations:['24-hour expiry and incomplete-batch continuation remain separate','Synthetic PNG proves transport, not native camera capture']};fs.writeFileSync('evidence/ocr-triplatform-20260913/cloud-swim-delay-'+phase+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
