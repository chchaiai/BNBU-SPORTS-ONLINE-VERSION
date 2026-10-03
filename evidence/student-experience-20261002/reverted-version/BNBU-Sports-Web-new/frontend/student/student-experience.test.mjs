import test from 'node:test';
import assert from 'node:assert/strict';
import {app as studentApp} from './js/app.js';
import {buildLocalPreviewWorkspace} from './js/local-preview.js';
import {saveSession,loadSession} from './js/session.js';
import {renderDashboard,dashboardActions} from './js/screens/dashboard.js';
import {renderCourses} from './js/screens/courses.js';
import {renderGrades} from './js/screens/grades.js';
import {renderProfile,renderAccountDetails} from './js/screens/profile.js';
import {renderStudentRecords,checkinActions,checkinBackInterceptor} from './js/screens/checkin.js';
import {notificationAction} from './js/screens/notifications.js';
import {applicationProofStatus,applicationProofStatusHtml} from './js/application-proof-queue.js';
import {studentScrollKey,progressMarkup,restoreStudentExperience} from './js/student-experience.js';

function fixture(t) {
  const memory = new Map();
  globalThis.localStorage = {getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
  t.after(()=>delete globalThis.localStorage);
  return {state:{workspace:buildLocalPreviewWorkspace(),tab:'dashboard'},ui:{},actions:{},scrollPositions:new Map(),
    isApiMode:()=>false,isLocalPreview:()=>true,isWriteAllowed:()=>true,hasActiveEnrollment:()=>true,
    unreadNoticeCount:()=>3,canStartNewCourseJoin:()=>false,render(){},selectTab:studentApp.selectTab,
    screenKey(){return `tab-${this.state.tab}`;}};
}
test('history navigation retains the exact exercise and restores its own detail selection',t=>{
  const app=fixture(t),owner=app.state.workspace.student.id;
  const session={phase:'active',startedAt:Date.now()-60000,lastResumedAt:Date.now(),accumulatedMs:60000,details:{sportType:'badminton'}};
  saveSession(owner,session);
  app.state.tab='grades';app.ui.grades={section:'records'};
  app.ui.checkin={selectedRecordId:'record-one',drafts:[{id:'retained-proof'}]};
  app.selectTab('checkin');
  assert.equal(app.ui.checkin.selectedRecordId,null);
  assert.deepEqual(loadSession(owner),session);
  assert.equal(app.ui.checkin.drafts[0].id,'retained-proof');
  app.selectTab('grades');assert.equal(app.ui.checkin.selectedRecordId,'record-one');
});
test('home records CTA opens the list without clearing a finished exercise or its notes',t=>{
  const app=fixture(t),owner=app.state.workspace.student.id;
  const session={phase:'finished',activeDurationMillis:2100000,details:{description:'保留的说明'}};
  saveSession(owner,session);app.ui.checkin={selectedRecordId:'old'};
  app.ui.grades={section:'records',selectedRecordId:'old'};
  dashboardActions['dashboard.openRecords'](app);
  assert.equal(app.state.tab,'grades');assert.equal(app.ui.checkin.selectedRecordId,null);assert.deepEqual(loadSession(owner),session);
});
test('progress, records, details and different courses have independent scroll positions',t=>{
  const app=fixture(t);app.state.tab='grades';app.ui.grades={section:'progress'};
  const keys=[studentScrollKey(app)];app.ui.grades.section='records';keys.push(studentScrollKey(app));
  app.ui.checkin={selectedRecordId:'record'};keys.push(studentScrollKey(app));
  app.state.tab='courses';keys.push(studentScrollKey(app));app.ui.courses={selectedCourseId:'second'};keys.push(studentScrollKey(app));
  assert.equal(new Set(keys).size,5);
});
test('records hub reuses review meaning and reads details without mutating an exercise',t=>{
  const app=fixture(t),owner=app.state.workspace.student.id;app.state.tab='grades';app.ui.grades={section:'records'};
  saveSession(owner,{phase:'paused',accumulatedMs:90000,details:{sportType:'running'}});
  const before=loadSession(owner);const html=renderStudentRecords(app);
  assert.match(html,/有效 · 已计入/);assert.match(html,/未计入学时/);
  const id=app.state.workspace.records[0].id;
  checkinActions['checkin.openRecord'](app,{dataset:{recordId:id}});
  assert.match(renderStudentRecords(app),/record-detail/);
  assert.equal(checkinBackInterceptor(app),true);assert.equal(app.ui.checkin.selectedRecordId,null);
  assert.deepEqual(loadSession(owner),before);
});
test('unknown totals and category values stay unknown while a known value survives refresh',t=>{
  const app=fixture(t);app.state.isLoading=true;
  let html=renderGrades(app);assert.match(html,/>630<\/strong>/);assert.match(html,/更新中/);
  app.state.workspace.progress={totalValidHours:null,course:null,general:undefined};app.state.workspace.hourRule={total:null};
  html=renderGrades(app);assert.doesNotMatch(html,/>0<\/strong>|还需 0/);assert.match(html,/>—<\/strong>/);
  assert.doesNotMatch(progressMarkup('semester',null,20),/aria-valuenow/);
  assert.match(progressMarkup('semester',0,20),/aria-valuenow="0"/);
});
test('home has one ongoing action and promotes proof tasks above the semester summary',t=>{
  const app=fixture(t);saveSession(app.state.workspace.student.id,{phase:'paused',accumulatedMs:60000,details:{sportType:'running'}});
  let html=renderDashboard(app);assert.equal((html.match(/data-action="dashboard.openCheckIn"/g)||[]).length,1);
  assert.doesNotMatch(html,/home-proof-empty|checkin-return-host/);
  app.state.workspace.proofTodos=[{recordId:'proof',remainingSeconds:1200}];html=renderDashboard(app);
  assert.ok(html.indexOf('home-todos')<html.indexOf('home-summary'));
});
test('one course opens directly and a second enrollment entry remains available when allowed',t=>{
  const app=fixture(t);let html=renderCourses(app);
  assert.match(html,/查看完整要求/);assert.doesNotMatch(html,/data-action="courses.open"/);
  app.canStartNewCourseJoin=()=>true;html=renderCourses(app);assert.match(html,/data-action="courses.scan"/);
  app.ui.courses={selectedCourseId:null};app.state.workspace.courses.push({...app.state.workspace.courses[0],id:'second',classSectionId:'second',enrollmentId:'second'});
  html=renderCourses(app);assert.equal((html.match(/data-action="courses.open"/g)||[]).length,2);
});
test('an unselected course cannot display the selected course policy',t=>{
  const app=fixture(t),second={...app.state.workspace.courses[0],id:'second',classSectionId:'second',enrollmentId:'second'};
  app.state.workspace.courses.push(second);app.ui.courses={selectedCourseId:'second'};
  const html=renderCourses(app);assert.doesNotMatch(html,/30 分钟/);assert.match(html,/切换到此课程查看要求/);
});
test('profile keeps secondary identity facts in details and does not expose preview storage identity',t=>{
  const app=fixture(t);app.state.workspace.student.id='STUDENT-EXPERIENCE-LOCAL';
  assert.doesNotMatch(renderProfile(app),/STUDENT-EXPERIENCE-LOCAL|profile-facts-row/);
  assert.match(renderAccountDetails(app),/本地预览班/);assert.match(renderProfile(app),/data-disclosure="memberships"/);
});
test('notification CTAs follow actionable identifiers, never inferred copy',()=>{
  const notice={targetId:'record',kind:'review',title:'needs proof'};
  assert.equal(notificationAction(notice).kind,'record');
  assert.equal(notificationAction(notice,[{recordId:'record'}]).kind,'proof');
  assert.equal(notificationAction({title:'请补证'}),null);
  assert.equal(notificationAction({opensExemption:true,targetId:'application'}).kind,'application');
});
test('application upload bytes are distinct from accepted media and submitted application',()=>{
  assert.equal(applicationProofStatus({transfer:{phase:'UPLOADING',percent:100}}).phase,'UPLOADING');
  assert.equal(applicationProofStatus({transfer:{phase:'SUCCESS'}}).phase,'SUCCESS');
  assert.equal(applicationProofStatus({mediaId:'accepted',transfer:{phase:'FAILED'}}).phase,'SAVED');
  assert.match(applicationProofStatusHtml({mediaId:'accepted'}),/待提交申请/);
  assert.doesNotMatch(applicationProofStatusHtml({transfer:{phase:'UPLOADING',percent:null}}),/aria-valuenow/);
  assert.match(applicationProofStatusHtml({transfer:{phase:'FAILED'}}),/重试/);
});
test('numeric motion skips first load, unchanged values, unknown readings, reduced motion and hidden pages',async t=>{
  const app=fixture(t);let calls=0,reduced=false;
  globalThis.document={hidden:false,activeElement:null,addEventListener(){}};
  globalThis.matchMedia=()=>({matches:reduced,addEventListener(){}});
  t.after(()=>{delete globalThis.document;delete globalThis.matchMedia;});
  const number={isConnected:true,dataset:{studentNumber:'semester',value:'5'},animate(){calls++;return {finished:Promise.resolve(),effect:{target:number},cancel(){}};}};
  const root={dataset:{},addEventListener(){},querySelector(){return null;},querySelectorAll(selector){return selector==='[data-student-number], [data-student-progress]'?[number]:[];}};
  restoreStudentExperience(app,null,root);assert.equal(calls,0);
  number.dataset.value='6';restoreStudentExperience(app,null,root);assert.equal(calls,1);
  restoreStudentExperience(app,null,root);assert.equal(calls,1);
  number.dataset.value='';restoreStudentExperience(app,null,root);number.dataset.value='7';restoreStudentExperience(app,null,root);assert.equal(calls,1);
  reduced=true;number.dataset.value='8';restoreStudentExperience(app,null,root);assert.equal(calls,1);
  reduced=false;document.hidden=true;number.dataset.value='9';restoreStudentExperience(app,null,root);assert.equal(calls,1);
  document.hidden=false;app.state.workspace.student.id='another-account';number.dataset.value='10';restoreStudentExperience(app,null,root);assert.equal(calls,1);
});
