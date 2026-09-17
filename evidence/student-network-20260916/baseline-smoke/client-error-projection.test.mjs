import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiError,ClientTransportError,toUserFacingError,request,apiErrorText} from './js/api.js';

test('transport diagnostics match the sent request and stay stable across repeated rendering',async()=>{
  const original=globalThis.fetch;let sent;
  globalThis.fetch=async(_url,options)=>{sent=options.headers['X-Request-ID'];throw new TypeError('private connection string');};
  try{
    await assert.rejects(request('/health/live',{auth:false}),error=>{
      const first=toUserFacingError(error,{log:false}),second=toUserFacingError(error,{log:false});
      assert.ok(sent);assert.equal(first.requestId,sent);assert.equal(second.requestId,sent);
      assert.equal(first.code,'NETWORK_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(first),/private connection/);
      return true;
    });
  }finally{globalThis.fetch=original;}
  const a=new Error('secret A'),b=new Error('secret B');
  assert.equal(toUserFacingError(a,{log:false}).requestId,toUserFacingError(a,{log:false}).requestId);
  assert.notEqual(toUserFacingError(a,{log:false}).requestId,toUserFacingError(b,{log:false}).requestId);
});

test('local proof storage errors do not tell the student to check the network',()=>{
 const error=new Error('private storage detail');error.name='ProofDraftStorageError';
 const result=toUserFacingError(error,{log:false});
 assert.equal(result.category,'UNKNOWN');assert.match(result.message,/存储|storage/);
 assert.doesNotMatch(result.message,/网络连接失败|Network connection failed|private/);
});

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
