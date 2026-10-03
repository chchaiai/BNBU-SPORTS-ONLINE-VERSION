import test from 'node:test';
import assert from 'node:assert/strict';
import {updateProofQueue} from './js/checkin-proof-queue.js';
import {fieldScrollDelta, refreshCheckinTransfer} from './js/checkin-experience.js';
import {animateFormReflow, animateFieldError} from './js/checkin-form-motion.js';

function element() {
  const attrs=new Map();
  return {dataset:{},style:{},attrs,className:'',innerHTML:'',textContent:'',
    setAttribute(k,v){attrs.set(k,v);},removeAttribute(k){attrs.delete(k);},hasAttribute(k){return attrs.has(k);},
    classList:{toggle(){}},querySelector(){return null;}};
}
function queueFixture() {
  const proof={id:'p1',type:'image'}, status=element(), button=element(), track=element(), row=element();
  button.dataset.proofTitle='现场照片 1'; row.dataset={queueId:'p1',queueState:'uploading'};
  status.lastElementChild=element();track.firstElementChild=element();
  row.querySelector=selector=>({'.proof-queue-row':button,'.proof-queue-status':status,'.proof-queue-track':track}[selector]);
  const steps=[0,1,2].map(()=>({...element(),firstElementChild:element()}));
  const footer={...element(),querySelectorAll:()=>steps};
  const root={...element(),querySelector:selector=>selector==='.proof-queue-footer'?footer:selector==='.checkin-finished.is-submitting'?{}:null,querySelectorAll:()=>[row]};
  root.dataset.checkinOwner='student';
  const ui={finish:{submitting:true},uploadDraftId:'p1',drafts:[proof],uploadProgress:{phase:'UPLOADING',percent:0}};
  return {root,ui,proof,status,button,track,row,steps,footer};
}

test('progress patches preserve row/control/track identity and percentages remain truthful',()=>{
  const f=queueFixture();
  const refs=[f.row,f.button,f.track,f.track.firstElementChild];
  for(const percent of [0,18,42,70,100]) {
    f.ui.uploadProgress.percent=percent;
    assert.equal(updateProofQueue(f.root,f.ui),true);
    assert.equal(f.track.firstElementChild.style.width,`${percent}%`);
    assert.equal(f.track.attrs.get('aria-valuenow'),String(percent));
    assert.equal(f.status.lastElementChild.textContent,`${percent}%`);
    assert.deepEqual([f.row,f.button,f.track,f.track.firstElementChild],refs);
  }
  assert.equal(f.row.dataset.queueState,'uploading');
  f.ui.uploadProgress={phase:'CONFIRMING'};updateProofQueue(f.root,f.ui);
  assert.equal(f.row.dataset.queueState,'verifying');assert.equal(f.track.attrs.has('role'),false);
  f.proof.mediaId='verified';updateProofQueue(f.root,f.ui);
  assert.equal(f.row.dataset.queueState,'verified');
});
test('unknown progress removes a stale numeric value and verification stays separate from submission',()=>{
  const f=queueFixture();updateProofQueue(f.root,f.ui);
  f.ui.uploadProgress.percent=null;updateProofQueue(f.root,f.ui);
  assert.equal(f.track.attrs.has('aria-valuenow'),false);assert.equal(f.row.dataset.queueState,'uploading');
  f.proof.mediaId='verified';f.ui.uploadProgress={phase:'SUBMITTING'};updateProofQueue(f.root,f.ui);
  assert.equal(f.steps[2].attrs.get('aria-current'),'step');assert.equal(f.steps[0].className,'is-done');
});
test('structural changes and failure require the full renderer; an upload tick does not',()=>{
  const f=queueFixture();let renders=0;
  const app={ui:{checkin:f.ui},state:{workspace:{student:{id:'student'}}},_viewport:{querySelector:()=>f.root},render(){renders++;}};
  refreshCheckinTransfer(app);assert.equal(renders,0);
  f.ui.drafts.push({id:'p2'});refreshCheckinTransfer(app);assert.equal(renders,1);
  f.ui.drafts.pop();f.ui.finish.error={message:'网络失败'};refreshCheckinTransfer(app);assert.equal(renders,2);
  f.ui.finish.error=null;app.state.workspace.student.id='other';refreshCheckinTransfer(app);assert.equal(renders,3);
});
test('form reversal continues from the visible height, restores reading position, and never submits',()=>{
  const collapse={...element(),dataset:{checkinCollapse:'description'},getBoundingClientRect:()=>({height:216})};
  const scroller={scrollTop:0};
  const root={dataset:{checkinPage:'finished'},querySelectorAll:selector=>selector==='[data-checkin-collapse]'?[collapse]:[],closest:()=>scroller};
  const previous={page:'finished',collapses:new Map([['description',{height:87,opacity:.4}]]),queue:[],scrollTop:150};
  const calls=[];
  assert.equal(animateFormReflow({root},previous,(el,params)=>calls.push(params)),true);
  assert.deepEqual(calls[0].height,[87,216]);assert.deepEqual(calls[0].opacity,[.4,1]);
  assert.equal(scroller.scrollTop,150);
});
test('field error removal is idempotent during consecutive keystrokes',()=>{
  let removed=0;const calls=[];
  const error={dataset:{},getBoundingClientRect:()=>({height:24}),parentElement:{},ownerDocument:{defaultView:{getComputedStyle:()=>({rowGap:'12px'})}},remove(){removed++;}};
  const play=(el,params,ctx,finish)=>calls.push({params,finish});
  animateFieldError(error,{},play,true);animateFieldError(error,{},play,true);
  assert.equal(calls.length,1);assert.deepEqual(calls[0].params.height,[24,0]);assert.deepEqual(calls[0].params.marginTop,[0,-12]);
  calls[0].finish();assert.equal(removed,1);
});
test('validation scrolls minimally and does not recenter an already visible field',()=>{
  const viewport={top:32,bottom:700};
  assert.equal(fieldScrollDelta({top:300,bottom:500},viewport),0);
  assert.equal(fieldScrollDelta({top:630,bottom:758},viewport),78);
  assert.equal(fieldScrollDelta({top:10,bottom:138},viewport),-42);
  assert.equal(fieldScrollDelta({top:80,bottom:480},{top:32,bottom:320}),28);
});
