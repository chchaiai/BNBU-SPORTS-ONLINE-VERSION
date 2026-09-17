import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadMediaDraft } from './js/api.js';

const blob = new Blob(['synthetic-png'], {type: 'image/png'});
const capability = () => ({mediaId:'media', uploadSessionId:'upload', uploadUrl:'https://storage.example.test/proof', uploadMethod:'PUT', expiresAt:new Date(Date.now()+300000).toISOString()});

test('a persisted quota rejection is retried once with a fresh key and completes the same proof', async () => {
  const original=globalThis.fetch, keys=[], draft={type:'image', initiateIdempotencyKey:'old-failed-key'};
  globalThis.fetch=async(url,input={})=>{
    const path=String(url);
    if(path.endsWith('/media-uploads')) {
      keys.push(input.headers['Idempotency-Key']);
      return keys.length===1 ? Response.json({code:'MEDIA_COUNT_LIMIT_EXCEEDED'},{status:422}) : Response.json({data:capability()});
    }
    if(input.method==='PUT'){assert.equal(input.body,blob);return new Response(null,{headers:{ETag:'"proof"'}});}
    if(path.endsWith('/confirm'))return Response.json({data:{version:2}});
    if(path.endsWith('/bind'))return Response.json({data:{}});
    if(path.endsWith('/media/media'))return Response.json({data:{id:'media',uploadStatus:'AVAILABLE'}});
    throw Error('Unexpected request');
  };
  try {assert.equal((await uploadMediaDraft('session',draft,blob)).mediaId,'media');assert.equal(keys.length,2);assert.notEqual(keys[0],keys[1]);}
  finally {globalThis.fetch=original;}
});

test('a real quota limit remains enforced with bounded retries and a fresh key for the next user attempt',async()=>{
  const original=globalThis.fetch, keys=[], draft={type:'image'};
  globalThis.fetch=async(url,input)=>{assert.ok(String(url).endsWith('/media-uploads'));keys.push(input.headers['Idempotency-Key']);return Response.json({code:'MEDIA_COUNT_LIMIT_EXCEEDED'},{status:422});};
  try {
    await assert.rejects(uploadMediaDraft('session',draft,blob), e=>e.code==='MEDIA_COUNT_LIMIT_EXCEEDED');
    assert.equal(keys.length,2);assert.equal(new Set([...keys,draft.initiateIdempotencyKey]).size,3);
  }finally{globalThis.fetch=original;}
});

test('expired unconfirmed authorization is replaced before attempting an object PUT',async()=>{
  const original=globalThis.fetch, draft={type:'image'}, keys=[];
  globalThis.fetch=async(url,input)=>{assert.ok(String(url).endsWith('/media-uploads'));keys.push(input.headers['Idempotency-Key']);return Response.json({data:capability()});};
  try {
    await uploadMediaDraft('session',draft,blob,{prepareOnly:true});
    draft.pendingUpload.initiated.expiresAt='2020-01-01T00:00:00Z';
    await uploadMediaDraft('session',draft,blob,{prepareOnly:true});
    assert.equal(keys.length,2);assert.notEqual(keys[0],keys[1]);
  }finally{globalThis.fetch=original;}
});

test('an uncertain initiation response retains its key so the committed reservation can be recovered',async()=>{
  const original=globalThis.fetch, draft={type:'image'}, keys=[];
  globalThis.fetch=async(url,input)=>{keys.push(input.headers['Idempotency-Key']);if(keys.length===1)throw new TypeError('Connection lost');return Response.json({data:capability()});};
  try {
    await assert.rejects(uploadMediaDraft('session',draft,blob,{prepareOnly:true}));
    await uploadMediaDraft('session',draft,blob,{prepareOnly:true});
    assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
  }finally{globalThis.fetch=original;}
});
