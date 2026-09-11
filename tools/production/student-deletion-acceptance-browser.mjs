import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const fixture=JSON.parse(fs.readFileSync('.local/student-deletion-cloud-private.json'));
const studentOrigin='https://www.student.bnbusports.cn',portalOrigin='https://www.teacher.bnbusports.cn';
const submissionFile='.local/student-deletion-cloud-submission.json',storageFile='.local/student-deletion-cloud-storage.json';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
async function api(path,token,body){const r=await fetch(studentOrigin+'/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':randomUUID()},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:(await r.json()).data};}
async function login(page,account){await page.goto(portalOrigin);await page.locator('#login-account').fill(account.email);await page.locator('#login-password').fill(account.password);const reply=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/auth/password-login'));await page.getByRole('button',{name:'登录',exact:true}).click();assert.equal((await reply).status(),200);return(await(await reply).json()).data.accessToken;}
async function ready(page){await page.evaluate(async()=>{window.deletionApp=(await import('/student/js/app.js')).app;});await page.waitForFunction(()=>window.deletionApp.state.authenticated&&!window.deletionApp.state.isLoading&&!window.deletionApp.state.isRestoringSession);}
try {
 if(process.argv[2]==='--prepare'){
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});
  await context.addInitScript(auth=>{localStorage.setItem('bnbu.student.web.apiTokens',JSON.stringify(auth));localStorage.setItem('bnbu.student.web.session',JSON.stringify({kind:'api',accountId:auth.accountId,signedInAt:new Date().toISOString()}));},{...fixture.studentSession,userId:fixture.student.userId,accountId:'SYNTH-SESSION-'+fixture.student.email.split('.')[2].toUpperCase(),schemaVersion:2});
  const page=await context.newPage();page.setDefaultTimeout(60000);await page.goto(studentOrigin+'/student/');await page.getByRole('button',{name:'同意并继续',exact:true}).click();await ready(page);
  if(await page.getByText('运动指引',{exact:true}).isVisible())await page.getByRole('button',{name:'跳过',exact:true}).click();
  await page.locator('[data-action="root.tab"][data-tab="checkin"]').click();await page.locator('[data-action="checkin.creditType"][data-value="general"]').click();
  await page.locator('[data-action="checkin.start"]').click();await page.locator('[data-action="checkin.ackHealth"]').click();
  await page.locator('[data-action="checkin.capturePhoto"]').click();await page.locator('[data-action="checkin.cameraTakePhoto"]').click();await page.waitForFunction(()=>window.deletionApp.ui.checkin.drafts.length===1);
  await page.evaluate(()=>window.deletionApp.actions['checkin.videoNoticeContinue'](window.deletionApp));await page.locator('[data-action="checkin.cameraStartVideo"]:enabled').click();await page.waitForTimeout(2500);await page.locator('[data-action="checkin.cameraStopVideo"]').click();await page.waitForFunction(()=>window.deletionApp.ui.checkin.drafts.length===2);
  await page.locator('[data-action="checkin.requestFinish"]').click();await page.locator('[data-action="checkin.confirmFinish"]').click();await page.locator('#checkin-description').fill('Independent student erasure acceptance: real camera API photo and video');
  const accepted=page.waitForResponse(r=>/\/exercise-records\/[^/]+\/submit$/.test(new URL(r.url()).pathname)&&r.request().method()==='POST');await page.locator('[data-action="checkin.submit"]').click();const response=await accepted;assert.equal(response.status(),200);const record=(await response.json()).data;
  await context.storageState({path:storageFile});
  fs.writeFileSync(submissionFile,JSON.stringify({studentId:fixture.student.studentId,recordId:record.id}));
  const teacherPage=await browser.newPage();teacherPage.setDefaultTimeout(60000);const teacher=await login(teacherPage,fixture.teacher);
  const student=(await api('/students/'+fixture.student.studentId,teacher)).data;
  await teacherPage.getByRole('button',{name:'打卡审核',exact:true}).click();await teacherPage.getByRole('tab',{name:/全部记录/}).click();
  await teacherPage.getByRole('row').filter({hasText:student.fullName}).getByRole('button',{name:/查看记录/}).click();const row=teacherPage.locator('#checkin-record-'+record.id);await row.waitFor();
  const evidence=(await api('/exercise-records/'+record.id+'/evidence-context',teacher)).data;assert.equal(evidence.mediaIds.length,2);
  await row.locator('.checkin-description').click();const mediaDialog=teacherPage.getByRole('dialog');const tabs=mediaDialog.getByRole('tablist',{name:'选择要审核的凭证'}).getByRole('tab');assert.equal(await tabs.count(),2);
  for(let index=0;index<2;index++){await tabs.nth(index).click();await teacherPage.waitForFunction(()=>!!document.querySelector('.teacher-original-media img,.teacher-original-media video'));
   if(await mediaDialog.locator('video').count()){await mediaDialog.locator('video').evaluate(async el=>{el.muted=true;await el.play();});await teacherPage.waitForFunction(()=>document.querySelector('.teacher-original-media video')?.currentTime>0.2);}
   else await teacherPage.waitForFunction(()=>document.querySelector('.teacher-original-media img')?.naturalWidth>0);
  }
  await mediaDialog.getByRole('button',{name:'关闭',exact:true}).click();
  await row.getByRole('radio',{name:'通过',exact:true}).click();const dialog=teacherPage.getByRole('dialog');await dialog.locator('textarea').fill('学生删除验收：已核对现场照片和视频。');
  const reviewed=teacherPage.waitForResponse(r=>new URL(r.url()).pathname.includes(record.id)&&r.request().method()==='POST');await dialog.getByRole('button',{name:'确认通过',exact:true}).click();assert.ok((await reviewed).ok());
  await page.reload();await ready(page);await page.locator('[data-action="root.tab"][data-tab="checkin"]').click();await page.locator('[data-action="checkin.tab"][data-tab="records"]').click();await page.locator(`[data-action="checkin.openRecord"][data-record-id="${record.id}"]`).waitFor();
  await page.screenshot({path:'.local/student-deletion-cloud-before.png',fullPage:true});await context.storageState({path:storageFile});
  fs.writeFileSync(submissionFile,JSON.stringify({studentId:fixture.student.studentId,recordId:record.id,mediaIds:evidence.mediaIds,studentNumber:student.studentNumber}));
  console.log(JSON.stringify({check:'CLOUD_STUDENT_ERASURE_FIXTURE_BUSINESS_LOOP',result:'PASS',recordId:record.id,photoAndVideoViewed:true,teacherReviewSaved:true,studentRecordVisible:true,shortSession:true,syntheticCamera:true}));
 } else {
  assert.equal(process.argv[2],'--delete');const submission=JSON.parse(fs.readFileSync(submissionFile));assert.equal(submission.studentId,fixture.student.studentId);
  const context=await browser.newContext({storageState:storageFile});const studentPage=await context.newPage();studentPage.setDefaultTimeout(60000);await studentPage.goto(studentOrigin+'/student/');await ready(studentPage);
  const studentToken=await studentPage.evaluate(()=>JSON.parse(localStorage.getItem('bnbu.student.web.apiTokens')).accessToken);assert.equal((await api('/me',studentToken)).status,200);
  const adminPage=await browser.newPage();adminPage.setDefaultTimeout(60000);const admin=await login(adminPage,fixture.admin);
  await adminPage.getByRole('button',{name:'用户与账号',exact:true}).click();await adminPage.getByPlaceholder(/搜索/).first().fill(submission.studentNumber);
  await adminPage.getByRole('row').filter({hasText:submission.studentNumber}).getByRole('button',{name:/详情/}).click();await adminPage.getByRole('button',{name:'删除学生账号',exact:true}).click();
  await adminPage.getByLabel('删除原因').fill('独立腾讯云验收账号：删除账号及全部打卡审核学时记录');await adminPage.getByLabel(`输入学号 ${submission.studentNumber} 确认`).fill(submission.studentNumber);
  const deleted=adminPage.waitForResponse(r=>new URL(r.url()).pathname===`/api/v1/admin/students/${submission.studentId}/delete`&&r.request().method()==='POST');await adminPage.getByRole('button',{name:'永久删除学生及历史记录',exact:true}).click();const response=await deleted;assert.equal(response.status(),201);
  assert.equal((await response.json()).data.deleted,true);await adminPage.getByRole('button',{name:'永久删除学生及历史记录',exact:true}).waitFor({state:'hidden'});
  await adminPage.reload();await adminPage.getByRole('button',{name:'用户与账号',exact:true}).click();await adminPage.getByPlaceholder(/搜索/).first().fill(submission.studentNumber);await adminPage.waitForTimeout(500);assert.equal(await adminPage.getByRole('row').filter({hasText:submission.studentNumber}).count(),0);
  assert.equal((await api('/students/'+submission.studentId,admin)).status,404);assert.equal((await api('/me',studentToken)).status,401);
  for(const peer of fixture.peers)assert.equal((await api('/students/'+peer.studentId,admin)).status,200);
  await adminPage.screenshot({path:'.local/student-deletion-cloud-after.png',fullPage:true});
  console.log(JSON.stringify({check:'CLOUD_ADMIN_STUDENT_DELETE_BROWSER',result:'PASS',studentId:submission.studentId,recordId:submission.recordId,oldSessionRejected:true,peerStudentsRetained:fixture.peers.length,refreshListAbsent:true}));
 }
}finally{await browser.close();}
