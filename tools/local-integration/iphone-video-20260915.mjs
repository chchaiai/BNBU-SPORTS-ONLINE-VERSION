import fs from 'node:fs';
import assert from 'node:assert/strict';
import createCore from '../../BNBU-Sports-Web-new/frontend/student/vendor/ffmpeg/core/ffmpeg-core.js';
import {normalizeRecordedVideo, canRemuxRecording} from '../../BNBU-Sports-Web-new/frontend/student/js/recorded-video.js';
globalThis.self = {location:{href:import.meta.url}};
const core = await createCore({wasmBinary:fs.readFileSync('BNBU-Sports-Web-new/frontend/student/vendor/ffmpeg/core/ffmpeg-core.wasm')});
const results = [];
let commands = [];
const worker = {
 load:async()=>{}, writeFile:async(name,bytes)=>core.FS.writeFile(name,bytes),
 readFile:async(name,encoding)=>core.FS.readFile(name,encoding?{encoding}:undefined),
 deleteFile:async name=>core.FS.unlink(name), terminate:()=>{},
 exec:async args=>{commands.push(args);core.reset();return core.exec(...args);},
 ffprobe:async args=>{core.reset();return core.ffprobe(...args);},
};
for(const [label,path] of [['tagged-mp4','evidence/iphone-video-20260915/tagged-source.mp4'],['hevc','evidence/iphone-video-20260915/hevc-source.mp4'],['webm','.local/v81-browser-state/bugfix-captured-video.webm'],['fragmented-mp4','backend/test/fixtures/v81-media/media-recorder-fragmented.mp4'],['native-mp4','.local/v81-browser-state/bugfix-native-capture.mp4']]) {
 commands=[];const start=performance.now();
 const result=await normalizeRecordedVideo(new File([fs.readFileSync(path)],label,{type:label==='webm'?'video/webm':'video/mp4'}),{createWorker:async()=>worker});
 assert.ok(result.preview.durationSeconds>0);assert.match(result.preview.thumbnailUrl,/^data:image\/jpeg;base64,/);
 const copied=commands.some(args=>args.includes('copy'));
 if(label==='webm'||label==='hevc')assert.equal(copied,false);
 if(label==='fragmented-mp4')assert.equal(copied,true);
 fs.writeFileSync(`evidence/iphone-video-20260915/${label}.mp4`,new Uint8Array(await result.file.arrayBuffer()));
 core.reset();core.ffprobe('-v','error','-show_streams','-show_format','-of','json','output.mp4','-o','verified.json');
 const metadata=JSON.parse(core.FS.readFile('verified.json',{encoding:'utf8'}));
 assert.equal(metadata.streams.find(s=>s.codec_type==='video').codec_name,'h264');
 assert.equal(metadata.streams.find(s=>s.codec_type==='audio').codec_name,'aac');
 assert.doesNotMatch(JSON.stringify([metadata.format.tags,...metadata.streams.map(s=>s.tags)]),/location|\+00\.0000/);
 if(label==='tagged-mp4')assert.ok(metadata.streams[0].side_data_list.some(data=>Math.abs(data.rotation)===90));
 results.push({label,seconds:result.preview.durationSeconds,bytes:result.file.size,method:copied?'remux':'encode',elapsedMs:Math.round(performance.now()-start)});
}
assert.equal(canRemuxRecording([{codec_type:'video',codec_name:'hevc',pix_fmt:'yuv420p',width:1280,height:720},{codec_type:'audio',codec_name:'aac'}]),false);
await assert.rejects(normalizeRecordedVideo(new File(['x'],'source.mp4',{type:'video/mp4'}),{createWorker:async()=>({...worker,load:async()=>{throw new Error('private URL');}})}),error=>error.stage==='load'&&!error.message.includes('private'));
await assert.rejects(normalizeRecordedVideo(new File(['invalid video'],'source.mp4',{type:'video/mp4'}),{createWorker:async()=>worker}),error=>error.stage==='probe');
fs.writeFileSync('evidence/iphone-video-20260915/conversion.json',JSON.stringify({result:'PASS',scope:'Actual shipped WASM; synthetic sources, not physical iPhone acceptance',results},null,2));
console.log(JSON.stringify(results));
