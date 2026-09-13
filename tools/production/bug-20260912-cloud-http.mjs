import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
const path='.local/bug-20260912-cloud-private.json',state=JSON.parse(fs.readFileSync(path));
const origin='https://www.student.bnbusports.cn/api/v1';
const token=state.studentSession.accessToken,teacher=state.teacherToken;
async function api(route,auth,body,key=randomUUID()) {
 const response=await fetch(origin+route,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+auth}:{}),'idempotency-key':key},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();return {status:response.status,data:data.data,code:data.code};
}
const save=()=>fs.writeFileSync(path,JSON.stringify(state));
const pass=check=>console.log(JSON.stringify({check,result:'PASS'}));
const recordInput=sessionId=>({sessionId,creditType:'GENERAL',sportType:'RUNNING',description:'Synthetic cloud bug acceptance',clientRequestId:randomUUID()});
if(process.argv[2]==='start') {
 const short=await api('/exercise-sessions',token,{enrollmentId:state.student.enrollmentId,clientObservedAt:new Date().toISOString()});assert.equal(short.status,201,short.code);
 const finished=await api(`/exercise-sessions/${short.data.id}/finish`,token,{expectedVersion:short.data.version,clientObservedAt:new Date().toISOString()});assert.equal(finished.status,200);
 assert.equal((await api('/exercise-records',token,recordInput(short.data.id))).status,422);
 pass('CLOUD_SHORT_EXERCISE_BLOCKED');
 const started=await api('/exercise-sessions',token,{enrollmentId:state.student.enrollmentId,clientObservedAt:new Date().toISOString()});assert.equal(started.status,201);
 state.exercise=started.data;state.started=Date.now();save();pass('CLOUD_REAL_CLOCK_EXERCISE_STARTED');
}else if(process.argv[2]==='finish') {
 assert.ok(Date.now()-state.started>=61000,'Wait for real exercise duration; do not alter database timestamps');
 const finished=await api(`/exercise-sessions/${state.exercise.id}/finish`,token,{expectedVersion:state.exercise.version,clientObservedAt:new Date().toISOString()});assert.equal(finished.status,200);
 assert.ok(finished.data.actualDurationSeconds>=60);
 const draft=await api('/exercise-records',token,recordInput(state.exercise.id));assert.equal(draft.status,201,draft.code);state.record=draft.data;save();
 const mediaIds=[];
 for(const [file,mimeType,mediaType,durationSeconds] of [['.local/v81-browser-state/demand-photo.jpg','image/jpeg','IMAGE',null],['.local/bug-20260912-video.mp4','video/mp4','VIDEO',3]]) {
  const bytes=fs.readFileSync(file);
  const initiated=await api('/media-uploads',token,{sessionId:state.exercise.id,businessPurpose:'EXERCISE_RECORD',mediaType,mimeType,fileSizeBytes:bytes.length,declaredContentSha256:createHash('sha256').update(bytes).digest('hex'),durationSeconds,captureSource:'IN_APP_CAMERA'});assert.equal(initiated.status,201,initiated.code);
  assert.equal(new URL(initiated.data.uploadUrl).hostname,'bnbu-sports-prod-hk-1443273655.cos.ap-hongkong.myqcloud.com');
  const put=await fetch(initiated.data.uploadUrl,{method:'PUT',headers:initiated.data.requiredHeaders,body:bytes});assert.equal(put.status,200);
  const confirmed=await api(`/media-uploads/${initiated.data.uploadSessionId}/confirm`,token,{etag:put.headers.get('etag').replaceAll('"','')});assert.equal(confirmed.status,200,confirmed.code);
  assert.equal((await api(`/media/${initiated.data.mediaId}/bind`,token,{sessionId:state.exercise.id,expectedVersion:confirmed.data.version})).status,200);
  let current;
  for(let n=0;n<90;n++) {current=await api('/media/'+initiated.data.mediaId,token);if(current.data.uploadStatus==='AVAILABLE')break;assert.notEqual(current.data.uploadStatus,'FAILED');await new Promise(r=>setTimeout(r,500));}
  assert.equal(current.data.uploadStatus,'AVAILABLE');mediaIds.push(current.data.id);
 }
 const submitted=await api(`/exercise-records/${state.record.id}/submit`,token,{expectedVersion:state.record.version,mediaIds});assert.equal(submitted.status,200,submitted.code);
 state.mediaIds=mediaIds;save();
 const workflow=await api(`/exercise-records/${state.record.id}/workflow`,teacher);assert.equal(workflow.status,200);
 assert.equal((await api(`/exercise-records/${state.record.id}/v81-reviews`,teacher,{action:'RETURN_FOR_SUPPLEMENT',reasonCode:'UNCLEAR_EVIDENCE',publicComment:'Synthetic public note remains visible',supplementHours:24,expectedVersion:workflow.data.version})).status,201);
 pass('CLOUD_REAL_CLOCK_COS_PHOTO_VIDEO_SCAN_SUBMISSION_TEACHER_REVIEW');
}else throw new Error('Expected start or finish');
