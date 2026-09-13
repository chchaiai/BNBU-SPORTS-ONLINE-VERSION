// Synthetic-only closure acceptance with real application evidence storage.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {setTimeout as delay} from 'node:timers/promises';
const state=JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json'));
const teacher=state.teacherToken,student=state.studentSession.accessToken,admin=state.adminToken,section=state.fixture.teacherAActiveSectionId;
const checks=[],applications=[],mediaIds=[];
async function api(path,token,body,status=body?201:200,key=randomUUID()){
 const r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 const v=await r.json();assert.equal(r.status,status,JSON.stringify({path,status:r.status,code:v.code}));return v.data;
}
try{
 const course=await api(`/class-sections/${section}`,teacher);assert.match(course.displayName,/^Synthetic/);assert.equal(course.status,'ACTIVE');
 const bytes=fs.readFileSync('.local/ocr-smoke/ocr-synthetic-roster.png');
 for(const subtype of ['SCHOOL_TEAM','STUDENT_CLUB','RUN_800M']){
  const upload=await api('/media-uploads',student,{enrollmentId:state.student.enrollmentId,businessPurpose:'EXEMPTION_APPLICATION',mediaType:'IMAGE',mimeType:'image/png',fileSizeBytes:bytes.length,captureSource:'FILE_PICKER',declaredContentSha256:createHash('sha256').update(bytes).digest('hex')});mediaIds.push(upload.mediaId);
  const put=await fetch(upload.uploadUrl,{method:upload.uploadMethod,headers:upload.requiredHeaders,body:bytes,signal:AbortSignal.timeout(20000)});assert.equal(put.status,200);
  await api(`/media-uploads/${upload.uploadSessionId}/confirm`,student,{etag:put.headers.get('etag').replaceAll('"','')},200);
  let media;for(let i=0;i<45;i++){media=await api(`/media/${upload.mediaId}`,student);if(['AVAILABLE','FAILED'].includes(media.uploadStatus))break;await delay(1000);}assert.equal(media.uploadStatus,'AVAILABLE');
  const draft=await api('/exemption-applications',student,{enrollmentId:state.student.enrollmentId,applicationType:subtype==='RUN_800M'?'PHYSICAL_TEST':'EXERCISE_CHECK_IN',applicationSubtype:subtype,organizationName:subtype==='RUN_800M'?null:'Synthetic '+subtype,reason:'Synthetic closure cleanup acceptance',mediaIds:[upload.mediaId]});applications.push({id:draft.id,subtype});
  const submitted=await api(`/exemption-applications/${draft.id}/submit`,student,{expectedVersion:draft.version},200);
  if(subtype==='SCHOOL_TEAM'){
   const body={decision:'APPROVE',publicComment:'Synthetic verified participation',courseMinutes:120,generalMinutes:0,expectedVersion:submitted.version},key=randomUUID();
   const approved=await api(`/exemption-applications/${draft.id}/review`,teacher,body,200,key);
   assert.equal(approved.status,'APPROVED');assert.deepEqual(await api(`/exemption-applications/${draft.id}/review`,teacher,body,200,key),approved);
  }
 }
 checks.push('THREE_REAL_COS_SCANNED_APPLICATIONS_SUBMITTED_TEAM_APPROVED_REPLAY');
 const before=await api('/student-progress',student);assert.equal(before.find(r=>r.enrollmentId===state.student.enrollmentId).courseRelated.recognizedSeconds,7200);checks.push('APPROVED_RECOGNITION_PROGRESS');
 const current=await api(`/class-sections/${section}`,teacher),body={reason:'Synthetic user-confirmed application cleanup on course closure',expectedVersion:current.version},key=randomUUID();
 const closed=await api(`/class-sections/${section}/close`,teacher,body,200,key);assert.deepEqual(await api(`/class-sections/${section}/close`,teacher,body,200,key),closed);checks.push('COURSE_CLOSED_AND_REPLAY');
 for(const token of [student,teacher]){
  const listing=await api('/exemption-application-details?limit=100',token);assert.ok(applications.every(a=>!listing.some(row=>row.id===a.id)));
  const certifications=await api('/activity-certification-applications',token);assert.ok(applications.every(a=>!certifications.some(row=>row.id===a.id)));
 }checks.push('STUDENT_TEACHER_APPLICATIONS_AND_CERTIFICATIONS_CLEARED');
 const enrollment=await api(`/enrollments/${state.student.enrollmentId}`,student);assert.equal(enrollment.status,'REMOVED');
 assert.equal((await api(`/enrollments/${state.student.enrollmentId}/roster-status`,student)).status,'MATCHED');
 assert.equal((await api(`/student/enrollments/${state.student.enrollmentId}/physical-result`,student)).result.elapsedSeconds,270);
 const summary=await api(`/admin/class-sections/${section}/physical-summary`,admin);assert.equal(summary.recordedCount,2);
 const record=JSON.parse(fs.readFileSync('evidence/ocr-triplatform-20260913/cloud-media-exercise.json')).results.find(r=>r.recordId).recordId;
 assert.equal((await api(`/exercise-records/${record}/workflow`,student)).stage,'VALID');
 checks.push('CLOSED_MEMBERSHIP_ROSTER_PHYSICAL_EXERCISE_HISTORY_RETAINED');
}finally{const result={check:'CLOUD_CLOSURE_APPLICATION_CLEANUP',observedAt:new Date().toISOString(),organizationId:state.fixture.organizationId,sectionId:section,applications,mediaIds,checks,allChecksCompleted:checks.includes('CLOSED_MEMBERSHIP_ROSTER_PHYSICAL_EXERCISE_HISTORY_RETAINED')};fs.writeFileSync('evidence/ocr-triplatform-20260913/cloud-closure-applications.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
