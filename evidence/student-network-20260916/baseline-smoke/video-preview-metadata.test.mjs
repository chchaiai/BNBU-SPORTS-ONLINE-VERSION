import test from 'node:test';
import assert from 'node:assert/strict';
import {readVideoPreview,validateVideoDraftDuration} from './js/screens/checkin.js';
import {validateProofFile} from './js/proofs.js';

test('ten-second clips and unknown raw duration pass while known invalid durations fail',()=>{
 const file={type:'video/mp4',size:4096};
 for(const durationSeconds of [0.5,7.4,9.9,10])assert.equal(validateVideoDraftDuration(file,durationSeconds,true).ok,true);
 for(const durationSeconds of [10.01,12,NaN,Infinity])assert.equal(validateVideoDraftDuration(file,durationSeconds,true).error,'duration');
 assert.equal(validateVideoDraftDuration(file,null,false).ok,true);
 assert.equal(validateVideoDraftDuration(file,15,false).ok,false);
 assert.equal(validateProofFile(file,'video',{durationSeconds:15}).ok,false);
});

for (const initialDuration of [NaN, Infinity]) {
  test(`first frame with ${initialDuration} waits for finite mobile duration`, async (t) => {
    let removed=false;
    const video={duration:initialDuration,videoWidth:640,videoHeight:480,readyState:2,
      style:{},setAttribute(){},removeAttribute(){},pause(){},load(){},
      remove(){removed=true;},play(){return Promise.resolve();}};
    t.mock.method(globalThis,'setTimeout',()=>123);
    t.mock.method(globalThis,'clearTimeout',()=>{});
    const priorDocument=globalThis.document,priorMedia=globalThis.HTMLMediaElement;
    globalThis.HTMLMediaElement={HAVE_CURRENT_DATA:2};
    globalThis.document={body:{append(){}},createElement(type){return type==='video'?video:{getContext(){return {drawImage(){}};},toDataURL(){return 'data:image/jpeg;base64,test';}};}};
    try {
      let settled=false;const pending=readVideoPreview('blob:synthetic');pending.then(()=>settled=true);
      video.onloadeddata();await Promise.resolve();await Promise.resolve();
      assert.equal(settled,false);assert.equal(removed,false);
      video.duration=7.4;video.ondurationchange();
      const result=await pending;assert.equal(result.durationSeconds,7.4);assert.ok(result.thumbnailUrl);assert.equal(removed,true);
      assert.equal(video.ondurationchange,null);
    } finally {globalThis.document=priorDocument;globalThis.HTMLMediaElement=priorMedia;}
  });
}
