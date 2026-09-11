// Verify the three student UI changes with real backend workspace data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const cloud=process.env.BNBU_STUDENT_UI_CLOUD==='1';
const origin=cloud?'https://www.student.bnbusports.cn':'http://127.0.0.1:4274';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});

try{
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});
 if(cloud){const fixture=JSON.parse(fs.readFileSync('.local/round2-cloud-long-private.json','utf8'));await context.addInitScript(auth=>{localStorage.setItem('bnbu.student.web.apiTokens',JSON.stringify(auth));localStorage.setItem('bnbu.student.web.session',JSON.stringify({kind:'api',accountId:auth.accountId,signedInAt:new Date().toISOString()}));},{...fixture.studentSession,userId:fixture.student.userId,accountId:'SYNTH-SESSION-'+fixture.student.email.split('.')[2].toUpperCase(),schemaVersion:2});}
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
 const label=cloud?'cloud':'local';
 await page.locator('[data-action="root.tab"][data-tab="courses"]').click();
 assert.equal(await page.getByRole('button',{name:/加入另一门课|Join another course/}).count(),0);
 await page.screenshot({path:`.local/round2-evidence/${label}-student-ui-courses.png`,fullPage:true});
 await page.locator('[data-action="root.tab"][data-tab="dashboard"]').click();await page.locator('[data-action="dashboard.openNotifications"]').click();
 await page.locator('.sheet-scrim > .sheet').waitFor();assert.equal(await page.getByRole('button',{name:/补证倒计时|Proof countdown/}).count(),0);
 await page.getByRole('dialog').screenshot({path:`.local/round2-evidence/${label}-student-ui-notifications.png`,animations:'disabled'});
 await page.reload();await page.getByText('我的',{exact:true}).waitFor();await page.evaluate(async()=>{window.loadingProbeApp=(await import('/student/js/app.js')).app;});await page.waitForFunction(()=>!window.loadingProbeApp.state.isLoading&&!window.loadingProbeApp.state.isRestoringSession);
 await page.locator('[data-action="root.tab"][data-tab="checkin"]').click();await page.getByText('准备开始',{exact:true}).waitFor();
 const time=await page.evaluate(()=>window.loadingProbeApp.state.workspace.checkInTimeWindow);assert.notEqual(time.windowMode,'unavailable');
 const expected=time.dailyStartTime===null&&time.dailyEndTime===null?'每日允许打卡：全天（北京时间）':`每日允许打卡：${time.dailyStartTime}–${time.dailyEndTime}（北京时间）`;
 await page.getByText(expected,{exact:true}).waitFor();await page.screenshot({path:`.local/round2-evidence/${label}-student-ui-checkin.png`,fullPage:true});
 console.log(JSON.stringify({check:'STUDENT_THREE_UI_FIXES',environment:cloud?'TENCENT_CLOUD':'LOCAL_DOCKER',result:'PASS',dailyWindow:expected,removedButtons:2}));
}finally{await browser.close();}
