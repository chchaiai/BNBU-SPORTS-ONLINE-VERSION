// Verify the three student UI changes with real backend workspace data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,firefox} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const cloud=process.env.BNBU_STUDENT_UI_CLOUD==='1';
const origin=cloud?'https://www.student.bnbusports.cn':'http://127.0.0.1:4274';
const firefoxMode=process.env.BNBU_BROWSER==='firefox';const browser=firefoxMode?await firefox.launch({headless:true,firefoxUserPrefs:{'media.navigator.streams.fake':true,'media.navigator.permission.disabled':true}}):await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});

try{
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});
 await context.route('**/student/js/screens/checkin.js',async route=>{const response=await route.fetch();const source=await response.text();assert.ok(source.includes('export async function readVideoPreview(url) {'));await route.fulfill({response,body:source.replace('export async function readVideoPreview(url) {','export async function readVideoPreview(url) { return {durationSeconds:null,thumbnailUrl:null};')});});
 if(cloud){const fixture=JSON.parse(fs.readFileSync('.local/mobile-cloud-private.json','utf8'));await context.addInitScript(auth=>{localStorage.setItem('bnbu.student.web.apiTokens',JSON.stringify(auth));localStorage.setItem('bnbu.student.web.session',JSON.stringify({kind:'api',accountId:auth.accountId,signedInAt:new Date().toISOString()}));},{...fixture.studentSession,userId:fixture.student.userId,accountId:'SYNTH-SESSION-'+fixture.student.email.split('.')[2].toUpperCase(),schemaVersion:2});}
 let page=await context.newPage();page.setDefaultTimeout(60000);await page.goto(origin+'/student/');
 if(cloud)await page.getByRole('button',{name:'同意并继续',exact:true}).click();
 if(!cloud){
  const student=JSON.parse(fs.readFileSync('.local/v81-browser-state/new-student-join.json','utf8'));
  await page.getByRole('button',{name:'同意并继续',exact:true}).click();await page.getByText('直接登录',{exact:true}).click();await page.getByText('邮箱验证码登录',{exact:true}).click();await page.getByPlaceholder('name@bnbu.edu.cn').fill(student.email);
  const prior=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=50')).json(),ids=new Set(prior.messages.map(m=>m.ID));
  await page.getByRole('button',{name:'获取验证码',exact:true}).click();let code;
  for(let i=0;i<30&&!code;i++){const messages=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=50')).json();const message=messages.messages.find(m=>!ids.has(m.ID)&&JSON.stringify(m.To).includes(student.email));if(message){const full=await(await fetch('http://127.0.0.1:18025/api/v1/message/'+message.ID)).json();code=(full.Text||'').match(/\b\d{6}\b/)?.[0];}if(!code)await new Promise(r=>setTimeout(r,500));}
  assert.ok(code);await page.getByPlaceholder('4–10 位数字').fill(code);await page.getByRole('button',{name:'登录',exact:true}).click();
 }

 await page.evaluate(async()=>{window.loadingProbeApp=(await import('/student/js/app.js')).app;});
 await page.waitForFunction(()=>window.loadingProbeApp.state.authenticated&&!window.loadingProbeApp.state.isLoading&&!window.loadingProbeApp.state.isRestoringSession&&window.loadingProbeApp.state.workspace.student.id);
 if(await page.getByText('运动指引',{exact:true}).isVisible())await page.getByRole('button',{name:'跳过',exact:true}).click();


 if(await page.locator('[data-action="root.tab"][data-tab="checkin"]').isVisible())await page.locator('[data-action="root.tab"][data-tab="checkin"]').click();
 const session=()=>page.evaluate(async()=>{const {loadSession}=await import('/student/js/session.js');return loadSession(window.loadingProbeApp.state.workspace.student.id);});
 if(!(await session())?.serverId){await page.locator('[data-action="checkin.creditType"][data-value="general"]').click();await page.locator('[data-action="checkin.start"]').click();await page.locator('[data-action="checkin.ackHealth"]').click();await page.waitForFunction(async()=>{const {loadSession}=await import('/student/js/session.js');return Boolean(loadSession(window.loadingProbeApp.state.workspace.student.id)?.serverId);});}
 await page.locator('[data-action="checkin.capturePhoto"]').click();await page.locator('[data-action="checkin.cameraTakePhoto"]').click();await page.waitForFunction(()=>window.loadingProbeApp.ui.checkin.drafts.length>0);
 if(process.env.BNBU_EXPECT_CONTINUITY==='1') {
  await page.evaluate(()=>window.loadingProbeApp.actions['checkin.videoNoticeContinue'](window.loadingProbeApp));
  await page.locator('[data-action="checkin.cameraStartVideo"]:enabled').click();await page.waitForTimeout(2500);await page.locator('[data-action="checkin.cameraStopVideo"]').click();
  await page.waitForFunction(()=>window.loadingProbeApp.ui.checkin.drafts.some(d=>d.type==='video'&&!d.normalizationPending),null,{timeout:120000});
 }
 const before=await page.evaluate(async()=>{const {loadSession,sessionDurationMs}=await import('/student/js/session.js');const s=loadSession(window.loadingProbeApp.state.workspace.student.id);return {id:s.serverId,ms:sessionDurationMs(s),drafts:window.loadingProbeApp.ui.checkin.drafts.length};});
 await page.reload();await page.evaluate(async()=>{window.loadingProbeApp=(await import('/student/js/app.js')).app;});await page.waitForFunction(()=>window.loadingProbeApp.state.authenticated&&!window.loadingProbeApp.state.isLoading&&!window.loadingProbeApp.state.isRestoringSession&&window.loadingProbeApp.state.workspace.student.id);
 if(await page.locator('[data-action="root.tab"][data-tab="checkin"]').isVisible())await page.locator('[data-action="root.tab"][data-tab="checkin"]').click();
 if(process.env.BNBU_EXPECT_CONTINUITY==='1')await page.waitForFunction(()=>window.loadingProbeApp.ui.checkin.drafts.length>0);
 const after=await page.evaluate(async()=>{const {loadSession,sessionDurationMs}=await import('/student/js/session.js');const s=loadSession(window.loadingProbeApp.state.workspace.student.id);return {id:s?.serverId,ms:sessionDurationMs(s),drafts:window.loadingProbeApp.ui.checkin.drafts.length};});
 assert.equal(after.id,before.id);assert.ok(after.ms>=before.ms);
 if(process.env.BNBU_EXPECT_CONTINUITY==='1')assert.equal(after.drafts,before.drafts);else assert.equal(after.drafts,0);
 if(process.env.BNBU_EXPECT_CONTINUITY==='1') {
  const hashes=()=>page.evaluate(async()=>Promise.all(window.loadingProbeApp.ui.checkin.drafts.map(async d=>({id:d.id,bytes:d.blob.size,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await d.blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('')}))));
  const expected=await hashes();
  if(!firefoxMode){const cdp=await context.newCDPSession(page);await cdp.send('Page.setWebLifecycleState',{state:'frozen'});await new Promise(r=>setTimeout(r,2500));await cdp.send('Page.setWebLifecycleState',{state:'active'});}
  await context.setOffline(true);await page.waitForTimeout(500);assert.deepEqual(await hashes(),expected);await context.setOffline(false);
  await page.close();page=await context.newPage();await page.goto(origin+'/student/');await page.evaluate(async()=>{window.loadingProbeApp=(await import('/student/js/app.js')).app;});
  await page.waitForFunction(()=>window.loadingProbeApp.state.authenticated&&!window.loadingProbeApp.state.isLoading&&window.loadingProbeApp.ui.checkin?.drafts.length===2);
  assert.equal(await page.evaluate(()=>window.loadingProbeApp.state.tab),'checkin');assert.deepEqual(await hashes(),expected);
  const photo=page.locator('[data-action="checkin.previewDraft"]').first();await photo.click();await page.waitForFunction(()=>document.querySelector('img.proof-preview-media')?.naturalWidth>0);await page.locator('[data-action="checkin.closeDraftPreview"]').click();
  const videoId=await page.evaluate(()=>window.loadingProbeApp.ui.checkin.drafts.find(d=>d.type==='video').id);await page.locator(`[data-action="checkin.previewDraft"][data-draft-id="${videoId}"]`).click();await page.waitForFunction(()=>document.querySelector('[data-proof-preview-video]')?.readyState>=2);await page.locator('[data-proof-preview-video]').evaluate(async video=>{video.muted=true;await video.play();});await page.waitForFunction(()=>document.querySelector('[data-proof-preview-video]')?.currentTime>0.2);await page.locator('[data-action="checkin.closeDraftPreview"]').click();
  await page.screenshot({path:'.local/mobile-records-'+(cloud?'cloud':'local')+'.png',fullPage:true,animations:'disabled'});
  await page.locator('[data-action="checkin.requestFinish"]').click();await page.locator('[data-action="checkin.confirmFinish"]').click();await page.locator('#checkin-description').fill('Synthetic continuity acceptance: retained photo and video after restart');
  await page.reload();await page.evaluate(async()=>{window.loadingProbeApp=(await import('/student/js/app.js')).app;});await page.locator('#checkin-description').waitFor();
  assert.equal(await page.locator('#checkin-description').inputValue(),'Synthetic continuity acceptance: retained photo and video after restart');assert.deepEqual(await hashes(),expected);
  const submitted=page.waitForResponse(r=>/\/exercise-records\/[^/]+\/submit$/.test(new URL(r.url()).pathname)&&r.request().method()==='POST',{timeout:60000});
  await page.locator('[data-action="checkin.submit"]').click();const response=await submitted;assert.equal(response.status(),200);const record=(await response.json()).data;
  await page.getByText('提交成功',{exact:true}).waitFor();
  const retained=await page.evaluate(async scope=>{const {loadProofDrafts}=await import('/student/js/checkin-drafts.js');return(await loadProofDrafts(window.loadingProbeApp.state.workspace.student.id,scope)).length;},before.id);assert.equal(retained,0);
  fs.writeFileSync('.local/mobile-records-'+(cloud?'cloud':'local')+'-record.json',JSON.stringify({recordId:record.id,sessionId:before.id,expectedHours:0}));
  await page.locator('[data-action="checkin.viewRecords"]').click();await page.reload();await page.locator('[data-action="root.tab"][data-tab="checkin"]').click();await page.locator('[data-action="checkin.tab"][data-tab="records"]').click();const submittedCard=page.locator(`[data-action="checkin.openRecord"][data-record-id="${record.id}"]`);await submittedCard.waitFor();assert.match(await submittedCard.innerText(),/待|处理/);await page.screenshot({path:'.local/mobile-records-'+(cloud?'cloud':'local')+'-pending.png',animations:'disabled'});
  console.log(JSON.stringify({check:'PENDING_RECORD_VISIBLE_AFTER_RELOAD',result:'PASS',recordId:record.id,previewDurationUnavailable:true,thumbnailUnavailable:true,actualVideoUploaded:true,engine:firefoxMode?"Firefox":"Chromium",webmConvertedToMp4:firefoxMode}));
  console.log(JSON.stringify({check:'FINISHED_DESCRIPTION_REOPEN_SUBMIT_DURABLE_CLEANUP',result:'PASS',recordId:record.id,submittedStatus:response.status(),remainingDrafts:retained}));
  console.log(JSON.stringify({check:'FROZEN_OFFLINE_PAGE_CLOSE_REOPEN_BYTES',result:'PASS',drafts:expected.length,automaticCheckinRestore:true,byteHashesEqual:true}));
 }
 console.log(JSON.stringify({check:'REAL_SESSION_RELOAD_MEDIA_CONTINUITY',result:process.env.BNBU_EXPECT_CONTINUITY==='1'?'PASS':'REPRODUCED_MEDIA_LOSS',before,after}));
}catch(error){for(const context of browser.contexts())for(const page of context.pages()){console.log(JSON.stringify({check:'MOBILE_FAILURE_DETAILS',ui:await page.evaluate(()=>({captureError:window.loadingProbeApp?.ui.checkin?.captureError,normalizing:window.loadingProbeApp?.ui.checkin?.normalizingVideo})).catch(()=>null)}));}throw error;}finally{await browser.close();}
