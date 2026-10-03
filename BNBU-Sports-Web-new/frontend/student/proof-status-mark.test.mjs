import test from 'node:test';
import assert from 'node:assert/strict';
import {proofStatusMark,proofStatusMarkHtml,updateProofStatusMark} from './js/proof-status-mark.js';

test('queue states preserve actual progress and distinguish byte completion from verification',()=>{
  assert.equal(proofStatusMark({state:'waiting'}).state,'pending');
  for(const state of ['preparing','verifying'])assert.equal(proofStatusMark({state}).indeterminate,true);
  assert.equal(proofStatusMark({state:'uploading',percent:null}).indeterminate,true);
  assert.equal(proofStatusMark({state:'uploading',percent:100}).state,'running');
  assert.equal(proofStatusMark({state:'verified'}).state,'done');
  assert.equal(proofStatusMark({state:'failed'}).state,'failed');
  assert.equal(proofStatusMark({state:'uploading',percent:-4}).dash,'0.0000 56.5487');
  assert.equal(proofStatusMark({state:'uploading',percent:150}).dash,'56.5487 0.0000');
  assert.equal(proofStatusMark({state:'uploading',percent:50}).dash,'28.2743 28.2743');
});
test('progress and state updates reuse the same ring instead of restarting its DOM',()=>{
  const ring={setAttribute(k,v){this[k]=v;}};
  const mark={dataset:{},querySelector:()=>ring};
  for(const status of [{state:'waiting'},{state:'uploading',percent:42},{state:'verifying'},{state:'verified'},{state:'failed'},{state:'uploading',percent:0}]){
    updateProofStatusMark(mark,status);
    assert.equal(mark.querySelector(),ring);
    assert.equal(mark.dataset.status,proofStatusMark(status).state);
    assert.equal(ring['stroke-dasharray'],proofStatusMark(status).dash);
  }
  assert.match(proofStatusMarkHtml({state:'verified'}),/aria-hidden="true"/);
});
