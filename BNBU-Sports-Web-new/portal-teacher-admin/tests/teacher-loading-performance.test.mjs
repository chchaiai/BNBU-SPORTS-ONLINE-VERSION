import assert from 'node:assert/strict';
import test from 'node:test';
import { parallelMap } from '../app/parallel-map.ts';
import { loadSubmittedCheckins, loadTeacherCheckinDetail } from '../app/teacher-data.ts';

test('25 review records require one list request; detail preserves evidence and optimistic review version', async () => {
  const original = globalThis.fetch, calls = [];
  const records = Array.from({length:25}, (_, i) => ({id:`record-${i}`, studentId:`student-${i}`, classSectionId:'visible',
    enrollmentId:`enrollment-${i}`, status:'REVIEWED', workflowStage:'VALID', businessDate:'2026-09-30',
    actualDurationSeconds:3600, creditedDurationSeconds:1800, currentReview:{result:'VALID'}, version:3, sportType:'RUNNING'}));
  globalThis.fetch = async url => {
    const route=String(url); calls.push(route);
    const data = route.includes('/evidence-context') ? {recordId:'record-0',mediaIds:['photo'],startedAt:'2026-09-30T01:00:00Z',endedAt:'2026-09-30T02:00:00Z'}
      : route.includes('/reviews?') ? [{reviewVersion:7}] : route.includes('/exercise-records?') ? records : records[0];
    return Response.json({data});
  };
  try {
    const rows=await loadSubmittedCheckins(['visible']);
    assert.equal(rows.length,25); assert.equal(calls.length,1);
    assert.ok(rows.every(row=>row.auditStatus==='valid' && row.creditedMinutes===30 && row.detailsLoaded===false));
    const detail=await loadTeacherCheckinDetail('record-0');
    assert.equal(calls.length,4); assert.equal(detail.reviewVersion,7); assert.deepEqual(detail.mediaIds,['photo']);
    assert.match(detail.startAt,/09:00/); assert.equal(detail.detailsLoaded,true);
  } finally {globalThis.fetch=original;}
});

test('bounded reads keep order and never swallow failures', async () => {
  let active=0,peak=0;
  const rows=await parallelMap(Array.from({length:25},(_,i)=>i), async i=>{
    active++; peak=Math.max(peak,active); await new Promise(resolve=>setTimeout(resolve,2)); active--; return i*2;
  });
  assert.equal(peak,6);assert.deepEqual(rows,Array.from({length:25},(_,i)=>i*2));
  await assert.rejects(parallelMap([1,2],async i=>{if(i===2)throw Error('read failed');return i;}),/read failed/);
});
