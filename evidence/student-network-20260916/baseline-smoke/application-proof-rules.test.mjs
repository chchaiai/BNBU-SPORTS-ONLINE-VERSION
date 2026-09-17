import assert from 'node:assert/strict';
import test from 'node:test';
import { validateApplicationProofFile, validateProofFile, applicationProofCount } from './js/proofs.js';
test('application documents accept the amended PDF/image formats and exact ten MB ceiling',()=>{
 for(const type of ['image/jpeg','image/png','image/webp','application/pdf']){
  assert.equal(validateApplicationProofFile({type,size:10 * 1024 * 1024}).ok,true);
  assert.deepEqual(validateApplicationProofFile({type,size:10 * 1024 * 1024 + 1}),{ok:false,error:'size'});
 }
 for(const type of ['video/webm','image/gif',''])assert.equal(validateApplicationProofFile({type,size:10}).ok,false);
 assert.equal(validateApplicationProofFile({type:'image/png',size:0}).ok,false);
 assert.equal(validateProofFile({type:'image/webp',size:10},'image').ok,false);
 assert.equal(validateProofFile({type:'application/pdf',size:10},'image').ok,false);
});
test('cumulative count keeps accepted images and counts each uploaded id only once',()=>{
 assert.equal(applicationProofCount(['old'],[{id:'new'}]),2);
 assert.equal(applicationProofCount(['old','uploaded'],[{mediaId:'uploaded'},{id:'pending'}]),3);
 assert.equal(applicationProofCount(['old','uploaded','third'],[]),3);
 assert.equal(applicationProofCount(['old','uploaded','third'],[{id:'fourth'}]),4);
});
