import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiError,ClientTransportError,toUserFacingError} from './js/api.js';

test('object-storage rejection explains retained evidence without claiming the student has no business permission',()=>{
  const result=toUserFacingError(new ApiError(403,{code:'MEDIA_UPLOAD_FAILED'}),{log:false});
  assert.equal(result.category,'SERVER');
  assert.equal(result.retryable,true);
  assert.match(result.message,/上传|upload/);
  assert.doesNotMatch(result.message,/没有权限|cannot perform/);
});
test('network failure remains renderable and does not log the private transport cause',()=>{
  const original=console.error,logs=[];
  console.error=(...args)=>logs.push(args);
  try {
    const result=toUserFacingError(new ClientTransportError(new Error('private transport detail'),{method:'PATCH',route:'/me/preferences'}));
    assert.equal(result.category,'NETWORK');assert.equal(result.retryable,true);
    assert.ok(result.message);assert.equal(logs.length,1);
    assert.ok(!JSON.stringify(logs).includes('private transport detail'));
  }finally{console.error=original;}
});
