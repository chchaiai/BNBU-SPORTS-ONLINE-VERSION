import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const response=await page.goto('https://www.student.bnbusports.cn/student/');assert.equal(response.status(),200);
 await page.getByRole('button',{name:'同意并继续',exact:true}).waitFor();
 const encoded=fs.readFileSync('backend/test/fixtures/v81-media/media-recorder-fragmented.mp4').toString('base64');
 const result=await page.evaluate(async encoded=>{
  const {normalizeRecordedVideo}=await import('/student/js/recorded-video.js');
  const source=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  const started=performance.now();
  const output=await normalizeRecordedVideo(new File([source],'synthetic.mp4',{type:'video/mp4'}));
  const video=document.createElement('video');video.muted=true;video.playsInline=true;video.src=URL.createObjectURL(output.file);document.body.append(video);
  await video.play();await new Promise(resolve=>setTimeout(resolve,350));
  const playback=video.currentTime>0&&video.videoWidth>0;video.pause();URL.revokeObjectURL(video.src);video.remove();
  return {duration:output.preview.durationSeconds,bytes:output.file.size,poster:output.preview.thumbnailUrl.startsWith('data:image/jpeg;base64,'),playback,elapsedMs:Math.round(performance.now()-started)};
 },encoded);
 assert.equal(result.playback,true);assert.equal(result.poster,true);assert.deepEqual(errors,[]);
 const wasm=await page.request.head('https://www.student.bnbusports.cn/student/vendor/ffmpeg/core/ffmpeg-core.wasm?v=9f57947a5bd5-iphone-20260915');
 assert.equal(wasm.headers()['content-type'],'application/wasm');
 await page.screenshot({path:'evidence/iphone-video-20260915/live-entry.png'});
 const evidence={result:'PASS',scope:'Production public code and real desktop browser Worker; synthetic video, no account login or submission; physical iPhone pending',...result,wasmContentType:wasm.headers()['content-type'],pageErrors:errors};
 fs.writeFileSync('evidence/iphone-video-20260915/live-browser.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser.close();}
