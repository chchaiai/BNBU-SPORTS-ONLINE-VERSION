import assert from 'node:assert/strict';
import test from 'node:test';
const storage=new Map();
globalThis.window={localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
const api=await import('../app/api-client.ts');
const {loadTeacherMedia}=await import('../app/teacher-media-access.ts');
test('media shares concurrent requests, expires, retries and isolates account sessions',async()=>{
 const original=globalThis.fetch,clock=Date.now;let now=clock(),calls=0,deny=false;
 Date.now=()=>now;
 globalThis.fetch=async(input)=>{
  calls++;
  if(deny)return Response.json({code:'FORBIDDEN'},{status:403});
  return Response.json({data:String(input).endsWith('/access-url')?{accessUrl:'https://example.invalid/private',expiresAt:new Date(now+60000).toISOString()}:{id:'media',mediaType:'VIDEO',uploadStatus:'AVAILABLE'}});
 };
 try{
  const results=await Promise.all([loadTeacherMedia('media'),loadTeacherMedia('media')]);assert.equal(calls,2);assert.equal(results[0],results[1]);
  await loadTeacherMedia('media');assert.equal(calls,2);
  now+=31000;await loadTeacherMedia('media');assert.equal(calls,4);
  await loadTeacherMedia('media',true);assert.equal(calls,6);
  api.clearApiSession();await loadTeacherMedia('media');assert.equal(calls,8);
  api.clearApiSession();deny=true;await assert.rejects(loadTeacherMedia('media'));deny=false;await loadTeacherMedia('media');assert.equal(calls,12);
 }finally{globalThis.fetch=original;Date.now=clock;api.clearApiSession();}
});
