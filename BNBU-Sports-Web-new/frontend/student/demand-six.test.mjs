import assert from 'node:assert/strict';
import test from 'node:test';
import {inviteCodeFromQr} from './js/screens/join.js';
import {uploadProgressHtml} from './js/upload-progress.js';
import {validateVideoDraftDuration,checkinActions} from './js/screens/checkin.js';

test('official QR URL and existing QR tokens resolve to the same invite',()=>{
 const code='550e8400-e29b-41d4-a716-446655440000.synthetic_secret';
 assert.equal(inviteCodeFromQr(`https://www.student.bnbusports.cn/student/?invite=${code}`),code);
 assert.equal(inviteCodeFromQr(`https://sports.example.com/join/${code}`),code);
 assert.equal(inviteCodeFromQr(code),code);
 assert.equal(inviteCodeFromQr(`https://untrusted.example/student/?invite=${code}`),null);
 assert.equal(inviteCodeFromQr('https://www.student.bnbusports.cn/student/?invite=bad'),null);
});
test('progress uses real values and no fabricated percentage during processing',()=>{
 const html=uploadProgressHtml({phase:'UPLOADING',percent:42});
 assert.match(html,/aria-valuenow="42"/);assert.match(html,/>42%<\/span>/);
 assert.match(html,/position:fixed;inset:0/);
 assert.doesNotMatch(uploadProgressHtml({phase:'PROCESSING'}),/aria-valuenow=/);
});
test('all video sources reject 10.001 seconds including historical files',()=>{
 const file={type:'video/mp4',size:1024};
 for(const native of [true,false]){
  assert.equal(validateVideoDraftDuration(file,10,native).ok,true);
  assert.equal(validateVideoDraftDuration(file,10.001,native).ok,false);
 }
});
test('both primary buttons synchronously request device capture',()=>{
 const original=globalThis.document;
 try {for(const [action,accept] of [['checkin.capturePhoto','image/*'],['checkin.captureVideo','video/*']]){
   let clicked=false;const input={style:{},setAttribute(k,v){this[k]=v;},click(){clicked=true;},remove(){}};
   globalThis.document={createElement:()=>input,body:{append(){}}};
   checkinActions[action]({});assert.equal(clicked,true);assert.equal(input.accept,accept);assert.equal(input.capture,'environment');
 }}finally{globalThis.document=original;}
});
