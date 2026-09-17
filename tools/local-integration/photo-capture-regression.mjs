import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium,webkit} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const base=process.argv[2]||'http://127.0.0.1:53000';const checks=[];
for(const [engine,launcher,options]of [['chromium',chromium,{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}],['webkit',webkit,{}]]){
 const browser=await launcher.launch({...options,headless:true});
 try{const page=await browser.newPage();await page.goto(base+'/student/');
 const result=await page.evaluate(async()=>{
  const originals=await import('/student/js/photo-originals.js'),drafts=await import('/student/js/checkin-drafts.js'),screen=await import('/student/js/screens/checkin.js');
  const owner='synthetic-photo-'+crypto.randomUUID();const app={state:{workspace:{student:{id:owner},proofTodos:[]}},ui:{},render(){}};
  const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;canvas.getContext('2d').fillRect(0,0,1920,1080);
  const file=new File([await new Promise(r=>canvas.toBlob(r,'image/jpeg',.9))],'live_photo_regression.jpg',{type:'image/jpeg'});
  await screen.addDraftFromFile(app,file,'image');
  if(app.ui.checkin.captureError)throw Error(app.ui.checkin.captureError);
  if(app.ui.checkin.drafts.length!==1)throw Error('Photo draft missing');
  const rows=await originals.listPhotoOriginals(owner);if(rows.length!==1)throw Error('Original missing');
  const bytes=new Uint8Array(await file.arrayBuffer()),saved=new Uint8Array(await rows[0].blob.arrayBuffer());
  if(bytes.length!==saved.length||!bytes.every((v,i)=>v===saved[i]))throw Error('Original bytes changed');
  const proof=await drafts.loadProofDrafts(owner,'pending');if(proof.length!==1||proof[0].blob.type!=='image/jpeg')throw Error('Durable JPEG missing');
  const put=IDBObjectStore.prototype.put;
  try{IDBObjectStore.prototype.put=function(){throw new DOMException('Synthetic full storage','QuotaExceededError');};await screen.addDraftFromFile(app,file,'image');}
  finally{IDBObjectStore.prototype.put=put;}
  if(!app.ui.checkin.captureError.includes('本机')||app.ui.checkin.captureError.includes('转换'))throw Error('Storage failure incorrectly reported');
  if(app.ui.checkin.drafts.length!==1)throw Error('Failed save added a draft');
  localStorage.setItem('photo-regression-owner',owner);
  return {bytes:bytes.length,originalExact:true,durableDraft:true,storageFailureDistinct:true};
 });
 if(engine==='chromium'){
  result.legacyBlobReadable=await page.evaluate(async()=>{
   const owner='synthetic-legacy-photo',id='legacy',bytes=new Uint8Array([1,2,3]);
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('bnbu.student.photo-originals',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put({key:[owner,id],owner,id,blob:new Blob([bytes],{type:'image/jpeg'}),name:'legacy.jpg'});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
   const m=await import('/student/js/photo-originals.js'),rows=await m.listPhotoOriginals(owner);
   const valid=rows.length===1&&rows[0].name==='legacy.jpg'&&(new Uint8Array(await rows[0].blob.arrayBuffer())).join(',')==='1,2,3';await m.removePhotoOriginal(owner,id);return valid;
  });assert.equal(result.legacyBlobReadable,true);
 }
 await page.reload();
 const afterReload=await page.evaluate(async()=>{const owner=localStorage.getItem('photo-regression-owner');const o=await import('/student/js/photo-originals.js'),d=await import('/student/js/checkin-drafts.js');const rows=await o.listPhotoOriginals(owner),proofs=await d.loadProofDrafts(owner,'pending');const result=rows.length===1&&proofs.length===1&&rows[0].blob.size>0;for(const row of rows)await o.removePhotoOriginal(owner,row.id);await d.clearProofDrafts(owner);localStorage.removeItem('photo-regression-owner');return result;});assert.equal(afterReload,true);
 checks.push({engine,...result,reloadRestores:true});
 }finally{await browser.close();}
}
await fs.writeFile('evidence/photo-capture-20260916/'+(base.startsWith('https:')?'online':'local')+'-browser.json',JSON.stringify({result:'PASS',base,checks},null,2));console.log(JSON.stringify(checks));
