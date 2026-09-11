import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadFinalGradeIntents} from '../../BNBU-Sports-Web-new/portal-teacher-admin/app/final-grade-intents.ts';
const enrollment='00000000-0000-4000-8000-000000000001';
const intent={key:'00000000-0000-4000-8000-000000000002',input:{finalGrade:123,published:false,expectedVersion:4}};
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
test('correction reason and publication state survive refresh and malformed correction is blocked',()=>{
 const s=storage(),pending=loadFinalGradeIntents('teacher-a',s),correction={...intent,input:{...intent.input,published:true,correctionReason:'Correct original fact'}};
 pending.current.set(enrollment,correction);pending.save();assert.deepEqual(loadFinalGradeIntents('teacher-a',s).current.get(enrollment),correction);
 for(const correctionReason of ['', ' ', 42, 'x'.repeat(1001)]){
  s.setItem('bnbu-final-grade-pending-v1:teacher-a',JSON.stringify([[enrollment,{...correction,input:{...correction.input,correctionReason}}]]));
  assert.ok(loadFinalGradeIntents('teacher-a',s).error);
 }
});
test('refresh and same-user reentry restore exact intent, other actor cannot read it',()=>{
 const s=storage(),first=loadFinalGradeIntents('teacher-a',s);first.current.set(enrollment,intent);first.save();
 assert.deepEqual(loadFinalGradeIntents('teacher-a',s).current.get(enrollment),intent);
 assert.equal(loadFinalGradeIntents('teacher-b',s).current.size,0);
 const recovered=loadFinalGradeIntents('teacher-a',s);recovered.current.delete(enrollment);recovered.save();
 assert.equal(loadFinalGradeIntents('teacher-a',s).current.size,0);
});
test('malformed pending state is retained and blocks writes',()=>{
 for(const raw of ['bad-json','{}',JSON.stringify([[enrollment,{...intent,input:{...intent.input,expectedVersion:-1}}]]),JSON.stringify([[enrollment,intent],[enrollment,intent]])]){
  const s=storage();s.setItem('bnbu-final-grade-pending-v1:teacher-a',raw);
  const recovered=loadFinalGradeIntents('teacher-a',s);assert.ok(recovered.error);assert.throws(()=>recovered.save());
  assert.equal(s.getItem('bnbu-final-grade-pending-v1:teacher-a'),raw);
 }
});
test('unavailable storage or identity cannot silently discard retry state',()=>{
 assert.throws(()=>loadFinalGradeIntents(null,storage()).save());
 const s=storage();s.setItem=()=>{throw new Error('quota');};
 const pending=loadFinalGradeIntents('teacher-a',s);pending.current.set(enrollment,intent);assert.throws(()=>pending.save(),/quota/);
 assert.deepEqual(pending.current.get(enrollment),intent);
});
