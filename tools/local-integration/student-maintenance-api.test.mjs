import assert from 'node:assert/strict';
import test from 'node:test';
import {getSystemModeStatus,storeAuthSession,clearApiSession} from '../../BNBU-Sports-Web-new/frontend/student/js/api.js';
const announcement={titleZh:'本校维护',titleEn:'School maintenance',bodyZh:'请等待恢复',bodyEn:'Please wait',estimatedRecoveryAt:'2026-09-09T12:00:00Z'};
test('student mode request reads public announcement and preserves notice and recovery facts',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(url,options)=>{assert.equal(String(url),'/api/v1/system-mode/announcement');assert.equal(options.method,'GET');return Response.json({data:{mode:'MAINTENANCE',policyVersion:2,updatedAt:'2026-09-09T10:00:00Z',announcement},meta:{}});};
  const result=await getSystemModeStatus();assert.equal(result.mode,'MAINTENANCE');assert.equal(result.title,announcement.titleZh);assert.equal(result.message,announcement.bodyZh);assert.equal(result.estimatedRecoveryTime,announcement.estimatedRecoveryAt);
 }finally{globalThis.fetch=original;}
});
test('normal mode never retains an old maintenance notice',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>Response.json({data:{mode:'NORMAL',policyVersion:3,updatedAt:'2026-09-09T11:00:00Z',announcement},meta:{}});const result=await getSystemModeStatus();assert.equal(result.mode,'NORMAL');assert.equal(result.title,'');assert.equal(result.message,'');assert.equal(result.estimatedRecoveryTime,null);}finally{globalThis.fetch=original;}
});

test('maintenance countdown uses fresh own paused facts and discards failed or changed-session reads',async()=>{
 const original=globalThis.fetch;
 const login=()=>storeAuthSession({accessToken:'synthetic-access',refreshToken:'synthetic-refresh',accessTokenExpiresAt:new Date(Date.now()+3600000).toISOString(),user:{id:'synthetic-self'}});
 try{
  for(const scenario of [
   {items:[],expected:{kind:'noActiveTask'}},
   {items:[{paused:true,expired:false,remainingSeconds:123}],expected:{kind:'paused',serverConfirmedRemainingSeconds:123}},
   {items:[{paused:false,expired:true,remainingSeconds:0}],expected:{kind:'expiredBeforeMaintenance'}},
   {items:[{paused:false,expired:false,remainingSeconds:999}],expected:{kind:'unavailable'}},
   {items:[{paused:true,expired:false,remainingSeconds:null}],expected:{kind:'unavailable'}},
   {items:[{paused:true,expired:false,remainingSeconds:123},{paused:false,expired:false,remainingSeconds:1}],expected:{kind:'unavailable'}},
   {failure:true,expected:{kind:'unavailable'}},
   {changed:true,items:[{paused:true,expired:false,remainingSeconds:123}],expected:{kind:'unavailable'}},
  ]){
   login();let reads=0;
   globalThis.fetch=async(url)=>{
    if(String(url).endsWith('/system-mode/announcement'))return Response.json({data:{mode:'MAINTENANCE',policyVersion:2,announcement},meta:{}});
    assert.equal(String(url),'/api/v1/student/proof-todos?limit=100');reads++;
    if(scenario.failure)throw new TypeError('Synthetic offline');
    if(scenario.changed)clearApiSession();
    return Response.json({data:{items:scenario.items,nextCursor:null},meta:{}});
   };
   assert.deepEqual((await getSystemModeStatus()).supplementTiming,scenario.expected);assert.equal(reads,1);
  }
 }finally{clearApiSession();globalThis.fetch=original;}
});

test('maintenance presentation does not treat unpaused or null cached seconds as confirmed',async()=>{
 const {resolveMaintenanceTiming}=await import('../../BNBU-Sports-Web-new/frontend/student/js/v81-review.js');
 assert.deepEqual(resolveMaintenanceTiming({mode:'MAINTENANCE'},[{remainingSeconds:3600,paused:false,expired:false}]),{kind:'unavailable'});
 assert.deepEqual(resolveMaintenanceTiming({mode:'MAINTENANCE'},[{remainingSeconds:null,paused:true,expired:false}]),{kind:'unavailable'});
 assert.deepEqual(resolveMaintenanceTiming({mode:'MAINTENANCE',supplementTiming:{kind:'unavailable'}},[{remainingSeconds:3600,paused:true,expired:false}]),{kind:'unavailable'});
});
