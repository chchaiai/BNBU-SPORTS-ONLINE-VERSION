import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileRecordDraftMedia,uploadMediaDraft} from './js/api.js';
import {isRetainedEvidenceLocked} from './js/screens/checkin.js';
const blob=new Blob(['same-video-bytes'],{type:'video/mp4'});
const hash=Buffer.from(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex');
const remote={id:'video',sessionId:'session',businessPurpose:'EXERCISE_RECORD',uploadStatus:'AVAILABLE',mediaType:'VIDEO',declaredContentSha256:hash,declaredFileSizeBytes:blob.size};
function mock(media=remote){return async url=>{
 if(String(url).endsWith('/evidence-context'))return Response.json({data:{sessionId:'session',mediaIds:['video']}});
 if(String(url).endsWith('/media/video'))return Response.json({data:media});
 throw new Error('Recovery must not upload or submit');
};}
test('lost local upload metadata recovers identical video by digest without allocating another slot',async()=>{
 const original=globalThis.fetch;globalThis.fetch=mock();
 try{const draft={id:'local',type:'video',blob};const result=await reconcileRecordDraftMedia('record','session',[draft]);assert.equal(result.restored,0);assert.equal(result.drafts.length,1);assert.equal(draft.mediaId,'video');assert.equal(isRetainedEvidenceLocked(draft),true);}finally{globalThis.fetch=original;}
});
test('deleted local video is restored for review while existing photos remain',async()=>{
 const original=globalThis.fetch;globalThis.fetch=mock();
 try{const photos=[1,2,3].map(i=>({id:`photo-${i}`,mediaId:`photo-${i}`,type:'image'}));const result=await reconcileRecordDraftMedia('record','session',photos);assert.equal(result.restored,1);assert.equal(result.drafts.length,4);assert.equal(result.drafts[3].serverOnly,true);assert.equal(result.drafts[3].mediaId,'video');const retry=await reconcileRecordDraftMedia('record','session',result.drafts);assert.equal(retry.restored,0);assert.equal(retry.drafts.length,4);}finally{globalThis.fetch=original;}
});
test('different bytes remain distinct and cross-session recovery is rejected',async()=>{
 const original=globalThis.fetch;globalThis.fetch=mock();
 try{const draft={type:'video',blob:new Blob(['different'],{type:'video/mp4'})};const result=await reconcileRecordDraftMedia('record','session',[draft]);assert.equal(result.restored,1);assert.equal(draft.mediaId,undefined);await assert.rejects(reconcileRecordDraftMedia('record','other',[draft]),e=>e.code==='MEDIA_BIND_TARGET_INVALID');globalThis.fetch=mock({...remote,sessionId:'other'});await assert.rejects(reconcileRecordDraftMedia('record','session',[]),e=>e.code==='MEDIA_NOT_AVAILABLE');}finally{globalThis.fetch=original;}
});
test('upload progress is checkpointed before each irreversible remote stage and reservation locks deletion',async()=>{
 const original=globalThis.fetch,events=[],draft={type:'image'},image=new Blob(['png'],{type:'image/png'});
 globalThis.fetch=async(url,init={})=>{const p=String(url);
 if(p.endsWith('/media-uploads')){assert.equal(events.at(-1),'KEY');events.push('INIT');return Response.json({data:{mediaId:'proof',uploadSessionId:'upload',uploadUrl:'https://example.test/proof',expiresAt:new Date(Date.now()+300000).toISOString()}});}
 if(init.method==='PUT'){assert.equal(events.at(-1),'RESERVED');assert.equal(isRetainedEvidenceLocked(draft),true);return new Response(null,{headers:{ETag:'proof'}});}
 if(p.endsWith('/confirm')){assert.equal(events.at(-1),'PUT');return Response.json({data:{version:2}});}
 if(p.endsWith('/bind')){assert.equal(events.at(-1),'CONFIRMED');return Response.json({data:{}});}
 if(p.endsWith('/media/proof')){assert.equal(events.at(-1),'BOUND');return Response.json({data:{id:'proof',uploadStatus:'AVAILABLE'}});}
 throw new Error('Unexpected request '+p);};
 try{await uploadMediaDraft('session',draft,image,{onCheckpoint:async d=>events.push(d.mediaId?'AVAILABLE':d.pendingUpload?.bound?'BOUND':d.pendingUpload?.confirmed?'CONFIRMED':d.pendingUpload?.objectUploaded?'PUT':d.pendingUpload?'RESERVED':'KEY')});assert.deepEqual(events,['KEY','INIT','RESERVED','PUT','CONFIRMED','BOUND','AVAILABLE']);}finally{globalThis.fetch=original;}
});
