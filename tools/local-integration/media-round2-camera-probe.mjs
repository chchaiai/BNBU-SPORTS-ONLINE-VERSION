import assert from 'node:assert/strict';
import fs from 'node:fs';
const directory='.local/media-round2';fs.mkdirSync(directory,{recursive:true});
const targets=await(await fetch('http://127.0.0.1:19222/json/list')).json();
const target=targets.find(item=>item.url.startsWith('http://localhost:4274/student/'));
assert.ok(target,'ADB must forward the isolated preview WebView on port 19222');
const socket=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let sequence=0;
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
socket.onmessage=event=>{const item=JSON.parse(event.data);const request=pending.get(item.id);if(!request)return;pending.delete(item.id);item.error?request.reject(item.error):request.resolve(item.result);};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
try {
 const result=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,userGesture:true,expression:`(async()=>{
   const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720}},audio:false}),chunks=[];
   const settings=stream.getVideoTracks()[0].getSettings();
   const mime=['video/mp4;codecs=avc1.42001E','video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
   const recorder=new MediaRecorder(stream,{mimeType:mime});
   recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
   const stopped=new Promise(resolve=>recorder.onstop=resolve);
   const timer=null;recorder.start(250);await new Promise(resolve=>setTimeout(resolve,1600));recorder.stop();await stopped;clearInterval(timer);stream.getTracks().forEach(track=>track.stop());
   const raw=new File(chunks,'recorded',{type:recorder.mimeType});
   const {normalizeRecordedVideo}=await import('/student/js/recorded-video.js');
   const videoFile=await normalizeRecordedVideo(raw);
   const video=document.createElement('video');video.muted=true;video.playsInline=true;video.controls=true;video.src=URL.createObjectURL(videoFile);document.body.append(video);
   await video.play();await new Promise(resolve=>setTimeout(resolve,350));
   const playback={width:video.videoWidth,height:video.videoHeight,currentTime:video.currentTime,duration:video.duration,error:video.error?.code??null};video.pause();
   const {readVideoPreview}=await import('/student/js/screens/checkin.js');
   const preview=await readVideoPreview(URL.createObjectURL(videoFile));
   return {settings:{width:settings.width,height:settings.height,frameRate:settings.frameRate,audio:false},sourceMime:raw.type,outputMime:videoFile.type,playback,preview:{duration:preview.durationSeconds,thumbnail:Boolean(preview.thumbnailUrl)}};
 })()`});
 assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));
 const evidence=result.result.value;
 assert.ok(evidence.playback.width>0&&evidence.playback.currentTime>0&&evidence.playback.duration>0&&!evidence.playback.error);
 assert.equal(evidence.preview.thumbnail,true);assert.ok(evidence.preview.duration>0);
 fs.writeFileSync(directory+'/android-camera-preview.json',JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({check:'ANDROID_CAMERA_RECORD_NORMALIZE_AND_APP_PREVIEW',result:'PASS',...evidence}));
}finally{socket.close();}
