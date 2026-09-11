import assert from 'node:assert/strict';import test from 'node:test';
import {resolveRecordedVideoDuration} from './js/screens/checkin.js';
import {mapSubmittedRecords} from './js/api.js';
import {reviewStageFromRecord, REVIEW_STAGES} from './js/v81-review.js';
test('mobile preview failure retains measured recorder duration, without requiring a thumbnail',()=>{
 assert.equal(resolveRecordedVideoDuration(null,3.5),3.5);assert.equal(resolveRecordedVideoDuration(Infinity,4),4);
 assert.equal(resolveRecordedVideoDuration(16,3),16);assert.equal(resolveRecordedVideoDuration(null,16),null);
 assert.equal(resolveRecordedVideoDuration(null,null),null);assert.equal(resolveRecordedVideoDuration(NaN,0),null);
});
test('submitted records remain visible during review and supplementation without earning hours',()=>{
 const base={businessDate:'2026-09-11',sportType:'RUNNING',actualDurationSeconds:60,creditedDurationSeconds:0};
 const input=['DRAFT','CANCELLED'].map((status,i)=>({...base,id:'hidden'+i,status}));
 for(const workflowStage of ['PENDING_AI','PENDING_TEACHER','AWAITING_SUPPLEMENT','TECHNICAL'])input.push({...base,id:workflowStage,status:'SUBMITTED',workflowStage});
 input.push({...base,id:'valid',status:'REVIEWED',workflowStage:'VALID',currentReview:{result:'VALID'},creditedDurationSeconds:1800});
 const rows=mapSubmittedRecords(input);assert.equal(rows.length,5);assert.ok(rows.slice(0,4).every(r=>r.hours===0));assert.equal(rows.at(-1).hours,0.5);
 assert.ok(rows.slice(0,4).every(r=>!r.teacherPublicFeedback.includes('缺少')));assert.equal(reviewStageFromRecord(rows[0]),REVIEW_STAGES.PendingAiCheck);assert.equal(reviewStageFromRecord(rows[1]),REVIEW_STAGES.PendingTeacherReview);assert.equal(reviewStageFromRecord(rows[2]),REVIEW_STAGES.PendingStudentSupplement);assert.equal(reviewStageFromRecord(rows[3]),REVIEW_STAGES.TechnicalProcessing);
});
