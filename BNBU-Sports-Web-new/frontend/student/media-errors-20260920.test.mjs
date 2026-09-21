import test from 'node:test';
import assert from 'node:assert/strict';
import {correctPhotoMime} from './js/photo-originals.js';
import {normalizeCapturedPhoto,isRetainedEvidenceLocked,retainedEvidenceStatus} from './js/screens/checkin.js';
import {uploadMediaDraft,ApiError,toUserFacingError} from './js/api.js';
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwClRRRX0J84f//Z','base64');
const mislabeled = () => new Blob([jpeg],{type:'image/png'});

test('a real JPEG labelled PNG is identified and prepared as JPEG',async()=>{
 const corrected=await correctPhotoMime(mislabeled());assert.equal(corrected.type,'image/jpeg');
 const prepared=await normalizeCapturedPhoto(mislabeled());assert.equal(prepared.type,'image/jpeg');
 assert.equal(new Uint8Array(await prepared.arrayBuffer())[0],255);
});
test('PNG signature corrects an incorrect JPEG label without changing bytes',async()=>{
 const bytes=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);const file=new Blob([bytes],{type:'image/jpeg'});
 const corrected=await correctPhotoMime(file);assert.equal(corrected.type,'image/png');assert.deepEqual(Buffer.from(await corrected.arrayBuffer()),bytes);
});
test('unknown bytes are not relabelled as an allowed image',async()=>{
 const file=new Blob(['not an image'],{type:'image/png'});assert.equal(await correctPhotoMime(file),file);
});
test('an existing failed photo draft retries with the corrected declaration, bytes and digest',async()=>{
 const orig=fetch;const draft={type:'image',blob:mislabeled(),initiateIdempotencyKey:'old-key'};let declaration,body;
 globalThis.fetch=async(url,input={})=>{
  if(String(url).endsWith('/media-uploads')){declaration=JSON.parse(input.body);assert.notEqual(input.headers['Idempotency-Key'],'old-key');return Response.json({data:{mediaId:'image',uploadSessionId:'upload',uploadUrl:'https://storage.example.test/proof',expiresAt:new Date(Date.now()+300000).toISOString()}});}
  if(input.method==='PUT'){body=input.body;return new Response(null,{headers:{ETag:'proof'}});}
  if(String(url).endsWith('/confirm'))return Response.json({data:{version:2}});
  if(String(url).endsWith('/bind'))return Response.json({data:{}});
  return Response.json({data:{id:'image',uploadStatus:'AVAILABLE'}});
 };
 try{assert.equal((await uploadMediaDraft('session',draft,draft.blob)).mediaId,'image');assert.equal(declaration.mimeType,'image/jpeg');assert.equal(body.type,'image/jpeg');assert.equal(declaration.fileSizeBytes,body.size);assert.equal(declaration.declaredContentSha256,Buffer.from(await crypto.subtle.digest('SHA-256',await body.arrayBuffer())).toString('hex'));}finally{globalThis.fetch=orig;}
});
test('worker duration failure is persisted, deletable, specific, and cannot silently upload again',async()=>{
 const orig=fetch;const draft={type:'video',blob:new Blob(['video'],{type:'video/mp4'})};let calls=0,checkpoint;
 globalThis.fetch=async(url,input={})=>{calls++;if(String(url).endsWith('/media-uploads'))return Response.json({data:{mediaId:'video',uploadSessionId:'upload',uploadUrl:'https://storage.example.test/proof',expiresAt:new Date(Date.now()+300000).toISOString()}});
 if(input.method==='PUT')return new Response(null,{headers:{ETag:'proof'}});
 if(String(url).endsWith('/confirm'))return Response.json({data:{version:2}});
 if(String(url).endsWith('/bind'))return Response.json({data:{}});
 return Response.json({data:{id:'video',uploadStatus:'FAILED',failureCode:'MEDIA_VIDEO_DURATION_EXCEEDED'}});};
 try{await assert.rejects(uploadMediaDraft('session',draft,draft.blob,{onCheckpoint:async d=>{checkpoint=structuredClone(d);}}),e=>{const model=toUserFacingError(e,{log:false});assert.equal(model.code,'MEDIA_VIDEO_DURATION_EXCEEDED');assert.match(model.message,/1–10/);assert.doesNotMatch(model.action,/字段/);return true;});assert.equal(checkpoint.processingFailure.code,'MEDIA_VIDEO_DURATION_EXCEEDED');assert.equal(isRetainedEvidenceLocked(draft),false);assert.equal(retainedEvidenceStatus(draft),'FAILED');const before=calls;await assert.rejects(uploadMediaDraft('session',draft,draft.blob));assert.equal(calls,before);}finally{globalThis.fetch=orig;}
});
test('unknown worker details are not exposed and media errors do not ask for nonexistent fields',()=>{
 for(const code of ['MEDIA_INTEGRITY_MISMATCH','MEDIA_FAILURE_NOT_RETRYABLE']){const model=toUserFacingError(new ApiError(422,{code,details:{failureCode:'PRIVATE_SERVER_INFORMATION'}}),{log:false});assert.doesNotMatch(model.action,/字段/);assert.doesNotMatch(model.message,/PRIVATE_SERVER/);}
 const validation=toUserFacingError(new ApiError(422,{code:'VALIDATION_FAILED'}),{log:false});assert.match(validation.action,/字段/);
});
