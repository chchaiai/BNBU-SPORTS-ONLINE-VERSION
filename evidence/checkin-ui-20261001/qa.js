import {app} from '/student/js/app.js';
import {buildLocalPreviewWorkspace,LOCAL_PREVIEW_SESSION_KIND} from '/student/js/local-preview.js';
import {localStore} from '/student/js/store.js';
import {saveSession,clearSession,loadSession} from '/student/js/session.js';
import {checkinActions,checkinTick,attachDraftVideoPreview} from '/student/js/screens/checkin.js';
import {restoreCheckinContinuity} from '/student/js/lazy-student-screens.js';
const owner='CHECKIN-LAYOUT-QA';
localStore.setSession({kind:LOCAL_PREVIEW_SESSION_KIND,accountId:owner});
app._viewport=document.querySelector('#qa-viewport');app.overlay={healthReminderAck:true};
Object.assign(app.actions,checkinActions,{'root.tab':(a,e)=>a.selectTab(e.dataset.tab),'dialog.close':a=>{a.state.dialog=null;a.render();}});
app.registerAfterRender(attachDraftVideoPreview);
Object.assign(app.state,{systemMode:'NORMAL',systemModeChecked:true,isRestoringSession:false,privacyConsentChecked:true,needsPrivacyConsent:false,authenticated:true,requiresContactBinding:false,postEnrollmentGuideCompleted:true,preLoginGuideCompleted:true,workspace:buildLocalPreviewWorkspace(),tab:'checkin',subScreen:null,isLoading:false});
app.state.workspace.student.id=owner;
await restoreCheckinContinuity(app);
const picture='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#83a19b"/><path d="M80 300 135 30H270L325 300M200 30V300M108 170H298M126 75H280" fill="none" stroke="#fff" stroke-width="4"/><path d="M75 128H325" stroke="#294e48" stroke-width="4"/><text x="200" y="280" text-anchor="middle" font-size="16" fill="white">LOCAL UI FIXTURE</text></svg>');
async function scenario(value){
 app.state.workspace=buildLocalPreviewWorkspace();app.state.workspace.student.id=owner;app.state.tab='checkin';app.state.dialog=null;app.ui.checkin=null;
 clearSession(owner);app.render();
 const ui=app.ui.checkin;ui.draftScope='pending';ui.drafts=[];
 if(['running','finished','submitted','short','uploading','failed','empty-proof'].includes(value)){
  const now=Date.now(),duration=value==='short'?5000:35*60000;
  saveSession(owner,{phase:value==='running'?'active':value==='submitted'?'submitted':'finished',startedAt:now-duration,lastResumedAt:now,endedAt:now,accumulatedMs:duration,activeDurationMillis:duration,maximumDurationSeconds:7200,details:{creditType:'course',sportType:'badminton',description:'羽毛球对打，练习发球与步法。'},summary:{duration:'00:35:00',sportType:'羽毛球',creditType:'课程相关',date:'2026-10-01',proofCount:1}});
  if(value!=='empty-proof')ui.drafts=[{id:'fixture-photo',type:'image',url:picture,byteCount:215000,capturedAt:new Date(now).toISOString()}];
 }
 if(value==='unknown')app.state.workspace.creditPolicy=null;
 if(value==='uploading'){ui.finish.submitting=true;ui.uploadProgress={phase:'UPLOADING',percent:42};ui.mediaNotice='正在上传 42%';}
 if(value==='failed')ui.mediaNotice='上传失败，凭证已保留，请重试提交。';
 if(['records','record-error','proof-todo'].includes(value))ui.tab='records';
 if(value==='record-error'){app.state.workspace.records=[];ui.recordListError={title:'记录暂时无法读取',message:'网络暂时不可用，请重试。',code:'SYSTEM_SERVICE_UNAVAILABLE'};app.isApiMode=()=>true;}else app.isApiMode=actualApiMode;
 if(value==='proof-todo')app.state.workspace.proofTodos=[{recordId:'preview-record-valid-course',paused:false,expired:false}];
 if(value==='blocked')app.state.workspace.hourRule.courseRequired=0;
 app.scrollPositions.clear();app.render();
}
// Keep the real mode method while changing only the read-error fixture.
const actualApiMode=app.isApiMode.bind(app);
const originalScenario=scenario;
app._viewport.addEventListener('click',event=>{const el=event.target.closest('[data-action]');if(el&&!el.disabled){const handler=app.actions[el.dataset.action];if(handler)Promise.resolve(handler(app,el)).catch(console.error);}});
app._viewport.addEventListener('input',event=>{const el=event.target.closest('[data-input]');if(el)app.actions[el.dataset.input]?.(app,el);});
app._viewport.addEventListener('change',event=>{const el=event.target.closest('[data-change]');if(el)app.actions[el.dataset.change]?.(app,el);});
document.querySelector('#scenario').addEventListener('change',async event=>{app.isApiMode=actualApiMode;await originalScenario(event.target.value);if(!app.isApiMode)app.isApiMode=actualApiMode;});
document.querySelector('#theme').addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';});
// Do not show app promotion over the isolated review page.

await scenario('preparation');
setInterval(()=>checkinTick(app),1000);

