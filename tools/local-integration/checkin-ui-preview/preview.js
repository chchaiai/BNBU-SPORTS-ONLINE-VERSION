import {refreshCheckinTransfer} from '/student/js/checkin-experience.js';
// Isolated loopback UI review. Renders the real student screens with labelled fixtures.
// The preview server has no API routes; the real submit action rejects local previews.
import {app} from '/student/js/app.js';
import {buildLocalPreviewWorkspace, LOCAL_PREVIEW_SESSION_KIND} from '/student/js/local-preview.js';
import {localStore} from '/student/js/store.js';
import {saveSession, clearSession, loadSession, formatTimer} from '/student/js/session.js';
import {SPORT_OPTIONS} from '/student/js/sports-catalog.js';
import {checkinActions, checkinTick, attachDraftVideoPreview} from '/student/js/screens/checkin.js';
import {restoreCheckinContinuity} from '/student/js/lazy-student-screens.js';
import {previewCheckinCelebration} from '/student/js/checkin-motion-loader.js';
import {MAX_PROOF_IMAGES} from '/student/js/api.js';

if (!['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) throw new Error('Loopback preview only');
const owner = 'INSTRUMENT-CHECKIN-LOCAL-PREVIEW';
localStore.setSession({kind: LOCAL_PREVIEW_SESSION_KIND, accountId: owner});
app._viewport = document.querySelector('#review-viewport');
app.overlay = {healthReminderAck: true};
Object.assign(app.actions, checkinActions, {
  'root.tab': (a, el) => a.selectTab(el.dataset.tab),
  'dialog.close': a => {a.state.dialog = null; a.render();},
});
app.registerAfterRender(attachDraftVideoPreview);
Object.assign(app.state, {
  systemMode: 'NORMAL', systemModeChecked: true, isRestoringSession: false,
  privacyConsentChecked: true, needsPrivacyConsent: false, authenticated: true,
  requiresContactBinding: false, postEnrollmentGuideCompleted: true, preLoginGuideCompleted: true,
  workspace: buildLocalPreviewWorkspace(), tab: 'checkin', subScreen: null, isLoading: false,
});
app.state.workspace.student.id = owner;
await restoreCheckinContinuity(app);
const actualApiMode = app.isApiMode.bind(app);
const picture = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#77988a"/><path d="M85 300 135 30H270L320 300M200 30V300M108 170H298M126 75H280" fill="none" stroke="#eef4ee" stroke-width="4"/><path d="M75 128H325" stroke="#294e48" stroke-width="4"/><rect x="100" y="240" width="200" height="34" rx="10" fill="#294e48"/><text x="200" y="263" text-anchor="middle" font-family="sans-serif" font-size="16" fill="white">示例运动凭证</text></svg>`);

let switchingScenario = false;
let previewRevision = 0;
function scenario(value, {restore = false} = {}) {
  previewRevision++;
  const scenarioRevision=previewRevision;
  switchingScenario = true;
  const existing = restore && localStorage.getItem('instrument-preview-scene') === value ? loadSession(owner) : null;
  app.isApiMode = actualApiMode;
  app.state.workspace = buildLocalPreviewWorkspace();
  app.state.workspace.student.id = owner;
  app.state.tab = 'checkin'; app.state.dialog = null; app.ui.checkin = null;
  clearSession(owner);
  app.render();
  const ui = app.ui.checkin;
  ui.previewTransfer='simulation';ui.previewProofStates={};
  ui.draftScope = 'pending'; ui.drafts = [];
  ui.setup.creditType = 'general'; ui.setup.generalSportType = 'stretch_flex';
  if (['running', 'paused', 'finished', 'filled', 'submitted', 'short', 'uploading', 'failed', 'empty-proof','approaching','limit','camera'].includes(value)) {
    const now = Date.now(), duration = value === 'short' ? 5 * 60000 : value === 'approaching' ? 30 * 60000 - 5000 : value === 'limit' ? 7200000 - 45000 : (32 * 60 + 18) * 1000;
    const phase = ['running','approaching','limit'].includes(value) ? 'active' : ['paused','camera'].includes(value) ? 'paused' : value === 'submitted' ? 'submitted' : 'finished';
    saveSession(owner, existing || {
      phase, startedAt: now - duration, lastResumedAt: phase === 'active' ? now : null,
      endedAt: phase === 'finished' || phase === 'submitted' ? now : null,
      accumulatedMs: duration, activeDurationMillis: duration, maximumDurationSeconds: 7200,
      details: {creditType: 'general', sportType: 'stretch_flex', description: ['finished', 'empty-proof'].includes(value) || value === 'paused' && new URLSearchParams(location.search).get('view') === 'end' ? '' : '完成肩背、髋部与腿部伸展，配合呼吸进行柔韧练习。'},
      summary: {duration: '00:32:18', sportType: '伸展与柔韧', creditType: '自主运动', proofCount: 1},
    });
    if (value !== 'empty-proof') ui.drafts = [{id: 'instrument-fixture-photo', type: 'image', url: picture, byteCount: 215000, capturedAt: new Date(now).toISOString()}];
  }
  if (value === 'unknown') app.state.workspace.creditPolicy = null;
  if (value === 'uploading') {
    ui.drafts.push({...ui.drafts[0],id:'example-photo-2'}, {id:'example-video',type:'video',url:picture,thumbnailUrl:picture,byteCount:5120000,durationSeconds:10});
    ui.previewProofStates[ui.drafts[0].id]='saved';
    ui.finish.submitting = true; ui.uploadDraftId=ui.drafts[1].id; ui.uploadProgress = {phase: 'UPLOADING', percent: 42}; ui.mediaNotice = '正在上传 42%（示例）';
  }
  if (value === 'failed') {ui.uploadDraftId=ui.drafts[0]?.id;ui.finish.error = {title:'示例上传失败',message:'网络暂时不可用，点击重试可继续体验。'};}
  if (['records', 'record-error','record-loading'].includes(value)) ui.tab = 'records';
  if (value === 'record-loading') {ui.loadingRecords=true;app.state.workspace.records=[];setTimeout(()=>{if(scenarioRevision===previewRevision) {ui.loadingRecords=false;app.state.workspace.records=buildLocalPreviewWorkspace().records;app.render();}},1600);}
  if (value === 'record-error') {
    app.state.workspace.records = [];
    ui.recordListError = {title: '记录暂时无法读取', message: '网络暂时不可用，请重试。（示例）', code: 'SYSTEM_SERVICE_UNAVAILABLE'};
    app.isApiMode = () => true;
  }
  app.scrollPositions.clear();
  app.render();
  if(value==='camera') previewCamera('video');
  localStorage.setItem('instrument-preview-scene', value);
  const url = new URL(location.href); url.searchParams.set('scene', value); history.replaceState(null, '', url);
  switchingScenario = false;
}

// Fixture-only actions: no camera permission, API request or real submission.
const realSubmit=checkinActions['checkin.submit'];
app.actions['checkin.submit']=async a=>{
  const session=loadSession(owner),ui=a.ui.checkin;
  if(!session || session.phase!=='finished' || ui.finish.submitting)return;
  if(!ui.drafts.length || !session.details.description?.trim()){realSubmit(a);return;}
  const revision=++previewRevision;
  ui.finish.error=null;ui.finish.submitting=true;
  for(const draft of ui.drafts) {
    if(ui.previewProofStates?.[draft.id]==='saved')continue;
    ui.uploadDraftId=draft.id;
    for(const percent of [0,18,42,70,100]) {
      if(revision!==previewRevision)return;
      ui.uploadProgress={phase:'UPLOADING',percent};ui.mediaNotice=`正在上传凭证 ${percent}%（示例）`;refreshCheckinTransfer(a);
      await new Promise(resolve=>setTimeout(resolve,230));
      if(revision!==previewRevision)return;
      if(document.querySelector('#submit-outcome').value==='failure' && percent===42) {
        ui.finish.submitting=false;ui.finish.error={title:'示例上传失败',message:'网络暂时不可用，请重试上传该凭证。'};
        document.querySelector('#submit-outcome').value='success';a.render();return;
      }
    }
    if(revision!==previewRevision)return;
    ui.uploadProgress={phase:'CONFIRMING'};ui.mediaNotice='正在确认凭证（示例）';refreshCheckinTransfer(a);
    await new Promise(resolve=>setTimeout(resolve,400));
    ui.previewProofStates[draft.id]='saved';refreshCheckinTransfer(a);
  }
  if(revision!==previewRevision)return;
  ui.uploadDraftId=null;ui.uploadProgress={phase:'SUBMITTING'};ui.mediaNotice='正在提交记录（示例）';refreshCheckinTransfer(a);
  await new Promise(resolve=>setTimeout(resolve,650));
  if(revision!==previewRevision)return;
  ui.finish.submitting=false;
  const sport=SPORT_OPTIONS.find(s=>s.value===session.details.sportType)?.zh || session.details.customSportName || '运动';
  const record={...buildLocalPreviewWorkspace().records[0],id:`example-${Date.now()}`,sportType:sport,sportCode:session.details.sportType,creditType:session.details.creditType,hours:null,creditedWholeMinutes:null,actualDurationSeconds:Math.floor(session.activeDurationMillis/1000),enrollmentId:session.details.creditType==='course'?'preview-enrollment':null,courseId:session.details.creditType==='course'?'preview-course':null,classSectionId:session.details.creditType==='course'?'preview-section':null,teacherPublicFeedback:null,note:session.details.description,description:session.details.description,submittedAt:new Date().toLocaleString('sv-SE'),businessDate:new Date().toLocaleDateString('sv-SE'),startTime:new Date(session.startedAt).toISOString(),endTime:new Date(session.endedAt).toISOString(),workflowStage:'PENDING_TEACHER',materialVersion:1,reviewResult:null,reviewStatus:'PENDING_TEACHER',serverStatus:'SUBMITTED',reviewPublicComment:'示例记录已接收，等待审核。',proofPhotoCount:ui.drafts.length,proofVideoCount:0,proofFiles:ui.drafts.map((draft,i)=>({type:'image',source:draft.url,fileName:`示例照片 ${i+1}`}))};
  a.state.workspace.records.unshift(record);ui.freshRecordId=record.id;
  saveSession(owner,{...session,phase:'submitted',summary:{duration:formatTimer(session.activeDurationMillis),sportType:sport,creditType:session.details.creditType==='course'?'课程相关':'自主运动',proofCount:ui.drafts.length}});
  a.render();void previewCheckinCelebration(a._viewport);
};
app.actions['checkin.refreshRecords']=async a=>{
  const revision=++previewRevision,ui=a.ui.checkin;
  ui.recordListError=null;ui.loadingRecords=true;a.render();
  await new Promise(resolve=>setTimeout(resolve,900));
  if(revision!==previewRevision)return;
  ui.loadingRecords=false;a.isApiMode=actualApiMode;a.state.workspace.records=buildLocalPreviewWorkspace().records;a.render();
};
function addExample(type='image') {
  const ui=app.ui.checkin;
  if(ui.drafts.filter(draft=>draft.type==='image').length>=MAX_PROOF_IMAGES)return;
  ui.drafts.push({id:`example-${crypto.randomUUID()}`,type,url:picture,thumbnailUrl:type==='video'?picture:null,byteCount:215000,durationSeconds:type==='video'?10:null,capturedAt:new Date().toISOString()});
}
function previewCamera(mode) {
  const ui=app.ui.checkin;
  ui.liveCamera={mode,status:'requesting',recorder:{pause(){}},recordingStartedAt:null,pausedDurationMs:0};
  app.render();
  const camera=ui.liveCamera;
  setTimeout(()=>{if(app.ui.checkin===ui && ui.liveCamera===camera){camera.status='ready';app.render();}},450);
}
app.actions['checkin.capturePhoto']=()=>previewCamera('photo');
app.actions['checkin.captureVideo']=()=>previewCamera('video');
app.actions['checkin.cameraClose']=()=>{app.ui.checkin.liveCamera={mode:null,status:'idle'};app.render();};
app.actions['checkin.cameraTakePhoto']=()=>{addExample();app.actions['checkin.cameraClose']();};
app.actions['checkin.cameraFlip']=()=>previewCamera(app.ui.checkin.liveCamera.mode);
app.actions['checkin.cameraStartVideo']=()=>{const c=app.ui.checkin.liveCamera;c.status='recording';c.recordingStartedAt=Date.now();c.pausedDurationMs=0;app.render();};
app.actions['checkin.cameraPauseVideo']=()=>{const c=app.ui.checkin.liveCamera;c.status='paused';c.pausedAt=Date.now();app.render();};
app.actions['checkin.cameraResumeVideo']=()=>{const c=app.ui.checkin.liveCamera;c.pausedDurationMs+=Date.now()-c.pausedAt;c.pausedAt=null;c.status='recording';app.render();};
app.actions['checkin.cameraStopVideo']=()=>{addExample('image');app.ui.checkin.mediaNotice='示例录像已完成，以下为示例封面。';app.actions['checkin.cameraClose']();};
app.actions['checkin.cameraRetakeVideo']=()=>previewCamera('video');
setInterval(()=>{
  const c=app.ui.checkin?.liveCamera;
  if(c?.status!=='recording')return;
  const ms=Date.now()-c.recordingStartedAt-c.pausedDurationMs;
  document.querySelector('[data-camera-progress]')?.setAttribute('stroke-dashoffset',String(Math.max(0,100-ms/100)));
  const label=document.querySelector('[data-live-camera-remaining]');if(label)label.textContent=`剩余 ${Math.max(0,Math.ceil(10-ms/1000))} 秒（示例）`;
  if(ms>=10000)app.actions['checkin.cameraStopVideo']();
},200);

app._viewport.addEventListener('click', event => {
  const el = event.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const handler = app.actions[el.dataset.action];
  if (handler) Promise.resolve(handler(app, el, event)).catch(console.error);
});
for (const kind of ['input', 'change']) app._viewport.addEventListener(kind, event => {
  const el = event.target.closest(`[data-${kind}]`);
  if (el) app.actions[el.dataset[kind]]?.(app, el, event);
});
document.querySelector('#scenario').addEventListener('change', event => scenario(event.target.value));
document.querySelector('#theme').addEventListener('click', () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
});
document.querySelector('#add-proof').addEventListener('click', () => {
  const ui = app.ui.checkin;
  if (!ui || ui.finish.submitting || ui.drafts.length >= MAX_PROOF_IMAGES) return;
  ui.drafts.push({id: `motion-example-${crypto.randomUUID()}`, type: 'image', url: picture,
    byteCount: 215000, capturedAt: new Date().toISOString()});
  app.render();
});
document.querySelector('#remove-proof').addEventListener('click', () => {
  const ui = app.ui.checkin;
  if (!ui || ui.finish.submitting) return;
  ui.drafts.pop(); app.render();
});
document.querySelector('#advance-minute').addEventListener('click', () => {
  const session = loadSession(owner);
  if (!session || !['active', 'paused', 'finished'].includes(session.phase)) return;
  session.accumulatedMs += 60000; session.activeDurationMillis += 60000;
  saveSession(owner, session); app.render();
});
document.querySelector('#celebrate').addEventListener('click', () => previewCheckinCelebration(app._viewport));
function motionMode(value) {
  if (value === 'system') delete document.documentElement.dataset.previewReducedMotion;
  else document.documentElement.dataset.previewReducedMotion = value === 'reduced' ? 'true' : 'false';
  const url = new URL(location.href); url.searchParams.set('motion', value); history.replaceState(null, '', url);
}
document.querySelector('#motion-mode').addEventListener('change', event => {motionMode(event.target.value); app.render();});
document.querySelector('#rerender').addEventListener('click', () => app.render());
document.querySelector('#review-update').addEventListener('click',()=>{
  const filter=app.ui.checkin?.recordFilter;
  const r=app.state.workspace.records.find(record=>record.creditType!=='offset' && (!filter || filter==='all' || record.creditType===filter));if(!r)return;
  r.reviewResult=r.reviewResult==='VALID'?'INVALID':'VALID';r.workflowStage='COMPLETED';app.render();
});
app.registerAfterRender(() => {
  const camera=app._viewport.querySelector('[data-live-camera-overlay]');
  if(camera) {const video=camera.querySelector('video');video.poster=picture;camera.querySelector('.live-video-title').textContent='示例取景 · 相机动效预览';}
  for(const draft of app.ui.checkin?.drafts || []) if(draft.previewUploaded) {
    const badge=[...app._viewport.querySelectorAll('[data-draft-id]')].find(el=>el.dataset.draftId===draft.id)?.querySelector('[data-proof-upload-state]');
    if(badge)badge.textContent='示例已上传';
  }
  const root = app._viewport.querySelector('[data-checkin-page]');
  const page = root?.dataset.checkinPage;
  const editable = ['running', 'finished'].includes(page) && !app.ui.checkin?.finish.submitting;
  document.querySelector('#add-proof').disabled = !editable || app.ui.checkin.drafts.length >= MAX_PROOF_IMAGES;
  document.querySelector('#remove-proof').disabled = !editable || !app.ui.checkin.drafts.length;
  document.querySelector('#advance-minute').disabled = !editable;
  document.querySelector('#celebrate').disabled = page !== 'submitted';
  const selector = document.querySelector('#scenario');
  if (!switchingScenario && ['preparation', 'running', 'paused', 'finished', 'filled','submitted','records'].includes(selector.value)) {
    const next = page === 'running' ? (root.dataset.checkinPhase === 'paused' ? 'paused' : 'running')
      : page === 'finished' ? (loadSession(owner)?.details.description?.trim() ? 'filled' : 'finished') : page;
    if (next && [...selector.options].some(option => option.value === next)) {
      selector.value = next;
      const url = new URL(location.href); url.searchParams.set('scene', next); history.replaceState(null, '', url);
      localStorage.setItem('instrument-preview-scene', next);
    }
  }
});
const requested = new URLSearchParams(location.search).get('scene');
const requestedMotion = new URLSearchParams(location.search).get('motion');
const mode = ['full', 'reduced'].includes(requestedMotion) ? requestedMotion : 'system';
document.querySelector('#motion-mode').value = mode; motionMode(mode);
const select = document.querySelector('#scenario');
const initial = [...select.options].some(option => option.value === requested) ? requested : 'finished';
select.value = initial;
scenario(initial, {restore: true});
select.disabled = false;
if(new URLSearchParams(location.search).get('view')==='end') {
  const replay=document.createElement('button');replay.type='button';replay.textContent='重新体验';
  replay.style.cssText='margin-left:12px;color:var(--color-primary);font:inherit;background:none;border:0;text-decoration:underline';
  replay.addEventListener('click',()=>scenario('paused'));
  document.querySelector('.preview-notice').append(replay);
}
setInterval(() => checkinTick(app), 1000);
