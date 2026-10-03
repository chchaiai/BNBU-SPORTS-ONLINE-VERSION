import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiError} from '../app/api-client.ts';
import {createStudentUpdateBatch,readStudentUpdateBatch,runStudentUpdateBatch} from '../app/student-update-batch.ts';

const owner=crypto.randomUUID(),semester=crypto.randomUUID();
const students=Array.from({length:3},(_,i)=>({id:crypto.randomUUID(),studentNumber:`TEST${i}`,fullName:`Fixture ${i}`,version:7,enrollmentCapacitySemesterId:semester,maximumActiveEnrollments:1}));
const create=(action='profile',rows=students)=>createStudentUpdateBatch(owner,action,rows,' reason ');
const opts=send=>({save(){},changed(){},stopped:()=>false,send});
const success=id=>({id,profileQualityStatus:'REQUIRES_PROFILE_UPDATE'});

test('freezes selected students, versions, reason and independent request keys',()=>{
  const rows=students.map(s=>({...s})),b=create('profile',rows);rows[0].version=99;
  assert.equal(b.items[0].student.version,7);assert.equal(b.reason,'reason');
  assert.equal(new Set(b.items.map(i=>i.key)).size,3);
  assert.throws(()=>createStudentUpdateBatch(owner,'profile',students,' '));
  assert.throws(()=>create('profile',[students[0],students[0]]));
});
test('profile requests are sequential, persisted before dispatch and completed students never replay',async()=>{
  const b=create();let saved,calls=0,active=0,max=0;
  const o=opts(async(id,key,body)=>{
    assert.equal(JSON.parse(saved).items[calls].status,'unconfirmed');
    assert.equal(JSON.parse(saved).items[calls].key,key);
    assert.deepEqual(body,{expectedVersion:7,profileUpdateReason:'reason'});
    calls++;max=Math.max(max,++active);await new Promise(r=>setTimeout(r,1));active--;
    return success(id);
  });o.save=v=>{saved=JSON.stringify(v);};
  await runStudentUpdateBatch(b,o);await runStudentUpdateBatch(b,o);
  assert.equal(calls,3);assert.equal(max,1);assert.ok(b.items.every(i=>i.status==='succeeded'));
});
test('second class skips already enabled and absent semester, using fixed semester and version',async()=>{
  const b=create('second-class',[students[0],{...students[1],maximumActiveEnrollments:2},{...students[2],enrollmentCapacitySemesterId:null}]);let calls=0;
  await runStudentUpdateBatch(b,opts(async(id,key,body)=>{
    calls++;assert.deepEqual(body,{expectedVersion:7,secondClassSemesterId:semester,secondClassReason:'reason'});
    return {id,maximumActiveEnrollments:2,enrollmentCapacitySemesterId:semester};
  }));
  assert.equal(calls,1);assert.deepEqual(b.items.map(i=>i.status),['succeeded','skipped','skipped']);
  assert.deepEqual(b.items.map(i=>i.note),[undefined,'ALREADY_OPEN','NO_SEMESTER']);
});
test('lost response pauses and restores the identical request before continuing',async()=>{
  const b=create();let first,raw;
  const o=opts(async(...args)=>{first=args;throw new TypeError('network');});o.save=v=>{raw=JSON.stringify(v);};
  await runStudentUpdateBatch(b,o);assert.deepEqual(b.items.map(i=>i.status),['unconfirmed','pending','pending']);
  const restored=readStudentUpdateBatch(raw,owner);let count=0;
  await runStudentUpdateBatch(restored,opts(async(...args)=>{if(!count++)assert.deepEqual(args,first);return success(args[0]);}));
  assert.equal(count,3);assert.ok(restored.items.every(i=>i.status==='succeeded'));
});
test('definite version rejection stops, retains success and is not silently retried',async()=>{
  const b=create();let calls=0;
  await runStudentUpdateBatch(b,opts(async id=>{if(++calls===2)throw new ApiError(409,{code:'CONFLICT_VERSION_MISMATCH'});return success(id);}));
  assert.deepEqual(b.items.map(i=>i.status),['succeeded','failed','pending']);
  await runStudentUpdateBatch(b,opts(async id=>{assert.equal(id,students[2].id);return success(id);}));
});
test('in-progress response remains uncertain and no later students are sent',async()=>{
  const b=create();let calls=0;
  await runStudentUpdateBatch(b,opts(async()=>{calls++;throw new ApiError(409,{code:'CONFLICT_REQUEST_IN_PROGRESS'});}));
  assert.equal(calls,1);assert.equal(b.items[0].status,'unconfirmed');
});
test('wrong result or semester never reports success',async()=>{
  for(const [action,result] of [['profile',{id:students[0].id,profileQualityStatus:'NORMAL'}],['second-class',{id:students[0].id,maximumActiveEnrollments:2,enrollmentCapacitySemesterId:'different'}]]){
    const b=create(action);await runStudentUpdateBatch(b,opts(async()=>result));
    assert.deepEqual(b.items.map(i=>i.status),['unconfirmed','pending','pending']);
  }
});
test('stop finishes the current request and leaves later students pending',async()=>{
  const b=create();let stop=false;
  const o=opts(async id=>{stop=true;return success(id);});o.stopped=()=>stop;
  await runStudentUpdateBatch(b,o);assert.deepEqual(b.items.map(i=>i.status),['succeeded','pending','pending']);
});
test('storage failure prevents dispatch',async()=>{
  let sent=false;const o=opts(async id=>{sent=true;return success(id);});o.save=()=>{throw new Error('quota');};
  await assert.rejects(runStudentUpdateBatch(create(),o));assert.equal(sent,false);
});
test('journal refuses other owners and corrupted selections',()=>{
  const b=create(),raw=JSON.stringify(b);assert.deepEqual(readStudentUpdateBatch(raw,owner),JSON.parse(raw));
  assert.throws(()=>readStudentUpdateBatch(raw,'other'));b.items[0].student.version=0;
  assert.throws(()=>readStudentUpdateBatch(JSON.stringify(b),owner));assert.equal(readStudentUpdateBatch(null,owner),null);
});
