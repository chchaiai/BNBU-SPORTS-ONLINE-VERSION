import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const root=path.resolve('BNBU-Sports-Web-new/frontend');
const fixture=path.resolve('backend/test/fixtures/v81-media/media-recorder-fragmented.mp4');
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/probe'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Video regression</title>');return;}
  const file=url.pathname==='/fixture.mp4'?fixture:path.resolve(root,'.'+url.pathname);
  if(file!==fixture&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.js')?'application/javascript':file.endsWith('.mp4')?'video/mp4':'text/html');
  res.end(await fs.readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/probe`);
 const result=await page.evaluate(async()=>{
  const {normalizeRecordedVideo}=await import('/student/js/recorded-video.js');
  const input=new File([await(await fetch('/fixture.mp4')).arrayBuffer()],'source.mp4',{type:'video/mp4'});
  const start=performance.now();const output=await normalizeRecordedVideo(input);
  const video=document.createElement('video');video.muted=true;video.playsInline=true;video.src=URL.createObjectURL(output.file);document.body.append(video);
  await video.play();await new Promise(resolve=>setTimeout(resolve,300));
  if(!(video.currentTime>0&&video.videoWidth>0))throw new Error('Final video playback failed');
  video.pause();URL.revokeObjectURL(video.src);
  const store=await import('/student/js/checkin-drafts.js');
  const draft={id:'test',blob:input,type:'video',mimeType:'video/mp4',normalizationPending:true};
  await store.saveProofDraft('test-owner','test-scope',draft);
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('bnbu.student.web.checkin-drafts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const stored=await new Promise((resolve,reject)=>{const r=db.transaction('proofs').objectStore('proofs').get(['test-owner','test-scope','test']);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  if(!(stored.fileBytes instanceof ArrayBuffer)||stored.blob)throw new Error('Raw Blob was stored');
  const digest=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).join(',');
  const restored=await store.loadProofDrafts('test-owner','test-scope');
  if(await digest(restored[0].blob)!==await digest(input))throw new Error('Restored bytes differ');
  // Cover an old-format draft without changing the database version.
  await new Promise((resolve,reject)=>{const tx=db.transaction('proofs','readwrite');tx.objectStore('proofs').put({key:['legacy','scope','old'],owner:'legacy',scope:'scope',id:'old',blob:input});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  const legacy=await store.loadProofDrafts('legacy','scope');if(await digest(legacy[0].blob)!==await digest(input))throw new Error('Legacy restoration failed');
  const saving=store.saveProofDraft('race','scope',draft);const removing=store.clearProofDrafts('race','scope');await Promise.all([saving,removing]);
  if((await store.loadProofDrafts('race','scope')).length)throw new Error('Deleted draft returned');
  return {result:'PASS',worker:'real browser Worker',playback:true,duration:output.preview.durationSeconds,elapsedMs:Math.round(performance.now()-start),bytePersistence:true,legacyDraft:true,deleteDuringSave:true};
 });
 await page.reload();
 const restoredAfterReload=await page.evaluate(async()=>{const store=await import('/student/js/checkin-drafts.js');const drafts=await store.loadProofDrafts('test-owner','test-scope');return drafts.length===1&&drafts[0].blob.size>0&&drafts[0].normalizationPending;});
 assert.equal(restoredAfterReload,true);
 result.reloadRestoresPending=true;
 await fs.writeFile('evidence/iphone-video-20260915/browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();server.close();}
