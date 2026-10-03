import test from 'node:test';
import assert from 'node:assert/strict';
import {durationProgress,exerciseProgressHtml,uploadPresentation,descriptionSaveState,recordFilterMatches,sheetSnap,renderExerciseReturn} from './js/checkin-experience.js';
import {saveSession,loadSession} from './js/session.js';
import {buildLocalPreviewWorkspace} from './js/local-preview.js';
import {renderCheckIn,checkinActions} from './js/screens/checkin.js';

test('minimum progress uses configured duration and never fabricates an unknown goal',()=>{
  assert.equal(durationProgress(899999,15,7200).reached,false);
  assert.equal(durationProgress(900000,15,7200).reached,true);
  assert.equal(durationProgress(900000,30,7200).ratio,.5);
  for(const minimum of [null,undefined,0,-1,NaN]) {
    assert.equal(durationProgress(9999999,minimum,null).ratio,null);
    assert.match(exerciseProgressHtml(9999999,minimum,null),/最低时长进度 —/);
  }
});
test('automatic end hint uses session maximum; absence has no artificial countdown',()=>{
  assert.equal(durationProgress(7140000,30,7200).nearEnd,true);
  assert.equal(durationProgress(7139999,30,7200).nearEnd,false);
  assert.equal(durationProgress(99999999,30,null).nearEnd,false);
});
test('upload bytes, verification and submission are distinct display states',()=>{
  assert.deepEqual(uploadPresentation({phase:'UPLOADING',percent:100}),{percent:100,label:'上传凭证 100%'});
  assert.equal(uploadPresentation({phase:'CONFIRMING',percent:100}).percent,null);
  assert.equal(uploadPresentation({phase:'SUBMITTING',percent:100}).label,'正在提交记录');
  assert.equal(uploadPresentation({phase:'UPLOADING',percent:null}).percent,null);
});
test('draft saved feedback requires read-back of the same session and text',()=>{
  const session={phase:'finished',startedAt:123,serverId:'s',details:{description:'运动内容'}};
  assert.equal(descriptionSaveState(session,structuredClone(session)),true);
  assert.equal(descriptionSaveState(session,{...session,serverId:'other'}),false);
  assert.equal(descriptionSaveState(session,{...session,details:{description:'旧内容'}}),false);
  assert.equal(descriptionSaveState(session,null),false);
});
test('sheet dragging supports expand, dismissal and cancellation resting target',()=>{
  assert.equal(sheetSnap(500,180),'closed');
  assert.equal(sheetSnap(500,-80),'expanded');
  assert.equal(sheetSnap(500,10,.8),'closed');
  assert.equal(sheetSnap(500,15,.1),'rest');
});
test('record filters select only their category and preserve unknown results',()=>{
  const record={creditType:'general',hours:null};
  assert.equal(recordFilterMatches(record,'all'),true);
  assert.equal(recordFilterMatches(record,'general'),true);
  assert.equal(recordFilterMatches(record,'course'),false);
  assert.equal(record.hours,null);
});

function fixture(t) {
  const memory=new Map();
  globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
  t.after(()=>delete globalThis.localStorage);
  const workspace=buildLocalPreviewWorkspace(),owner=workspace.student.id;
  const app={state:{workspace,tab:'checkin'},ui:{},isApiMode:()=>false,isLocalPreview:()=>true,hasActiveEnrollment:()=>true,isWriteAllowed:()=>true,render(){},showDialog(d){this.state.dialog=d;}};
  saveSession(owner,{phase:'finished',startedAt:1,endedAt:2100001,activeDurationMillis:2100000,accumulatedMs:2100000,maximumDurationSeconds:7200,details:{creditType:'general',sportType:'running',description:'跑步'}});
  renderCheckIn(app);return {app,owner,memory};
}
test('description persistence failure is reported without falsely showing saved feedback',t=>{
  const {app}=fixture(t);
  globalThis.localStorage.setItem=()=>{throw new Error('quota');};
  checkinActions['checkin.description'](app,{value:'新的运动说明'});
  assert.equal(app.ui.checkin.descriptionSave,'error');
  assert.match(renderCheckIn(app),/本机保存失败/);
});
test('description action keeps DOM identity and saves only valid maximum-length text',t=>{
  const {app,owner}=fixture(t);
  let renders=0;app.render=()=>{renders++;};
  const field={value:'运'.repeat(240)};
  checkinActions['checkin.description'](app,field);
  assert.equal(loadSession(owner).details.description.length,200);
  assert.equal(app.ui.checkin.descriptionSave,'saved');assert.equal(renders,0);
});
test('return capsule accurately represents running, paused and ended states',()=>{
  for(const phase of ['active','paused','finished']) {
    const html=renderExerciseReturn({phase,startedAt:1,accumulatedMs:2000,details:{sportType:'running'}},'owner');
    assert.match(html,/data-tab="checkin"/);assert.match(html,/跑步/);
  }
  assert.equal(renderExerciseReturn({phase:'submitted'},'owner'),'');
});
test('an ended exercise never claims that a below-minimum or unverified record can be submitted',()=>{
  for(const activeDurationMillis of [41000,2100000,null]) {
    const html=renderExerciseReturn({phase:'finished',startedAt:1,activeDurationMillis,accumulatedMs:activeDurationMillis||0,details:{sportType:'running'}},'owner');
    assert.match(html,/已结束 · 返回查看/);
    assert.doesNotMatch(html,/记录待提交|Record ready to submit/);
  }
});
test('record detail keeps absent credited duration unknown and records the return scroll',t=>{
  const {app}=fixture(t);const record=app.state.workspace.records[0];record.hours=null;
  app._viewport={querySelector:()=>({scrollTop:340})};
  checkinActions['checkin.openRecord'](app,{dataset:{recordId:record.id}});
  assert.equal(app.ui.checkin.recordListScroll,340);
  assert.match(renderCheckIn(app),/headline-medium text-on-surface">—<\/span>/);
  checkinActions['checkin.recordBack'](app);
  assert.equal(app.ui.checkin.restoreRecordScroll,true);
});
