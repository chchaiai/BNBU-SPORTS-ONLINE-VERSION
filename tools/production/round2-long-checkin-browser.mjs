import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const fixture=JSON.parse(fs.readFileSync('.local/round2-cloud-long-private.json','utf8'));
const origin='https://www.student.bnbusports.cn';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
let stage='SESSION_BOOTSTRAP',page;
const errors=[];
try{
 page=await browser.newPage({permissions:['camera','microphone'],timezoneId:'Asia/Shanghai'});page.setDefaultTimeout(45000);
 page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/v1/')&&r.status()>=400)errors.push({path:new URL(r.url()).pathname,status:r.status()});});
 await page.addInitScript(auth=>{if(!localStorage.getItem('bnbu.student.web.apiTokens'))localStorage.setItem('bnbu.student.web.apiTokens',JSON.stringify(auth));if(!localStorage.getItem('bnbu.student.web.session'))localStorage.setItem('bnbu.student.web.session',JSON.stringify({kind:'api',accountId:auth.accountId,signedInAt:new Date().toISOString()}));},{...fixture.studentSession,userId:fixture.student.userId,accountId:'SYNTH-SESSION-'+fixture.student.email.split('.')[2].toUpperCase(),schemaVersion:2});
 await page.goto(origin+'/student/');
 await page.getByRole('button',{name:'同意并继续',exact:true}).click();
 await page.getByText('我的',{exact:true}).or(page.getByText('运动指引',{exact:true})).first().waitFor();
 if(await page.getByText('运动指引',{exact:true}).isVisible())await page.getByRole('button',{name:'跳过',exact:true}).click();
 console.log(JSON.stringify({check:'CLOUD_STUDENT_SESSION_RESTORED',result:'PASS',sessionSetup:'isolated fixture bootstrap, no SMTP claim'}));
 await page.reload();
 await page.getByText('我的',{exact:true}).or(page.getByText('运动指引',{exact:true})).first().waitFor();if(await page.getByText('运动指引',{exact:true}).isVisible())await page.getByRole('button',{name:'跳过',exact:true}).click();
 await page.getByText('我的',{exact:true}).waitFor();
 stage='START';await page.locator('[data-tab="checkin"]').click();
 await page.locator('[data-action="checkin.creditType"][data-value="general"]').or(page.getByText('运动指引',{exact:true})).first().waitFor();
 if(await page.getByText('运动指引',{exact:true}).isVisible()){await page.getByRole('button',{name:'跳过',exact:true}).click();await page.locator('[data-tab="checkin"]').click();}
 await page.locator('[data-action="checkin.creditType"][data-value="general"]').click();
 await page.locator('[data-action="checkin.start"]').click();
 const startResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/exercise-sessions'&&r.request().method()==='POST');
 await page.locator('[data-action="checkin.ackHealth"]').click();
 const started=await startResponse;assert.equal(started.status(),201);const session=(await started.json()).data;
 fs.writeFileSync('.local/round2-cloud-long-session.json',JSON.stringify({sessionId:session.id,startedAt:new Date().toISOString(),minimumMinutes:30}));
 stage='PHOTO';await page.locator('[data-action="checkin.capturePhoto"]').click();await page.locator('[data-action="checkin.cameraTakePhoto"]').click();await page.getByText(/照片 1\//).waitFor();
 for(const action of ['pause','resume']){const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith(`/exercise-sessions/${session.id}/${action}`)&&r.request().method()==='POST');await page.locator(`[data-action="checkin.${action}"]`).click();assert.ok((await response).ok());}
 stage='VIDEO';await page.locator('[data-action="checkin.captureVideo"]').click();await page.locator('[data-action="checkin.videoNoticeContinue"]').click();
 await page.locator('[data-action="checkin.cameraStartVideo"]:enabled').click();await page.waitForTimeout(10000);await page.locator('[data-action="checkin.cameraStopVideo"]').click();
 await page.evaluate(async()=>{window.cloudAcceptanceApp=(await import('/student/js/app.js')).app;});
 await page.waitForFunction(()=>window.cloudAcceptanceApp.ui.checkin.drafts.some(d=>d.type==='video'),null,{timeout:30000});
 const drafts=await page.evaluate(async()=>{const {app}=await import('/student/js/app.js');return app.ui.checkin.drafts.map(d=>({type:d.type,bytes:d.byteCount}));});
 console.log(JSON.stringify({check:'CLOUD_CAPTURE_DRAFTS',drafts}));assert.equal(drafts.length,2);assert.ok(drafts.every(d=>d.bytes>0));
 await page.screenshot({path:'.local/round2-evidence/cloud-long-photo-video.png',fullPage:true});
 console.log(JSON.stringify({check:'CLOUD_BROWSER_PHOTO_VIDEO_PAUSE_RESUME',result:'PASS',drafts,cameraSource:'synthetic device through real browser MediaRecorder'}));
 stage='REAL_THIRTY_MINUTES';const finishAfter=Date.now()+1802000;
 console.log(JSON.stringify({check:'CLOUD_REAL_30_MINUTE_WAIT_STARTED',expectedFinish:new Date(finishAfter).toISOString(),sessionId:session.id}));
 while(Date.now()<finishAfter){await new Promise(resolve=>setTimeout(resolve,Math.min(50000,finishAfter-Date.now())));console.log(JSON.stringify({check:'CLOUD_REAL_CLOCK_PROGRESS',remainingSeconds:Math.max(0,Math.ceil((finishAfter-Date.now())/1000))}));}
 for(const action of ['pause','resume']){const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith(`/exercise-sessions/${session.id}/${action}`)&&r.request().method()==='POST'&&r.status()!==401);await page.locator(`[data-action="checkin.${action}"]`).click();assert.equal((await response).status(),200);}
 stage='FINISH';await page.locator('[data-action="checkin.requestFinish"]').click();const finishedResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith(`/exercise-sessions/${session.id}/finish`)&&r.request().method()==='POST'&&r.status()!==401);await page.locator('[data-action="checkin.confirmFinish"]').click();const finished=await finishedResponse;assert.ok(finished.ok());const completed=(await finished.json()).data;assert.ok(completed.actualDurationSeconds>=1800);assert.equal(completed.status,'COMPLETED');
 await page.getByText('完成记录',{exact:true}).waitFor();
 stage='UPLOAD_SUBMIT';await page.locator('[data-input="checkin.description"]').fill('Independent cloud acceptance: real 30-minute clock, captured photo and video.');
 const submitResponse=page.waitForResponse(r=>/\/exercise-records\/[^/]+\/submit$/.test(new URL(r.url()).pathname)&&r.request().method()==='POST'&&r.status()!==401,{timeout:90000});await page.locator('[data-action="checkin.submit"]').click();const submitted=await submitResponse;assert.ok(submitted.ok());const record=(await submitted.json()).data;assert.equal(record.creditedDurationSeconds,0);await page.getByText('提交成功',{exact:true}).waitFor();
 fs.writeFileSync('.local/round2-cloud-long-submission.json',JSON.stringify({recordId:record.id,sessionId:session.id,actualDurationSeconds:completed.actualDurationSeconds,expectedHours:0.5}));
 await page.context().storageState({path:'.local/round2-cloud-student-storage.json'});
 await page.screenshot({path:'.local/round2-evidence/cloud-long-submitted.png',fullPage:true});
 console.log(JSON.stringify({check:'CLOUD_REAL_30_MINUTE_CAPTURE_COS_SUBMISSION',result:'PASS',recordId:record.id,actualDurationSeconds:completed.actualDurationSeconds,creditBeforeReview:0,errors}));
}catch(error){console.error(JSON.stringify({check:'CLOUD_LONG_CHECKIN',result:'FAIL',stage,type:error.name,message:error.message.slice(0,1000),errors}));if(page){await page.context().storageState({path:'.local/round2-cloud-student-storage.json'});await page.screenshot({path:'.local/round2-evidence/cloud-long-failure.png',fullPage:true});}process.exitCode=1;}finally{await browser.close();}
