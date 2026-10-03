import {localStore} from '/student/js/store.js';
import {buildLocalPreviewWorkspace,LOCAL_PREVIEW_SESSION_KIND} from '/student/js/local-preview.js';
import {loadSession,saveSession,formatTimer,businessToday,businessDateTime} from '/student/js/session.js';
import {saveProofDraft,loadProofDrafts,clearProofDrafts} from '/student/js/checkin-drafts.js';
import {SPORT_OPTIONS} from '/student/js/sports-catalog.js';
import {clearApiSession} from '/student/js/api.js';
import {experienceRecord,saveExperienceRecord} from '/experience-storage.mjs';

if (!['127.0.0.1','localhost','[::1]'].includes(location.hostname)) throw new Error('Loopback preview only');
const owner='STUDENT-EXPERIENCE-LOCAL';
const recordOwner=`${owner}:records`;
const recordsKey=`bnbu.local-experience.records.${owner}`;
clearApiSession();
localStore.setSession({kind:LOCAL_PREVIEW_SESSION_KIND,accountId:owner});
// This must follow the isolated session initialization: it also disables remote polling.
const {app}=await import('/student/js/app.js');
const {renderCheckIn,checkinActions}=await import('/student/js/screens/checkin.js');
const {restoreCheckinContinuity}=await import('/student/js/lazy-student-screens.js');
const {previewCheckinCelebration}=await import('/student/js/checkin-motion-loader.js');
const viewport=document.querySelector('#experience-viewport');
const urls=new Set();
function records() { const value=JSON.parse(localStorage.getItem(recordsKey)||'[]'); if(!Array.isArray(value)) throw new Error('本地记录无法读取'); return value; }
function release(drafts) { for(const d of drafts) if(d.url?.startsWith('blob:')) URL.revokeObjectURL(d.url); }
const storage={
  async findRecord(id) { return records().find(record=>record.id===id); },
  async proofIds(id) { const drafts=await loadProofDrafts(recordOwner,id);const ids=drafts.map(d=>d.id);release(drafts);return ids; },
  saveProof:(id,draft)=>saveProofDraft(recordOwner,id,draft),
  async commitRecord(record) { const next=records();if(!next.some(item=>item.id===record.id))next.unshift(record);localStorage.setItem(recordsKey,JSON.stringify(next)); },
};
async function hydrateRecords() {
  const rows=records();
  const loaded=[],newUrls=[];
  try {
  for(const row of rows) {
    const drafts=await loadProofDrafts(recordOwner,row.id);
    for(const d of drafts)newUrls.push(d.url);
    loaded.push({...row,proofFiles:drafts.filter(d=>row.proofIds.includes(d.id)).map((d,i)=>({type:d.type,source:d.url,fileName:`${d.type==='video'?'运动视频':'现场照片'} ${i+1}`,byteCount:d.byteCount}))});
  }
  } catch(error) { for(const url of newUrls)URL.revokeObjectURL(url);throw error; }
  for(const url of urls)URL.revokeObjectURL(url);
  urls.clear();for(const url of newUrls)urls.add(url);
  return loaded;
}
let savedRecords=[];
try {savedRecords=await hydrateRecords();} catch {document.querySelector('#experience-notice').textContent='本地记录暂时无法读取，请刷新重试';}
app.enterLocalPreview=function() {
  const workspace=buildLocalPreviewWorkspace();
  workspace.student.id=owner;workspace.student.name='体验学生';
  workspace.records=[...savedRecords,...workspace.records];
  Object.assign(this.state,{systemMode:'NORMAL',systemModeChecked:true,isRestoringSession:false,privacyConsentChecked:true,
    needsPrivacyConsent:false,loginPrivacyAccepted:true,authenticated:true,requiresContactBinding:false,
    postEnrollmentGuideCompleted:true,preLoginGuideCompleted:true,showEmailLogin:false,showScanJoin:false,
    showRecoveryRequest:false,lastError:null,isShowingCachedData:false,isLoading:false,workspace,tab:'dashboard'});
  this.render();return true;
};
const actualRender=app.render.bind(app);
app.render=function() {
  const session=loadSession(owner);
  if(session && ['active','paused','finished'].includes(session.phase) && !session.maximumDurationSeconds) {
    session.maximumDurationSeconds=this.state.workspace.creditPolicy?.maxCreditMinutes*60;
    saveSession(owner,session);
  }
  if(this.ui.checkin) this.ui.checkin.previewTransfer=true;
  return actualRender();
};
app.start(viewport);
renderCheckIn(app);
await restoreCheckinContinuity(app);
app.actions['checkin.submit']=async a=>{
  const session=loadSession(owner),ui=a.ui.checkin;
  if(session?.phase!=='finished'||ui.finish.submitting)return;
  if(!ui.drafts.length||!session.details.description?.trim()||ui.drafts.some(d=>d.normalizationPending)) {checkinActions['checkin.submit'](a);return;}
  let record;
  const sport=SPORT_OPTIONS.find(item=>item.value===session.details.sportType)?.zh||session.details.customSportName||'运动';
  try {record=experienceRecord({session,drafts:ui.drafts,minimumMinutes:a.state.workspace.creditPolicy?.minCreditThresholdMinutes,sportLabel:sport,businessDate:businessToday(new Date(session.startedAt)),submittedAt:businessDateTime(new Date())});}
  catch(error) {ui.finish.error={title:'请检查记录',message:error.message};a.render();return;}
  ui.finish.submitting=true;ui.finish.error=null;ui.previewProofStates={};ui.uploadProgress={phase:'WAITING'};a.render();
  try {
    const result=await saveExperienceRecord({record,drafts:[...ui.drafts],storage,onProgress:progress=>{
      ui.uploadDraftId=progress.draftId;
      if(progress.phase==='SAVED')ui.previewProofStates[progress.draftId]='saved';
      ui.uploadProgress={phase:progress.phase};a.render();
    }});
    // Success follows read-back of the durable record, never a timer or animation callback.
    savedRecords=await hydrateRecords();
    a.state.workspace.records=[...savedRecords,...buildLocalPreviewWorkspace().records];
    saveSession(owner,{...session,phase:'submitted',summary:{duration:formatTimer(session.activeDurationMillis),sportType:sport,creditType:session.details.creditType==='course'?'课程相关':'自主运动',proofCount:ui.drafts.length}});
    ui.finish.submitting=false;ui.freshRecordId=result.record.id;
    release(ui.drafts);ui.drafts=[];ui.uploadDraftId=null;ui.uploadProgress=null;
    await clearProofDrafts(owner,'pending').catch(()=>{});
    a.render();if(result.created)void previewCheckinCelebration(a._viewport);
  } catch(error) {
    ui.finish.submitting=false;ui.finish.error={title:'本地保存未完成',message:error.message==='记录尚未保存成功，请重试。'?error.message:'本机存储暂时不可用，凭证与说明已保留，请重试。'};a.render();
  }
};
app.actions['checkin.refreshRecords']=async a=>{
  const ui=a.ui.checkin;ui.loadingRecords=true;ui.recordListError=null;a.render();
  try {savedRecords=await hydrateRecords();a.state.workspace.records=[...savedRecords,...buildLocalPreviewWorkspace().records];}
  catch {ui.recordListError={title:'本地记录暂时无法读取',message:'请刷新后重试。'};}
  finally {ui.loadingRecords=false;a.render();}
};
document.querySelector('#experience-info').addEventListener('click',()=>app.showDialog({title:'学生使用体验',body:'从首页开始运动，计时按实际时间推进。最低时长为 30 分钟，120 分钟自动结束。可拍摄或选择凭证，结束后填写说明并保存记录。体验数据仅保存在此浏览器，审核状态为示例。',buttons:[{label:'知道了',action:'dialog.close'}]}));
// Old scene URLs open the same continuous experience; there is no state injection.
if(location.search) {
  const logoMotion = new URLSearchParams(location.search).get('logoMotion');
  history.replaceState(history.state, '', ['full', 'reduced'].includes(logoMotion) ? `/?logoMotion=${logoMotion}` : '/');
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')app.render();});
window.addEventListener('pagehide',()=>{for(const url of urls)URL.revokeObjectURL(url);});
app.render();
