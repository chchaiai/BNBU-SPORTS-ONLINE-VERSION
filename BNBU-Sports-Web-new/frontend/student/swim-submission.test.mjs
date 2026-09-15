import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureSwimIntake,swimPhaseError,isRealtimeSwim} from './js/swim-submission.js';
import {ApiError,toUserFacingError} from './js/api.js';
const fail=reason=>new ApiError(422,{code:'VALIDATION_FAILED',details:{reason}});
function fixture(){
 const calls=[],drafts=[{type:'image',swimPhase:'BEFORE'},{type:'image',swimPhase:'AFTER'},{type:'video'}],intent={submitKey:'old'};
 let remote=null;
 return {calls,drafts,intent,record:{id:'record',version:1},fail,
 get:async()=>{if(remote)return remote;throw {status:404};},
 prepare:async d=>{calls.push('prepare');d.pendingUpload||={initiated:{mediaId:String(drafts.indexOf(d))}};},
 accept:async(id,items)=>{calls.push('accept');remote={items};return remote;},
 save:async()=>{calls.push('save');}};
}
test('prepares all IDs before intake, labels video OTHER and locks the accepted batch',async()=>{
 const f=fixture();await ensureSwimIntake(f);
 assert.equal(f.calls.filter(x=>x==='prepare').length,3);
 assert.ok(f.calls.lastIndexOf('prepare')<f.calls.indexOf('accept'));
 assert.ok(f.drafts.every(d=>d.swimLocked));assert.equal(f.drafts[2].swimPhase,'OTHER');assert.notEqual(f.intent.submitKey,'old');
 const key=f.intent.submitKey;await ensureSwimIntake(f);assert.equal(f.calls.filter(x=>x==='accept').length,1);assert.equal(f.intent.submitKey,key);
});
test('lost acceptance response keeps files locked and reconciles on retry',async()=>{
 const f=fixture(),accept=f.accept;f.accept=async(...args)=>{await accept(...args);throw new Error('lost');};
 await assert.rejects(ensureSwimIntake(f));assert.ok(f.drafts.every(d=>d.swimLocked));
 await ensureSwimIntake(f);assert.equal(f.intent.swimAccepted,true);assert.equal(f.calls.filter(x=>x==='accept').length,1);
});
test('delay correction renews only rejected intake identity',async()=>{
 const f=fixture(),accept=f.accept;f.accept=async()=>{throw fail('SWIM_DELAY_REASON_REQUIRED');};
 await assert.rejects(ensureSwimIntake(f));assert.ok(f.drafts.every(d=>!d.swimLocked));
 const key=f.intent.swimKey;f.delayReason='Offline';f.accept=accept;await ensureSwimIntake(f);assert.notEqual(f.intent.swimKey,key);
});
test('missing truthful stages and replacement of locked files are rejected',async()=>{
 const f=fixture();f.drafts[0].swimPhase='';await assert.rejects(ensureSwimIntake(f),e=>e.details.reason==='SWIM_BEFORE_AFTER_REQUIRED');assert.equal(f.calls.length,0);
 f.drafts[0].swimPhase='BEFORE';f.drafts[0].capturedAfterEnd=true;assert.equal(swimPhaseError(f.drafts),'SWIM_ORIGINAL_BEFORE_AFTER_REQUIRED');
 delete f.drafts[0].capturedAfterEnd;await ensureSwimIntake(f);f.drafts.pop();await assert.rejects(ensureSwimIntake(f),e=>e.details.reason==='SWIM_LOCKED_BATCH_MISMATCH');
});
test('historical swimming and non-swimming do not use realtime intake',()=>{
 assert.equal(isRealtimeSwim({details:{sportType:'SWIMMING'}}),true);
 assert.equal(isRealtimeSwim({details:{sportType:'swimming'}}),true);
 assert.equal(isRealtimeSwim({recordOrigin:'HISTORICAL',details:{sportType:'SWIMMING'}}),false);
 assert.equal(isRealtimeSwim({details:{sportType:'RUNNING'}}),false);
});
test('safe swimming reasons replace misleading field-format guidance',()=>{
 for(const reason of ['SWIM_INTAKE_REQUIRED','SWIM_BEFORE_AFTER_REQUIRED','SWIM_ORIGINAL_BEFORE_AFTER_REQUIRED','SWIM_LOCKED_BATCH_MISMATCH','SWIM_LOCKED_CONTENT_MISMATCH','SWIM_DELAY_REASON_REQUIRED','SWIM_DELAY_WINDOW_EXPIRED','LOCKED_BATCH_CONTENT_HASH_REQUIRED']){
 const model=toUserFacingError(fail(reason),{log:false});assert.doesNotMatch(model.message,/资料格式不正确/);assert.doesNotMatch(model.action,/标记的字段/);assert.ok(model.message);}
 for(const reason of ['private-value','toString','constructor']){const model=toUserFacingError(fail(reason),{log:false});assert.equal(typeof model.message,'string');assert.ok(!JSON.stringify(model).includes(reason));}
});

