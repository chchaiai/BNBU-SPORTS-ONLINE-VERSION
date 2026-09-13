import fs from 'node:fs';
import assert from 'node:assert/strict';
import createCore from '../../BNBU-Sports-Web-new/frontend/student/vendor/ffmpeg/core/ffmpeg-core.js';
import {finalizedMp4Duration} from '../../BNBU-Sports-Web-new/frontend/student/js/recorded-video.js';
globalThis.self={location:{href:import.meta.url}};
const source=fs.readFileSync('BNBU-Sports-Web-new/frontend/student/js/recorded-video.js','utf8');
const args=Function('return '+source.match(/worker\.exec\((\['-i','source'[\s\S]*?)\);/)[1])();
const posterArgs=Function('return '+source.match(/worker\.exec\((\['-i','output.mp4'[\s\S]*?)\);/)[1])();
const core=await createCore({wasmBinary:fs.readFileSync('BNBU-Sports-Web-new/frontend/student/vendor/ffmpeg/core/ffmpeg-core.wasm')});
const results=[];
for(const [label,path] of [['webm','.local/v81-browser-state/bugfix-captured-video.webm'],['fragmented-mp4','backend/test/fixtures/v81-media/media-recorder-fragmented.mp4'],['native-mp4','.local/v81-browser-state/bugfix-native-capture.mp4']]) {
 core.reset();core.FS.writeFile('source',fs.readFileSync(path));assert.equal(core.exec(...args),0);
 const bytes=core.FS.readFile('output.mp4'),duration=finalizedMp4Duration(bytes);assert.ok(duration>0);
 core.reset();assert.equal(core.exec(...posterArgs),0);const poster=core.FS.readFile('poster.jpg');assert.equal(poster[0],255);assert.equal(poster[1],216);
 results.push({label,conversion:'PASS',outputFrameDecode:'PASS',durationSeconds:duration,outputBytes:bytes.length,posterBytes:poster.length});
 core.FS.unlink('output.mp4');core.FS.unlink('poster.jpg');core.FS.unlink('source');
}
const evidence={check:'SHIPPED_WASM_VIDEO_CONVERSION_AND_POSTER',result:'PASS',scope:'Shipped WASM and exact production conversion arguments in Node; not phone playback acceptance',results};
fs.writeFileSync('evidence/ocr-triplatform-20260913/worker-video-conversion.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
