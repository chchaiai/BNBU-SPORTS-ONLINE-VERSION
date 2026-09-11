import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoursePublicationIntent} from '../app/course-rules-api.ts';
test('lost window and publication responses reuse independent keys and never repeat confirmed window write',async()=>{
  const windows=[],rules=[];
  const intent=createCoursePublicationIntent('same form',async key=>{windows.push(key);if(windows.length===1)throw new TypeError('lost window response');return {version:2};},
    async key=>{rules.push(key);if(rules.length===1)throw new TypeError('lost publication response');return {published:true};});
  await assert.rejects(intent.run());
  await assert.rejects(intent.run());
  assert.deepEqual(await intent.run(),{version:2});
  assert.equal(windows.length,2);assert.equal(windows[0],windows[1]);
  assert.equal(rules.length,2);assert.equal(rules[0],rules[1]);assert.notEqual(windows[0],rules[0]);
});
test('concurrent saves share the same in-flight operation',async()=>{
  let release,calls=0;
  const wait=new Promise(resolve=>{release=resolve;});
  const intent=createCoursePublicationIntent('same',async()=>{calls++;await wait;return 1;},async()=>{});
  const first=intent.run(),second=intent.run();assert.equal(first,second);release();
  assert.deepEqual(await Promise.all([first,second]),[1,1]);assert.equal(calls,1);
});