import {saveSession} from './js/session.js';
import {emptyWorkspace} from './js/data.js';
import {renderCheckIn} from './js/screens/checkin.js';
test('finished lower-case swimming session renders truthful photo controls and delay reason',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
 const workspace=emptyWorkspace();workspace.student.id='synthetic';workspace.creditPolicy={minCreditThresholdMinutes:1};
 saveSession('synthetic',{phase:'finished',details:{sportType:'swimming',creditType:'general',description:'Synthetic'},startedAt:Date.now()-60000,endedAt:Date.now(),activeDurationMillis:60000});
 const app={ui:{},overlay:{},state:{workspace},isWriteAllowed:()=>true,isApiMode:()=>true};
 renderCheckIn(app);app.ui.checkin.drafts=[{id:'before',type:'image',url:'data:image/png;base64,AA==',byteCount:2},{id:'after',type:'image',url:'data:image/png;base64,AA==',byteCount:2,capturedAfterEnd:true}];
 const html=renderCheckIn(app);assert.equal((html.match(/data-change="checkin.swimPhase"/g)||[]).length,2);assert.match(html,/checkin.swimDelay/);assert.match(html,/运动前后照片各至少/);
});

import {uploadMediaDraft,storeAuthSession,clearApiSession} from './js/api.js';
test('media preparation sends only metadata and uploads the same locked ID after intake',async()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
 storeAuthSession({sessionId:'test',accessToken:'test-access',refreshToken:'test-refresh',tokenType:'Bearer',accessTokenExpiresAt:'2099-01-01T00:00:00Z',refreshTokenExpiresAt:'2099-02-01T00:00:00Z',user:{id:'test',role:'STUDENT',status:'ACTIVE',version:1}});
 const previous=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,init={})=>{
  calls.push([String(url),init.method]);
  if(String(url).endsWith('/media-uploads'))return Response.json({data:{mediaId:'media',uploadSessionId:'upload',uploadUrl:'http://localhost:9000/bucket/proof.png',requiredHeaders:{},uploadMethod:'PUT'}});
  if(init.method==='PUT')return new Response(null,{headers:{ETag:'"synthetic"'}});
  if(String(url).endsWith('/confirm'))return Response.json({data:{version:2}});
  if(String(url).endsWith('/bind'))return Response.json({data:{}});
  if(String(url).endsWith('/media/media'))return Response.json({data:{id:'media',uploadStatus:'AVAILABLE'}});
  throw new Error('Unexpected path');
 };
 try{
  const blob=new Blob(['synthetic-image'],{type:'image/png'}),draft={type:'image',mimeType:'image/png'};
  assert.equal((await uploadMediaDraft('session',draft,blob,{prepareOnly:true})).mediaId,'media');
  assert.equal(calls.length,1);assert.equal(calls[0][1],'POST');draft.swimLocked=true;
  assert.equal((await uploadMediaDraft('session',draft,blob)).mediaId,'media');assert.equal(calls.filter(c=>c[0].endsWith('/media-uploads')).length,1);assert.equal(calls.filter(c=>c[1]==='PUT').length,1);
 }finally{globalThis.fetch=previous;clearApiSession();}
});
