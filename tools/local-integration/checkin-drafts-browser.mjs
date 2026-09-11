import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4274/student/');
 const result=await page.evaluate(async()=>{
  const api=await import('/student/js/checkin-drafts.js');
  const draft={id:'test-proof',type:'image',blob:new Blob(['synthetic durable proof'],{type:'image/jpeg'}),url:'blob:expired',thumbnailUrl:null};
  await api.saveProofDraft('synthetic-owner-A','session-1',draft);await api.saveProofDraft('synthetic-owner-B','session-1',draft);
  const same=await api.loadProofDrafts('synthetic-owner-A','session-1'),wrong=await api.loadProofDrafts('synthetic-owner-A','session-2');
  const bytes=await same[0].blob.text();same.forEach(d=>URL.revokeObjectURL(d.url));
  const original=IDBDatabase.prototype.transaction;let rejected=false;
  IDBDatabase.prototype.transaction=function(names,mode){if(mode==='readwrite')throw new DOMException('Synthetic full disk','QuotaExceededError');return original.call(this,names,mode);};
  try{await api.saveProofDraft('synthetic-owner-A','session-1',{...draft,id:'failed'});}catch{rejected=true;}finally{IDBDatabase.prototype.transaction=original;}
  await api.removeProofDraft('synthetic-owner-A','session-1','test-proof');const removed=await api.loadProofDrafts('synthetic-owner-A','session-1'),other=await api.loadProofDrafts('synthetic-owner-B','session-1');other.forEach(d=>URL.revokeObjectURL(d.url));
  await api.clearProofDrafts('synthetic-owner-B');return{bytes,wrong:wrong.length,rejected,removed:removed.length,other:other.length};
 });
 assert.deepEqual(result,{bytes:'synthetic durable proof',wrong:0,rejected:true,removed:0,other:1});console.log(JSON.stringify({check:'DURABLE_PROOF_BYTES_OWNER_SESSION_ISOLATION_REMOVAL_QUOTA',result:'PASS'}));
}finally{await browser.close();}
