import assert from 'node:assert/strict';
import test from 'node:test';
import {uploadObject,uploadProgressLabel} from './js/upload-progress.js';

test('upload reports measured byte progress separately from confirmation',async()=>{
  const original=globalThis.XMLHttpRequest,events=[];
  class Xhr{upload={};status=200;open(){}setRequestHeader(){}getResponseHeader(){return 'etag';}send(){this.upload.onprogress({lengthComputable:true,loaded:42,total:100});this.onload();}}
  globalThis.XMLHttpRequest=Xhr;
  try{const response=await uploadObject('/synthetic',{body:new Blob(['test']),onProgress:value=>events.push(value)});assert.equal(response.ok,true);assert.equal(response.headers.get('ETag'),'etag');assert.deepEqual(events,[{phase:'UPLOADING',percent:0},{phase:'UPLOADING',percent:42}]);assert.match(uploadProgressLabel(events[1]),/42%/);}
  finally{globalThis.XMLHttpRequest=original;}
});
test('unknown upload length shows a phase rather than an invented percentage',()=>{
  assert.doesNotMatch(uploadProgressLabel({phase:'UPLOADING',percent:null}),/%/);
  assert.notEqual(uploadProgressLabel({phase:'PROCESSING'}),uploadProgressLabel({phase:'SUCCESS'}));
});
