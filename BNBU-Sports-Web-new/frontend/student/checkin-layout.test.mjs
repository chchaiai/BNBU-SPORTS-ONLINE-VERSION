import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLocalPreviewWorkspace} from './js/local-preview.js';
import {saveSession, loadSession, clearSession} from './js/session.js';
import {checkinActions, renderCheckIn} from './js/screens/checkin.js';
import {isFocusedCheckin, restoreCheckinLayout, captureEndDialog, restoreEndDialogAccess} from './js/checkin-layout.js';
import {uploadProgressHtml} from './js/upload-progress.js';

function fixture(t, phase = 'finished') {
  const memory = new Map();
  globalThis.localStorage = {getItem: key => memory.get(key) ?? null, setItem: (key,value) => memory.set(key,value), removeItem: key => memory.delete(key)};
  t.after(() => delete globalThis.localStorage);
  const workspace = buildLocalPreviewWorkspace(), owner = workspace.student.id;
  const app = {state:{workspace,tab:'checkin'}, ui:{}, isApiMode:()=>false, isLocalPreview:()=>true,
    hasActiveEnrollment:()=>true, isWriteAllowed:()=>true, render(){},
    selectTab(tab){this.state.tab=tab;}, showDialog(dialog){this.state.dialog=dialog;}};
  saveSession(owner,{phase, startedAt:Date.now()-2100000, endedAt:Date.now(), accumulatedMs:2100000,
    activeDurationMillis:2100000,lastResumedAt:Date.now(),maximumDurationSeconds:7200,
    details:{creditType:'course',sportType:'badminton',description:'练习步法'},
    summary:{duration:'00:35:00',sportType:'羽毛球',creditType:'课程相关'}});
  renderCheckIn(app);
  return {app,owner};
}

for (const phase of ['active','paused','finished']) test(`leaving ${phase} and returning preserves the session and evidence`, t => {
  const {app,owner}=fixture(t,phase);
  app.ui.checkin.drafts=[{id:'proof',type:'image',url:'blob:fixture'}];
  const before=loadSession(owner);
  assert.equal(isFocusedCheckin(app.state,before),true);
  checkinActions['checkin.leaveSession'](app);
  assert.equal(app.state.tab,'dashboard');
  assert.equal(isFocusedCheckin(app.state,loadSession(owner)),false);
  app.selectTab('checkin');
  assert.deepEqual(loadSession(owner),before);
  assert.equal(app.ui.checkin.drafts[0].id,'proof');
  assert.match(renderCheckIn(app),/data-draft-id="proof"/);
});

test('pause exposes finish without losing the session, evidence, or resume action', t => {
  const {app,owner}=fixture(t,'active');
  app.ui.checkin.drafts=[{id:'proof',type:'image',url:'blob:fixture'}];
  assert.doesNotMatch(renderCheckIn(app),/data-action="checkin.requestFinish"/);
  checkinActions['checkin.pause'](app);
  const paused=loadSession(owner);
  assert.equal(paused.phase,'paused');
  assert.ok(paused.accumulatedMs>=2100000);
  assert.match(renderCheckIn(app),/data-action="checkin.requestFinish"/);
  checkinActions['checkin.requestFinish'](app);
  assert.equal(app.state.dialog.buttons.find(button=>button.action==='checkin.confirmFinish').label,'确认结束');
  assert.equal(loadSession(owner).phase,'paused');
  app.state.dialog=null;
  checkinActions['checkin.resume'](app);
  assert.equal(loadSession(owner).phase,'active');
  assert.equal(loadSession(owner).accumulatedMs,paused.accumulatedMs);
  assert.equal(app.ui.checkin.drafts[0].id,'proof');
});

test('instrument metrics keep unknown credit and session limits as unknown', t => {
  const {app,owner}=fixture(t,'paused');
  const session=loadSession(owner);session.maximumDurationSeconds=null;saveSession(owner,session);
  app.state.workspace.creditPolicy=null;
  const html=renderCheckIn(app);
  assert.match(html,/data-timer-hours>—</);
  assert.match(html,/自动结束上限<\/span><strong>—<\/strong>/);
  assert.doesNotMatch(html,/>0 分钟<|>60 分钟<|>120 分钟</);
});

test('submission lock prevents leaving and duplicate changes', t => {
  const {app}=fixture(t);app.ui.checkin.finish.submitting=true;
  app.ui.checkin.drafts=[{id:'uploading-proof',type:'image',url:'blob:fixture'}];
  app.ui.checkin.uploadDraftId='uploading-proof';
  app.ui.checkin.uploadProgress={phase:'UPLOADING',percent:42};
  checkinActions['checkin.leaveSession'](app);
  assert.equal(app.state.tab,'checkin');
  const html=renderCheckIn(app);
  assert.match(html,/data-action="checkin.submit" disabled/);
  assert.match(html,/data-input="checkin.description" required disabled/);
  assert.match(html,/data-action="checkin.capturePhoto" disabled/);
  assert.match(html,/aria-valuenow="42"/);
  assert.doesNotMatch(html,/upload-progress-overlay|position:fixed/);
});

test('evidence precedes required description; timing details occur once', t => {
  const {app}=fixture(t);const html=renderCheckIn(app);
  assert.ok(html.indexOf('checkin-evidence')<html.indexOf('id="checkin-description"'));
  assert.match(html,/aria-required="true"/);
  assert.equal(html.match(/00:35:00/g)?.length,1);
  assert.match(html,/data-checkin-disclosure="session-details"/);
  assert.match(html,/至少 1 张照片或 1 个视频/);
  assert.match(html,/预计计入/);
});

