import test from 'node:test';
import assert from 'node:assert/strict';
import {mountLocalVideoPlayer} from './js/local-video-player.js';
test('local player reads retained bytes once and keeps playback source across repeated mounts',async()=>{
 const prior=globalThis.FileReader;let reads=0;
 globalThis.FileReader=class {readAsDataURL(blob){reads++;assert.equal(blob.size,3);this.result='data:video/mp4;base64,YWJj';queueMicrotask(()=>this.onload());}};
 try{const states=[],video={isConnected:true};const blob=new Blob(['abc'],{type:'video/mp4'});
 const first=mountLocalVideoPlayer(video,blob,s=>states.push(s));await first;
 assert.equal(video.src,'data:video/mp4;base64,YWJj');assert.equal(mountLocalVideoPlayer(video,blob,()=>{}),first);assert.equal(reads,1);
 video.onloadeddata();assert.deepEqual(states,['loading','ready']);video.onerror();assert.equal(states.at(-1),'error');
 }finally{globalThis.FileReader=prior;}
});
test('closed local player cannot be assigned a late video source',async()=>{
 const prior=globalThis.FileReader;globalThis.FileReader=class {readAsDataURL(){this.result='data:video/mp4;base64,YWJj';queueMicrotask(()=>this.onload());}};
 try{const video={isConnected:false};await mountLocalVideoPlayer(video,new Blob(['abc']),()=>{});assert.equal(video.src,undefined);}finally{globalThis.FileReader=prior;}
});
