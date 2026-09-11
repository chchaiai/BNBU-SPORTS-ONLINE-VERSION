// Verify the three student UI changes with real backend workspace data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const cloud=process.env.BNBU_STUDENT_UI_CLOUD==='1';
const origin=cloud?'https://www.student.bnbusports.cn':'http://127.0.0.1:4274';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});

try{
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});
 if(cloud){const fixture=JSON.parse(fs.readFileSync('.local/continuity-private.json','utf8'));await context.addInitScript(auth=>{localStorage.setItem('bnbu.student.web.apiTokens',JSON.stringify(auth));localStorage.setItem('bnbu.student.web.session',JSON.stringify({kind:'api',accountId:auth.accountId,signedInAt:new Date().toISOString()}));},{...fixture.studentSession,userId:fixture.student.userId,accountId:'SYNTH-SESSION-'+fixture.student.email.split('.')[2].toUpperCase(),schemaVersion:2});}
 const page=await context.newPage();page.setDefaultTimeout(60000);await page.goto(origin+'/student/');
 if(cloud)await page.getByRole('button',{name:'同意并继续',exact:true}).click();
 if(!cloud){
  const student=JSON.parse(fs.readFileSync('.local/v81-browser-state/student-round2-positive-credit.json','utf8'));
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

 const label=cloud?'cloud':'local',errors=[];page.on('pageerror',e=>errors.push(e.name));
 const click=async action=>page.locator(`[data-action="${action}"]`).click();
 await page.locator('[data-action="root.tab"][data-tab="profile"]').click();
 await click('profile.openAccount');await page.locator('[data-action="profile.subBack"]').waitFor();await click('profile.subBack');
 await click('profile.openExemption');await page.getByText('体育免测与免打卡申请',{exact:true}).waitFor();await click('exemption.back');
 await click('profile.openSettings');
 for(const action of ['profile.openHelp','profile.openAbout']){
  await click(action);await page.locator('[data-action="support.back"]').waitFor();assert.ok((await page.locator('body').innerText()).length>30);await click('support.back');
 }
 await click('profile.openPrivacy');await page.locator('[data-action="privacy.back"]').waitFor();await click('privacy.back');
 await click('profile.openFeedback');await page.locator('#feedback-description').waitFor();await page.locator('[data-action="feedback.tab"][data-value="tickets"]').click();await click('support.back');
 for(const value of ['en','zh']){
  const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/me/preferences'&&r.request().method()!=='GET');
  await page.locator(`[data-action="profile.language"][data-value="${value}"]`).click();assert.equal((await saved).status(),200);
 }
 await page.screenshot({path:`.local/basic-20260911/${label}-settings.png`,fullPage:true,animations:'disabled'});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({check:'BASIC_STUDENT_ACCOUNT_APPLICATION_HELP_PRIVACY_ABOUT_FEEDBACK_LANGUAGE',environment:label,result:'PASS',pageErrors:errors.length,languageSavedTwice:true}));
}finally{await browser.close();}
