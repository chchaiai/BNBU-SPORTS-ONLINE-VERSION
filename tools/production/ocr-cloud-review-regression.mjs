// Completes manual review only for the synthetic record created by this task.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const state=JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json'));
const media=JSON.parse(fs.readFileSync('evidence/ocr-triplatform-20260913/cloud-media-exercise.json'));
assert.equal(media.organizationId,state.fixture.organizationId);
const recordId=media.results.find(r=>r.recordId).recordId,path=`/exercise-records/${recordId}`;
const teacher=state.teacherToken,student=state.studentSession.accessToken,checks=[];
async function api(p,token,body,status=body?201:200,key=randomUUID()){
 const r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+p,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 const v=await r.json();assert.equal(r.status,status,JSON.stringify({p,status:r.status,code:v.code}));return v.data;
}
try{
 const course=await api(`/class-sections/${state.fixture.teacherAActiveSectionId}`,teacher);assert.match(course.displayName,/^Synthetic/);
 const workflow=await api(path+'/workflow',teacher);
 if(process.argv.includes('--readback-only')){assert.equal(workflow.stage,'VALID');}else{
 assert.equal(workflow.stage,'PENDING_TEACHER');
 const body={action:'VALID',expectedVersion:workflow.version},key=randomUUID();
 await api(path+'/v81-reviews',student,body,403);checks.push('STUDENT_REVIEW_DENIED');
 const reviewed=await api(path+'/v81-reviews',teacher,body,201,key);
 assert.equal(reviewed.creditedMinutes,1);assert.deepEqual(await api(path+'/v81-reviews',teacher,body,201,key),reviewed);
 checks.push('TEACHER_VALID_ONE_MINUTE_AND_REPLAY');}
 const own=await api(path+'/workflow',student);assert.equal(own.stage,'VALID');checks.push('STUDENT_VALID_WORKFLOW_READBACK');
 const progress=await api('/student-progress',student),ownProgress=progress.find(row=>row.enrollmentId===state.student.enrollmentId);
 assert.equal(ownProgress.totalEffectiveSeconds,60);
 const teacherProgress=await api('/teacher-progress',teacher);assert.deepEqual(teacherProgress.find(row=>row.enrollmentId===state.student.enrollmentId),ownProgress);
 checks.push('STUDENT_TEACHER_PROGRESS_SIXTY_SECONDS_EQUAL');
}finally{const r={check:'CLOUD_MANUAL_REVIEW',observedAt:new Date().toISOString(),recordId,checks,allChecksCompleted:checks.includes('STUDENT_TEACHER_PROGRESS_SIXTY_SECONDS_EQUAL')};const suffix=process.argv.includes('--readback-only')?'-readback':'';fs.writeFileSync(`evidence/ocr-triplatform-20260913/cloud-manual-review${suffix}.json`,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));}
