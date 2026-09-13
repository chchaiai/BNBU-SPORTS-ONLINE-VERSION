// Exercise the real exemption and certification UI with isolated accounts and actual image uploads.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const cloud=process.env.BNBU_APPLICATION_CLOUD==='1';
const origin=cloud?'https://www.student.bnbusports.cn':'http://127.0.0.1:4274';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});

let page,teacherPage,stage="LOGIN";
try{
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});
 if(cloud){const fixture=JSON.parse(fs.readFileSync('.local/round2-cloud-long-private.json','utf8'));await context.addInitScript(auth=>{localStorage.setItem('bnbu.student.web.apiTokens',JSON.stringify(auth));localStorage.setItem('bnbu.student.web.session',JSON.stringify({kind:'api',accountId:auth.accountId,signedInAt:new Date().toISOString()}));},{...fixture.studentSession,userId:fixture.student.userId,accountId:'SYNTH-SESSION-'+fixture.student.email.split('.')[2].toUpperCase(),schemaVersion:2});}
 page=await context.newPage();page.setDefaultTimeout(60000);await page.goto(origin+'/student/');
 if(cloud)await page.getByRole('button',{name:'同意并继续',exact:true}).click();
 if(!cloud){
  const student=JSON.parse(fs.readFileSync('.local/v81-browser-state/student-membership.json','utf8'));
  await page.getByRole('button',{name:'同意并继续',exact:true}).click();await page.getByText('直接登录',{exact:true}).click();await page.getByText('邮箱验证码登录',{exact:true}).click();await page.getByPlaceholder('name@bnbu.edu.cn').fill(student.email);
  const prior=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=50')).json(),ids=new Set(prior.messages.map(m=>m.ID));
  await page.getByRole('button',{name:'获取验证码',exact:true}).click();let code;
  for(let i=0;i<30&&!code;i++){const messages=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=50')).json();const message=messages.messages.find(m=>!ids.has(m.ID)&&JSON.stringify(m.To).includes(student.email));if(message){const full=await(await fetch('http://127.0.0.1:18025/api/v1/message/'+message.ID)).json();code=(full.Text||'').match(/\b\d{6}\b/)?.[0];}if(!code)await new Promise(r=>setTimeout(r,500));}
  assert.ok(code);await page.getByPlaceholder('4–10 位数字').fill(code);await page.getByRole('button',{name:'登录',exact:true}).click();
 }
 await page.getByText('我的',{exact:true}).or(page.getByText('运动指引',{exact:true})).first().waitFor();
 await page.evaluate(async()=>{window.loadingProbeApp=(await import('/student/js/app.js')).app;});
 await page.waitForFunction(()=>!window.loadingProbeApp.state.isLoading&&!window.loadingProbeApp.state.isRestoringSession);
 if(await page.getByText('运动指引',{exact:true}).isVisible())await page.getByRole('button',{name:'跳过',exact:true}).click();

 const app=await page.evaluate(()=>({courses:window.loadingProbeApp.state.workspace.courses}));
 assert.ok(app.courses.some(c=>c.enrollmentId));
 await page.locator('[data-action="root.tab"][data-tab="profile"]').click();await page.locator('[data-action="profile.openExemption"]').click();
 await page.locator('[data-action="exemption.tab"][data-value="new"]').click();await page.locator('[data-action="exemption.selectType"][data-value="team"]').click();
 await page.locator('#exemption-organization').fill('Synthetic membership regression');await page.locator('#exemption-reason').fill('Synthetic active enrollment and photo cover regression');
 await page.locator('[data-exemption-input="camera"]').setInputFiles('.local/v81-browser-state/demand-photo.jpg');
 await page.waitForFunction(()=>{const i=document.querySelector('.exemption-proof-preview img');return i?.complete&&i.naturalWidth>0;});
 await page.screenshot({path:'.local/membership-application-cover.png'});
 await page.locator('.exemption-proof-preview').click();
 await page.locator('[role="dialog"] img').waitFor();
 await page.locator('.material-preview').getByRole('button',{name:'关闭',exact:true}).click();
 // Simulate an out-of-date semester display without changing server membership.
 await page.evaluate(()=>{for(const c of window.loadingProbeApp.state.workspace.courses)c.isCurrent=false;window.loadingProbeApp.ui.exemption.serverDraft={id:'stale-draft-must-not-be-sent',enrollmentId:'old-membership',mediaIds:['old-material'],version:1};});
 const done=page.waitForResponse(r=>/\/exemption-applications\/[^/]+\/submit$/.test(new URL(r.url()).pathname)&&r.request().method()==='POST');
 await page.locator('[data-action="exemption.submit"]').click();assert.equal((await done).status(),200);
 console.log(JSON.stringify({check:'ACTIVE_ENROLLMENT_TEAM_APPLICATION_AND_LOCAL_PHOTO_COVER',result:'PASS'}));
}catch(error){console.error(error);await page?.screenshot({path:'.local/membership-application-failure.png'});process.exitCode=1;}finally{await browser.close();}
