import fs from 'node:fs';
import assert from 'node:assert/strict';
import {webkit,firefox} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
for (const [engine,type] of Object.entries({webkit,firefox})) {
 const browser=await type.launch({headless:true});
 try {
  const page=await browser.newPage();await page.goto('http://127.0.0.1:4274/student/');
  if (!await page.evaluate(()=>typeof document.createElement('canvas').captureStream==='function')) {
   const evidence={engine,result:'PENDING',reason:'This browser build cannot generate a synthetic canvas recording; native camera recording needs a device test.'};
   fs.writeFileSync(`.local/bug-20260912-cross-browser/${engine}-video.json`,JSON.stringify(evidence,null,2)+'\n');
   console.log(JSON.stringify(evidence));continue;
  }
  const result=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;const ctx=canvas.getContext('2d');let frame=0;
   const draw=()=>{ctx.fillStyle='#1766b3';ctx.fillRect(0,0,320,240);ctx.fillStyle='white';ctx.font='24px sans-serif';ctx.fillText('Synthetic '+frame++,20,120);};draw();
   const stream=canvas.captureStream(12);
   const audio=new AudioContext();await audio.resume();const tone=audio.createOscillator(),gain=audio.createGain(),destination=audio.createMediaStreamDestination();gain.gain.value=0.01;tone.connect(gain);gain.connect(destination);tone.start();
   destination.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
   const mime=['video/mp4','video/webm;codecs=vp8,opus','video/webm'].find(value=>MediaRecorder.isTypeSupported(value));
   const chunks=[],recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
   recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
   const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=reject;});
   const interval=setInterval(draw,80);recorder.start(250);await new Promise(resolve=>setTimeout(resolve,1600));recorder.stop();await stopped;clearInterval(interval);stream.getTracks().forEach(track=>track.stop());tone.stop();await audio.close();
   const raw=new File(chunks,'capture',{type:recorder.mimeType});
   const {normalizeRecordedVideo}=await import('/student/js/recorded-video.js');const file=await normalizeRecordedVideo(raw);
   const video=document.createElement('video');video.muted=true;video.playsInline=true;video.controls=true;video.src=URL.createObjectURL(file);document.body.append(video);await video.play();await new Promise(resolve=>setTimeout(resolve,400));video.pause();
   return {sourceMime:raw.type,outputMime:file.type,bytes:file.size,width:video.videoWidth,height:video.videoHeight,duration:video.duration,currentTime:video.currentTime,error:video.error?.code??null};
  });
  assert.equal(result.outputMime,'video/mp4');assert.ok(result.width>0&&result.height>0&&result.duration>0&&result.currentTime>0&&!result.error);
  fs.writeFileSync(`.local/bug-20260912-cross-browser/${engine}-video.json`,JSON.stringify({check:'RECORDED_VIDEO_WITH_AUDIO_NORMALIZATION_AND_PLAYBACK',engine,result:'PASS',...result},null,2)+'\n');
  console.log(JSON.stringify({check:'RECORDED_VIDEO_WITH_AUDIO_NORMALIZATION_AND_PLAYBACK',engine,result:'PASS',...result}));
 }finally{await browser.close();}
}
