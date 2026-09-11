import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadRuntimeArchiveIntent} from '../../BNBU-Sports-Web-new/portal-teacher-admin/app/runtime-archive-intent.ts';
const intent={key:'00000000-0000-4000-8000-000000000001',filters:{startDate:'2026-09-09',endDate:'2026-09-09'}};
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
test('restore original request for same identity, isolate others and clear confirmed download',()=>{
 const s=storage(),first=loadRuntimeArchiveIntent('a',s);first.save(intent);
 assert.deepEqual(loadRuntimeArchiveIntent('a',s).current,intent);
 assert.equal(loadRuntimeArchiveIntent('b',s).current,null);
 loadRuntimeArchiveIntent('a',s).save(null);assert.equal(loadRuntimeArchiveIntent('a',s).current,null);
});
test('corrupt state is retained and blocks replacement',()=>{
 for(const raw of ['bad','{}',JSON.stringify({...intent,key:'bad'})]){
  const s=storage();s.setItem('bnbu-runtime-archive-pending-v1:a',raw);
  const recovered=loadRuntimeArchiveIntent('a',s);assert.ok(recovered.error);assert.throws(()=>recovered.save(intent));
  assert.equal(s.getItem('bnbu-runtime-archive-pending-v1:a'),raw);
 }
});
test('missing identity and storage write failure prevent a new intent',()=>{
 assert.throws(()=>loadRuntimeArchiveIntent(null,storage()).save(intent));
 const s=storage();s.setItem=()=>{throw new Error('quota');};
 const pending=loadRuntimeArchiveIntent('a',s);assert.throws(()=>pending.save(intent),/quota/);assert.equal(pending.current,null);
});
