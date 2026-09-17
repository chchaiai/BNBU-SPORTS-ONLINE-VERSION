import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const root=path.resolve('BNBU-Sports-Web-new/frontend');
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/probe'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Recording regression</title><video data-live-camera-video autoplay muted playsinline></video>');return;}
    const file=path.resolve(root,'.'+url.pathname);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/plain');res.end(await fs.readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
try {
  const context=await browser.newContext({permissions:['camera','microphone']});
  const page=await context.newPage();const errors=[],codecs=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{if(/ffmpeg|\.wasm/.test(req.url()))codecs.push(req.url());});
  await page.goto(`http://127.0.0.1:${server.address().port}/probe`);
  const result=await page.evaluate(async()=>{
    const {checkinActions}=await import('/student/js/screens/checkin.js');
    const app={ui:{},state:{workspace:{student:{id:'synthetic-video-browser'},proofTodos:[]}},_viewport:document.body,render(){},isApiMode(){return false;}};
    checkinActions['checkin.captureVideo'](app);
    const until=async(predicate)=>{const deadline=Date.now()+20000;while(!predicate()){if(Date.now()>deadline)throw Error(JSON.stringify(app.ui.checkin));await new Promise(r=>setTimeout(r,50));}};
    await until(()=>app.ui.checkin.liveCamera.status==='ready');
    checkinActions['checkin.cameraStartVideo'](app);
    await until(()=>app.ui.checkin.drafts.length===1 && app.ui.checkin.mediaNotice?.includes('10'));
    const state=app.ui.checkin,draft=state.drafts[0];
    return {status:state.liveCamera.status,notice:state.mediaNotice,bytes:draft.blob.size,duration:draft.durationSeconds,type:draft.blob.type,pending:!!draft.normalizationPending,error:state.captureError};
  });
  assert.equal(result.status,'idle');assert.equal(result.pending,false);assert.ok(result.bytes>0);assert.equal(result.duration,10);assert.deepEqual(errors,[]);assert.deepEqual(codecs,[]);
  await fs.writeFile('evidence/video-server-20260915/browser.json',JSON.stringify({result:'PASS',...result,pageErrors:errors,codecDownloads:codecs,scope:'Real desktop browser with synthetic camera and microphone; physical phones not tested'},null,2));
  console.log(JSON.stringify(result));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
