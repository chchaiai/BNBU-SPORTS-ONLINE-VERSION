import test from 'node:test';
import assert from 'node:assert/strict';
import {proofQueueState, proofQueueRowHtml, proofQueueStage, proofQueueFooterHtml} from './js/checkin-proof-queue.js';
import {submitButtonContent} from './js/checkin-experience.js';

const proof = {id:'p1',type:'image'};
const ui = (progress, extra={}) => ({finish:{submitting:true},uploadDraftId:'p1',uploadProgress:progress,drafts:[proof],...extra});
test('each file has an independent state and only the current upload has a percentage',()=>{
  const state=ui({phase:'UPLOADING',percent:42});
  assert.equal(proofQueueState(proof,state).label,'42%');
  assert.equal(proofQueueState({...proof,id:'p2'},state).state,'waiting');
  assert.equal(proofQueueState({...proof,id:'p0',mediaId:'verified-id'},state).state,'verified');
  const row=proofQueueRowHtml(proof,state,{media:'',title:'现场照片 1',metadata:'204 KB'});
  assert.match(row,/aria-valuenow="42"/);
  assert.equal((row.match(/>42%</g)||[]).length,1);
  assert.doesNotMatch(submitButtonContent(state),/42%|data-upload-fill/);
});
test('unknown progress is indeterminate and 100% bytes is still unverified',()=>{
  const state=ui({phase:'UPLOADING',percent:null});
  const row=proofQueueRowHtml(proof,state,{media:'',title:'照片',metadata:''});
  assert.doesNotMatch(row,/aria-valuenow|>0%</);
  assert.match(row,/is-indeterminate/);
  assert.notEqual(proofQueueState(proof,ui({phase:'UPLOADING',percent:100})).state,'verified');
  assert.equal(proofQueueState(proof,ui({phase:'SUCCESS'})).state,'verifying');
  assert.equal(proofQueueState({...proof,mediaId:'accepted'},ui(null)).state,'verified');
});
test('file retry keeps verified siblings and removes stale failure as the upload resumes',()=>{
  const failed={...proof,uploadFailure:{code:'MEDIA_UPLOAD_FAILED'}};
  const verified={id:'p0',mediaId:'accepted'};
  const state=ui(null,{finish:{submitting:false,error:{message:'网络暂时不可用'}},drafts:[verified,failed]});
  assert.equal(proofQueueState(failed,state).state,'failed');
  assert.equal(proofQueueState(verified,state).state,'verified');
  assert.match(submitButtonContent(state),/重试上传/);
  assert.equal(proofQueueState(failed,ui({phase:'READING'})).state,'preparing');
  assert.equal(proofQueueState({...failed,processingFailure:{code:'INVALID'}},ui({phase:'READING'})).state,'failed');
});
test('overall verification only follows all transfers and final-submit failure retains its stage',()=>{
  const waiting={id:'p2'};
  const state=ui({phase:'CONFIRMING'},{drafts:[proof,waiting]});
  assert.equal(proofQueueStage(state),0);
  waiting.pendingUpload={objectUploaded:true};
  assert.equal(proofQueueStage(state),1);
  state.uploadDraftId=null;state.uploadProgress={phase:'SUBMITTING'};
  state.finish={submitting:false,error:{message:'服务暂时不可用'}};
  assert.equal(proofQueueStage(state),2);
  assert.match(submitButtonContent(state),/重试提交/);
  assert.match(proofQueueFooterHtml(state),/aria-current="step"[^>]*>.*提交记录/);
});
test('preview saved states are explicitly local and never create media IDs',()=>{
  const state=ui(null,{previewProofStates:{p1:'saved'}});
  assert.notEqual(proofQueueState(proof,state).state,'verified');
  state.previewTransfer=true;
  assert.equal(proofQueueState(proof,state).label,'已保存');
  assert.equal(proof.mediaId,undefined);
  assert.match(proofQueueFooterHtml(state),/仅保存在此浏览器/);
});
test('capture feedback does not start a submission progress indicator',()=>{
  const html=proofQueueFooterHtml(ui(null,{finish:{submitting:false},mediaNotice:'已添加照片。'}));
  assert.match(html,/已添加照片/);
  assert.doesNotMatch(html,/proof-queue-steps|aria-current/);
});