test('unknown policy is not shown as zero or silently replaced by default rules', t => {
  const {app,owner}=fixture(t);app.state.workspace.creditPolicy=null;clearSession(owner);
  const html=renderCheckIn(app);
  assert.match(html,/最短运动时长暂未获取/);
  assert.match(html,/<strong>—<\/strong>/);
  assert.doesNotMatch(html,/>0 分钟<|>30 分钟</);
});

test('below minimum duration cannot expose submission', t => {
  const {app,owner}=fixture(t),session=loadSession(owner);session.activeDurationMillis=1000;saveSession(owner,session);
  const html=renderCheckIn(app);
  assert.match(html,/不会生成打卡记录/);
  assert.doesNotMatch(html,/data-action="checkin.submit"/);
});

test('missing evidence and description remain blocked by existing validation', t => {
  const {app,owner}=fixture(t);
  checkinActions['checkin.submit'](app);assert.match(renderCheckIn(app),/data-checkin-error="proof"[^>]*>请至少保留 1 项/);
  app.ui.checkin.drafts=[{id:'proof',type:'image',url:'blob:fixture'}];
  const session=loadSession(owner);session.details.description=' ';saveSession(owner,session);
  checkinActions['checkin.submit'](app);assert.match(renderCheckIn(app),/data-checkin-error="description"[^>]*>请填写运动说明/);
  assert.equal(loadSession(owner).phase,'finished');
});

test('local preview cannot display fabricated submission success', t => {
  const {app,owner}=fixture(t);app.ui.checkin.drafts=[{id:'proof',type:'image',url:'blob:fixture'}];
  checkinActions['checkin.submit'](app);
  assert.match(app.state.dialog.title,/本地预览不提交/);
  assert.equal(loadSession(owner).phase,'finished');
});

test('records group by date, keep unknown credit unknown, and expose proof requests', t => {
  const {app,owner}=fixture(t);clearSession(owner);app.ui.checkin.tab='records';
  app.state.workspace.records[0].hours=null;
  app.state.workspace.proofTodos=[{recordId:app.state.workspace.records[0].id}];
  const html=renderCheckIn(app);
  assert.equal(html.match(/2026-08-28/g)?.length,1);
  assert.match(html,/<strong>—<\/strong>/);
  assert.match(html,/查看补证要求/);
  assert.doesNotMatch(html,/已加载记录计入时长|运动记录汇总/);
});

test('server-confirmed submitted state restores navigation and keeps review qualification', t => {
  const {app,owner}=fixture(t,'submitted');
  app.ui.checkin.mediaNotice='全部凭证已验证，正在提交打卡…';
  const html=renderCheckIn(app);
  assert.equal(isFocusedCheckin(app.state,loadSession(owner)),false);
  assert.match(html,/提交成功/);assert.match(html,/审核状态与计入时长/);
  assert.doesNotMatch(html,/预计计入|已通过审核|正在提交打卡/);
});

test('byte upload completion remains distinct from server confirmation', () => {
  const html=uploadProgressHtml({phase:'UPLOADING',percent:100},'',{inline:true});
  assert.match(html,/服务器确认/);assert.doesNotMatch(html,/提交成功/);
  const waiting=uploadProgressHtml({phase:'CONFIRMING'},'',{inline:true});
  assert.doesNotMatch(waiting,/aria-valuenow=/);
});

test('reduced motion still resets stage scroll, without animating', t => {
  globalThis.matchMedia=()=>({matches:true});t.after(()=>delete globalThis.matchMedia);
  const scroller={scrollTop:400};
  const root={dataset:{checkinPage:'finished',checkinOwner:'owner'},querySelectorAll:()=>[],closest:()=>scroller};
  restoreCheckinLayout({querySelector:()=>root},{page:'running',owner:'owner',disclosures:new Map(),scroll:new Map()},new Map());
  assert.equal(scroller.scrollTop,0);
});

test('end dialog snapshots keep the visible entry frame and focus across rerenders',()=>{
  const focused={dataset:{action:'checkin.confirmFinish'}}, panel={};
  const node={dataset:{checkinEndDialog:'7'},querySelector:()=>panel,contains:el=>el===focused};
  node.ownerDocument={activeElement:focused,defaultView:{getComputedStyle:el=>el===panel ? {opacity:'.6',transform:'matrix(0.98,0,0,0.98,0,8)'} : {opacity:'.8'},
    DOMMatrixReadOnly:class {constructor(){this.m11=.98;this.m42=8;}}}};
  const viewport={querySelector:s=>s==='[data-checkin-end-dialog]'?node:s==='[data-slide-phase="confirming"]'?{}:null};
  const captured=captureEndDialog(viewport);
  assert.equal(captured.key,'7');assert.equal(captured.y,8);assert.equal(captured.scale,.98);assert.equal(captured.slideComplete,true);
  const cancel={dataset:{action:'dialog.close'},focus(){this.focused=true;}}, confirm={...focused,focus(){this.focused=true;}};
  node.querySelectorAll=()=>[cancel,confirm];const root={};
  restoreEndDialogAccess(viewport,root,{endDialog:captured});
  assert.equal(root.inert,true);assert.equal(confirm.focused,true);assert.equal(cancel.focused,undefined);
});

test('closing an end dialog restores slider focus without depending on animation',()=>{
  const slider={focus(opts){this.focused=opts.preventScroll;}},root={dataset:{checkinOwner:'owner',checkinSession:'session',checkinPage:'running'},querySelector:()=>slider};
  restoreEndDialogAccess({querySelector:()=>null},root,{owner:'owner',session:'session',page:'running',endDialog:{slideComplete:false}});
  assert.equal(slider.focused,true);
  slider.focused=false;
  restoreEndDialogAccess({querySelector:()=>null},root,{owner:'other',session:'session',page:'running',endDialog:{slideComplete:false}});
  assert.equal(slider.focused,false);
});
