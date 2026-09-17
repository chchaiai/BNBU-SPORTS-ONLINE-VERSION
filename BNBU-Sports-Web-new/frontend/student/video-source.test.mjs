import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareVideoSource,recordingLimit} from './js/video-source.js';
import {validateProofFile,PROOF_VIDEO_MAX_BYTES} from './js/proofs.js';

test('stops on either recording limit, including the exact boundary',()=>{
  assert.equal(recordingLimit(9999,PROOF_VIDEO_MAX_BYTES-1),null);
  assert.equal(recordingLimit(10000,1),'duration');
  assert.equal(recordingLimit(1,PROOF_VIDEO_MAX_BYTES),'size');
});
test('raw MOV and MP4 retain every byte without a decoder',async()=>{
  for (const [brand,type] of [['qt  ','video/quicktime'],['isom','video/mp4']]) {
    const bytes=new Uint8Array([0,0,0,16,...Buffer.from('ftyp'+brand),0,0,0,0]);
    const result=await prepareVideoSource(new File([bytes],'camera.mov',{type:''}));
    assert.equal(result.type,type);
    assert.deepEqual(new Uint8Array(await result.arrayBuffer()),bytes);
  }
});
test('raw source rejects oversized data before reading and supports WebM',async()=>{
  await assert.rejects(prepareVideoSource({size:PROOF_VIDEO_MAX_BYTES+1}),/size/);
  const result=await prepareVideoSource(new File([new Uint8Array([0x1a,0x45,0xdf,0xa3])],'camera.webm'));
  assert.equal(result.type,'video/webm');
});
test('new video uploads use 200MB and ten seconds, unknown duration is server verified',()=>{
  const file={type:'video/mp4',size:PROOF_VIDEO_MAX_BYTES};
  assert.equal(validateProofFile(file,'video',{durationSeconds:10}).ok,true);
  assert.equal(validateProofFile(file,'video',{durationSeconds:10.01}).ok,false);
  assert.equal(validateProofFile({...file,size:file.size+1},'video',{durationSeconds:1}).ok,false);
  assert.equal(validateProofFile(file,'video',{durationSeconds:null}).durationSeconds,null);
});
