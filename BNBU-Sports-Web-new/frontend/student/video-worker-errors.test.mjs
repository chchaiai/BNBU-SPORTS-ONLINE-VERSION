import test from 'node:test';
import assert from 'node:assert/strict';
import {FFmpeg} from './vendor/ffmpeg/api/classes.js';

test('worker startup errors reject pending work immediately',async()=>{
 const original=globalThis.Worker;
 let terminated=false;
 globalThis.Worker=class {
  postMessage(){queueMicrotask(()=>this.onerror());}
  terminate(){terminated=true;}
 };
 const worker=new FFmpeg();
 try {await assert.rejects(worker.load(),/Video worker failed/);}
 finally {worker.terminate();globalThis.Worker=original;}
 assert.equal(terminated,true);
});
