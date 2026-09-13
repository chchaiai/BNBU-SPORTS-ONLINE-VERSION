import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
 const page=await browser.newPage();
 const requests=[];page.on('request',r=>requests.push(r.url()));
 await page.goto('http://127.0.0.1:4274/student/');
 const result=await page.evaluate(async sourceMs=>{
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
  const ctx=canvas.getContext('2d');let frame=0;
  const draw=()=>{ctx.fillStyle='#2167a8';ctx.fillRect(0,0,640,360);ctx.fillStyle='white';ctx.font='30px sans-serif';ctx.fillText('Synthetic video '+frame++,30,120);};draw();
  const stream=canvas.captureStream(30),audio=new AudioContext();await audio.resume();
  const oscillator=audio.createOscillator(),destination=audio.createMediaStreamDestination();oscillator.connect(destination);oscillator.start();destination.stream.getTracks().forEach(t=>stream.addTrack(t));
  const recorder=new MediaRecorder(stream,{mimeType:'video/mp4;codecs=avc1,mp4a.40.2'}),chunks=[];
  recorder.ondataavailable=e=>chunks.push(e.data);const stopped=new Promise(r=>recorder.onstop=r);
  const interval=setInterval(draw,33);recorder.start();await new Promise(r=>setTimeout(r,sourceMs));recorder.stop();await stopped;
  clearInterval(interval);stream.getTracks().forEach(t=>t.stop());oscillator.stop();await audio.close();
  const raw=new File(chunks,'native.mp4',{type:recorder.mimeType});
  const started=performance.now();const {normalizeRecordedVideo}=await import('/student/js/recorded-video.js');
  const normalized=await normalizeRecordedVideo(raw);
  const audioCheck=new AudioContext();
  const decoded=await audioCheck.decodeAudioData(await normalized.arrayBuffer());
  const samples=decoded.getChannelData(0);let energy=0;for(const sample of samples)energy+=sample*sample;
  const audioRms=Math.sqrt(energy/samples.length);await audioCheck.close();
  const video=document.createElement('video');video.muted=true;video.playsInline=true;video.src=URL.createObjectURL(normalized);document.body.append(video);await video.play();await new Promise(r=>setTimeout(r,300));
  const result={sourceBytes:raw.size,bytes:normalized.size,elapsedMs:performance.now()-started,width:video.videoWidth,height:video.videoHeight,duration:video.duration,time:video.currentTime,error:video.error?.code??null,base64:await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(normalized);})};
  video.pause();return {...result,audioRms};
 },Number(process.env.BUG_VIDEO_MS||2100));
 const {base64,...facts}=result;fs.writeFileSync(process.env.BUG_VIDEO_OUTPUT||'.local/bug-20260912-video.mp4',Buffer.from(base64,'base64'));
 assert.ok(facts.width>0&&facts.height>0&&facts.time>0&&!facts.error);
 assert.ok(facts.audioRms>0.01,'Original sound must survive local compression');
 assert.equal(requests.filter(url=>url.includes('ffmpeg')).length,0,'Common MP4 encoding must not download WASM');
 console.log(JSON.stringify({check:'NATIVE_LOCAL_ENCODING_AND_PLAYBACK',result:'PASS',...facts,wasmRequests:0}));
} finally {await browser.close();}
