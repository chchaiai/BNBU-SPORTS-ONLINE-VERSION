import assert from 'node:assert/strict';
import test from 'node:test';
import {loadSubmittedCheckins} from '../app/teacher-data.ts';
test('retired history is excluded before fetching detail; empty workspace does not fetch records',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async url=>{calls.push(String(url));assert.match(String(url),/\/exercise-records\?/);return Response.json({data:{items:[{id:'retired-record',classSectionId:'retired',studentId:'same-student',status:'REVIEWED'},{id:'draft',classSectionId:'visible',studentId:'same-student',status:'DRAFT'}],nextCursor:null}});};
 try{assert.deepEqual(await loadSubmittedCheckins([]),[]);assert.equal(calls.length,0);assert.deepEqual(await loadSubmittedCheckins(['visible']),[]);assert.equal(calls.length,1);}finally{globalThis.fetch=original;}
});

test('visible submitted record still loads while retired record for the same student is excluded',async()=>{
 const original=globalThis.fetch;const calls=[];
 const visible={id:'current',classSectionId:'visible',studentId:'same-student',status:'SUBMITTED',workflowStage:'PENDING_TEACHER',sportType:'RUNNING',actualDurationSeconds:60,creditedDurationSeconds:0};
 globalThis.fetch=async url=>{url=String(url);calls.push(url);assert.ok(!url.includes('/retired-record'));
  const data=url.endsWith('/evidence-context')?{mediaIds:['proof']}:url.includes('/reviews?')?[]:url.includes('/exercise-records?')?{items:[{...visible,id:'retired-record',classSectionId:'retired'},visible],nextCursor:null}:visible;
  return Response.json({data});};
 try{const rows=await loadSubmittedCheckins(['visible']);assert.equal(rows.length,1);assert.equal(rows[0].id,'current');assert.deepEqual(rows[0].mediaIds,['proof']);assert.equal(calls.length,4);}finally{globalThis.fetch=original;}
});
