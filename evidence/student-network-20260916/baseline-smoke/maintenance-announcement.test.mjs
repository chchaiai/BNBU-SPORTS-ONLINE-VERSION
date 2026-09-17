import test from 'node:test';
import assert from 'node:assert/strict';
import {getSystemModeStatus,storeAuthSession,clearApiSession,hasApiSession} from './js/api.js';
test('maintenance announcement renders before a delayed supplementary-task response',async()=>{
 const original=globalThis.fetch;let release,announced;
 storeAuthSession({sessionId:'test',accessToken:'test',refreshToken:'test',accessTokenExpiresAt:new Date(Date.now()+600000).toISOString(),refreshTokenExpiresAt:new Date(Date.now()+3600000).toISOString(),user:{id:'test'}});
 assert.equal(hasApiSession(),true);
 globalThis.fetch=async url=>{
   if(String(url).endsWith('/system-mode/announcement')) return Response.json({data:{mode:'MAINTENANCE',policyVersion:1,announcement:{titleZh:'本次维护',bodyZh:'维护详情',estimatedRecoveryAt:'2026-09-16T01:00:00Z'}}});
   return new Promise(resolve=>{release=()=>resolve(Response.json({data:{items:[],nextCursor:null}}));});
 };
 try {
   let done=false;const pending=getSystemModeStatus(status=>announced=status).then(result=>{done=true;return result;});
   for(let i=0;i<20&&!release;i++)await new Promise(resolve=>setImmediate(resolve));
   assert.ok(release);assert.equal(done,false);assert.equal(announced.title,'本次维护');assert.equal(announced.message,'维护详情');
   release();assert.equal((await pending).supplementTiming.kind,'noActiveTask');
 } finally {release?.();globalThis.fetch=original;clearApiSession();}
});
