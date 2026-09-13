// Real public HTTPS/COS/scanner exercise flow in the existing isolated OCR fixture.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const state=JSON.parse(readFileSync('.local/ocr-triplatform-20260913-private.json'));
const student=state.student,own=state.studentSession.accessToken,teacher=state.teacherToken;
const origin='https://www.student.bnbusports.cn',results=[];
async function request(token,path,body,key=randomUUID()){
 const response=await fetch(origin+'/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 const value=await response.json();assert.ok(response.ok,JSON.stringify({path,status:response.status,code:value.code,requestId:value.requestId}));return value.data;
}
const course=await request(teacher,`/class-sections/${state.fixture.teacherAActiveSectionId}`);
assert.match(course.displayName,/^Synthetic/);
try {
 const started=await request(own,'/exercise-sessions',{enrollmentId:student.enrollmentId,clientObservedAt:new Date().toISOString()});await delay(1200);
 const paused=await request(own,`/exercise-sessions/${started.id}/pause`,{expectedVersion:started.version,clientObservedAt:new Date().toISOString()});
 const resumed=await request(own,`/exercise-sessions/${started.id}/resume`,{expectedVersion:paused.version,clientObservedAt:new Date().toISOString()});
 await delay(61000);
 const finished=await request(own,`/exercise-sessions/${started.id}/finish`,{expectedVersion:resumed.version,clientObservedAt:new Date().toISOString()});assert.equal(finished.status,'COMPLETED');
 const record=await request(own,'/exercise-records',{sessionId:started.id,creditType:'GENERAL',sportType:'RUNNING',sportName:null,description:'Synthetic OCR release media regression',clientRequestId:randomUUID()});
 const sources=[{type:'IMAGE',mime:'image/png',bytes:readFileSync('.local/ocr-smoke/ocr-synthetic-roster.png'),duration:null},{type:'VIDEO',mime:'video/mp4',bytes:readFileSync('backend/test/fixtures/v81-media/media-recorder-fragmented.mp4'),duration:11}],mediaIds=[];
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
 results.push({check:'COURSE_PUBLISH_SESSION_PAUSE_RESUME_FINISH_MP4_SUBMIT_TEACHER_ALL_EVIDENCE',status:'PASS',recordId:record.id,elapsedSeconds:finished.actualDurationSeconds,credit:'pending-manual-review'});
}finally{
 const result={check:'REAL_CLOUD_MEDIA_EXERCISE_REGRESSION',observedAt:new Date().toISOString(),organizationId:state.fixture.organizationId,results};
 writeFileSync('evidence/ocr-triplatform-20260913/cloud-media-exercise.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
