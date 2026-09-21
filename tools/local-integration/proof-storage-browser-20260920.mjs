import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const root=path.resolve('.local/proof-storage-20260920'),out=path.resolve('evidence/proof-storage-20260920');
const server=http.createServer(async(req,res)=>{
  try {
    const pathname=new URL(req.url,'http://local').pathname;
    if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Proof storage regression</title>');return;}
    const file=path.resolve(root,'.'+pathname);assert.ok(file.startsWith(root+path.sep));
    let body=await fs.readFile(file);
    if(pathname.endsWith('/screens/checkin.js'))body=Buffer.concat([body,Buffer.from('\nexport {submitCheckInApi as testSubmit};')]);
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(body);
  }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const results=[];
async function scenario(name,fn){const page=await browser.newPage();try{await page.goto('http://127.0.0.1:'+server.address().port);const result=await page.evaluate(fn);results.push({name,...result});console.log(name,JSON.stringify(result));}finally{await page.close();}}
try{
await scenario('real IndexedDB save/reload and closed-connection retry',async()=>{
 const {saveProofDraft,loadProofDrafts}=await import('/student/js/checkin-drafts.js');
 const draft={id:'a',type:'video',blob:new Blob(['synthetic-video'],{type:'video/mp4'})};
 await saveProofDraft('owner','scope',draft);
 let rows=await loadProofDrafts('owner','scope');if(await rows[0].blob.text()!=='synthetic-video')throw Error('bytes lost');
 const original=IDBDatabase.prototype.transaction;let injected=0;
 IDBDatabase.prototype.transaction=function(...args){if(injected++===0)throw new DOMException('closed','InvalidStateError');return original.apply(this,args);};
 try{await saveProofDraft('owner','scope',{...draft,pendingUpload:{bound:true}});}finally{IDBDatabase.prototype.transaction=original;}
 rows=await loadProofDrafts('owner','scope');if(!rows[0].pendingUpload.bound)throw Error('checkpoint lost');
 return {pass:true,reopened:injected>=2};
});
await scenario('quota failure keeps cause and blocks local-only evidence',async()=>{
 const {saveProofDraft}=await import('/student/js/checkin-drafts.js');const {toUserFacingError}=await import('/student/js/api.js');
 IDBObjectStore.prototype.put=function(){throw new DOMException('full','QuotaExceededError');};
 let caught;try{await saveProofDraft('owner','scope',{id:'a',blob:new Blob(['x'])});}catch(e){caught=e;}
 const model=toUserFacingError(caught,{log:false});if(caught?.cause?.name!=='QuotaExceededError'||model.code!=='LOCAL_PROOF_STORAGE_FULL'||!model.retryable)throw Error('wrong storage diagnostic');
 await saveProofDraft('owner','scope',{id:'verified',mediaId:'available-media'});
 return {pass:true,code:model.code,verifiedEvidenceBypassesLocalWrite:true};
});
await scenario('verified video submits while every local database open fails; reload recovery works',async()=>{
 const {testSubmit,restoreCheckinContinuity}=await import('/student/js/screens/checkin.js');const {saveSession,loadSession}=await import('/student/js/session.js');
 const session={phase:'finished',serverId:'session',startedAt:Date.now()-3600000,endedAt:Date.now(),activeDurationMillis:3600000,details:{description:'synthetic',creditType:'general',sportType:'running'}};
 const app={state:{authenticated:true,workspace:{student:{id:'owner'},courses:[]}},ui:{checkin:{drafts:[],finish:{}}},render(){},isApiMode(){return true;},showDialog(d){throw Error('unexpected dialog '+d.title);},reloadApiWorkspace(){}};
 let submitted=0;const originalFetch=window.fetch;window.fetch=async(url,input={})=>{
  const p=String(url);if(!p.includes('/api/'))return originalFetch(url,input);
  if(p.includes('/exercise-records?'))return Response.json({data:[{id:'record',sessionId:'session',status:'DRAFT',version:1,description:'synthetic'}],meta:{pagination:{nextCursor:null}}});
  if(p.endsWith('/evidence-context'))return Response.json({data:{sessionId:'session',mediaIds:['media']}});
  if(p.endsWith('/media/media'))return Response.json({data:{id:'media',sessionId:'session',mediaType:'VIDEO',businessPurpose:'EXERCISE_RECORD',uploadStatus:'AVAILABLE'}});
  if(p.endsWith('/submit')){if(JSON.parse(input.body).mediaIds.join()!=='media')throw Error('wrong media');submitted++;return Response.json({data:{id:'record',creditedDurationSeconds:3600}});}
  throw Error('unexpected API '+p);
 };
 Object.defineProperty(window,'indexedDB',{value:{open(){const r={};queueMicrotask(()=>{r.error=new DOMException('closed','InvalidStateError');r.onerror();});return r;}}});
 saveSession('owner',session);await restoreCheckinContinuity(app);
 if(app.ui.checkin.drafts.length!==1||!app.ui.checkin.drafts[0].serverOnly)throw Error('server recovery failed '+JSON.stringify({ui:app.ui.checkin,session:loadSession('owner')}));
 await testSubmit(app,session,app.ui.checkin.drafts);
 if(submitted!==1||loadSession('owner').phase!=='submitted')throw Error('not submitted');
 // Retained local draft with an acknowledged mediaId must also bypass storage.
 saveSession('owner',session);app.ui.checkin.drafts=[{id:'local',mediaId:'media',type:'video',blob:new Blob(['video'])}];
 await testSubmit(app,session,app.ui.checkin.drafts);if(submitted!==2)throw Error('verified local draft blocked');
 return {pass:true,submissions:submitted,serverRecovery:true};
});
await fs.writeFile(out+'/browser.json',JSON.stringify({result:'PASS',scenarios:results,scope:'Local Chromium with synthetic media and mocked API; no real student writes or physical-phone acceptance'},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
