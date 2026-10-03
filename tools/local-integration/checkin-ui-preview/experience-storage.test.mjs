import test from 'node:test';
import assert from 'node:assert/strict';
import {experienceRecord,saveExperienceRecord} from './experience-storage.mjs';
import {startSession,pauseSession,resumeSession,sessionDurationMs} from '../../../BNBU-Sports-Web-new/frontend/student/js/session.js';

const drafts=[{id:'photo',type:'image',blob:new Blob(['photo'],{type:'image/jpeg'})},{id:'video',type:'video',blob:new Blob(['video'],{type:'video/mp4'})}];
const input=()=>({session:{phase:'finished',startedAt:1000,endedAt:2101000,activeDurationMillis:2100000,details:{creditType:'general',sportType:'running',description:'完成跑步练习'}},drafts,minimumMinutes:30,sportLabel:'跑步',businessDate:'2026-10-02',submittedAt:'2026-10-02 10:00'});
function fixture() {
  const rows=new Map(),files=new Map(),writes=[];
  const storage={findRecord:async id=>rows.get(id),proofIds:async id=>files.get(id)||[],
    saveProof:async (id,draft)=>{writes.push(draft.id);files.set(id,[...(files.get(id)||[]),draft.id]);},
    commitRecord:async row=>{rows.set(row.id,row);}};
  return {storage,rows,files,writes};
}
test('preview uses actual elapsed time, pauses without drift, and resumes without seeded minutes',()=>{
  const start=startSession({sportType:'running'},1000);
  assert.equal(sessionDurationMs(start,1000),0);
  assert.equal(sessionDurationMs(start,9000),8000);
  const paused=pauseSession(start,10000);
  assert.equal(sessionDurationMs(paused,100000),9000);
  const resumed=resumeSession(JSON.parse(JSON.stringify(paused)),100000);
  assert.equal(sessionDurationMs(resumed,103000),12000);
});
test('local experience enforces minimum time, evidence and description before saving',()=>{
  const args=input();args.session.activeDurationMillis=29999;
  assert.throws(()=>experienceRecord(args),/时长/);
  args.session.activeDurationMillis=2100000;args.drafts=[];
  assert.throws(()=>experienceRecord(args),/凭证/);
  args.drafts=drafts;args.session.details.description=' ';
  assert.throws(()=>experienceRecord(args),/运动说明/);
});
test('new records remain pending with unknown credit and accurate file types',()=>{
  const row=experienceRecord(input());
  assert.equal(row.hours,null);assert.equal(row.creditedWholeMinutes,null);assert.equal(row.reviewResult,null);
  assert.equal(row.enrollmentId,null);assert.equal(row.courseId,null);
  assert.equal(row.proofPhotoCount,1);assert.equal(row.proofVideoCount,1);
  assert.equal(row.serverStatus,'SUBMITTED');assert.equal(row.localPreview,true);
});
test('saving failure leaves completed proofs reusable; retry commits one record after confirmation',async()=>{
  const {storage,rows,writes}=fixture(),record=experienceRecord(input());
  const save=storage.saveProof;let fail=true;
  storage.saveProof=async(id,draft)=>{if(draft.id==='video'&&fail)throw new Error('quota');return save(id,draft);};
  await assert.rejects(saveExperienceRecord({record,drafts,storage}),/quota/);
  assert.equal(rows.size,0);assert.deepEqual(writes,['photo']);
  fail=false;const events=[];
  const result=await saveExperienceRecord({record,drafts,storage,onProgress:state=>events.push(state)});
  assert.equal(result.created,true);assert.equal(rows.size,1);assert.deepEqual(writes,['photo','video']);
  assert.deepEqual(events.at(-1),{phase:'SUBMITTING',draftId:null});
  const duplicate=await saveExperienceRecord({record,drafts,storage});
  assert.equal(duplicate.created,false);assert.equal(rows.size,1);assert.deepEqual(writes,['photo','video']);
});
test('a missing proof read-back or failed record commit cannot report success',async()=>{
  const {storage,rows}=fixture(),record=experienceRecord(input());
  storage.proofIds=async()=>[];
  await assert.rejects(saveExperienceRecord({record,drafts,storage}),/凭证尚未完整/);
  assert.equal(rows.size,0);
  const other=fixture();other.storage.commitRecord=async()=>{throw new Error('storage full');};
  await assert.rejects(saveExperienceRecord({record,drafts,storage:other.storage}),/storage full/);
  assert.equal(other.rows.size,0);
});
