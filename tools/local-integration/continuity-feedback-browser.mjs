// Verify the three student UI changes with real backend workspace data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const cloud=process.env.BNBU_STUDENT_UI_CLOUD==='1';
const origin=cloud?'https://www.student.bnbusports.cn':'http://127.0.0.1:4274';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});

try{
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});
 if(cloud){const fixture=JSON.parse(fs.readFileSync('.local/continuity-private.json','utf8'));await context.addInitScript(auth=>{localStorage.setItem('bnbu.student.web.apiTokens',JSON.stringify(auth));localStorage.setItem('bnbu.student.web.session',JSON.stringify({kind:'api',accountId:auth.accountId,signedInAt:new Date().toISOString()}));},{...fixture.studentSession,userId:fixture.student.userId,accountId:'SYNTH-SESSION-'+fixture.student.email.split('.')[2].toUpperCase(),schemaVersion:2});}
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



 const label=cloud?'cloud':'local';const {recordId}=JSON.parse(fs.readFileSync('.local/basic-20260911/continuity-'+label+'-record.json'));
 await page.locator('[data-action="root.tab"][data-tab="checkin"]').click();await page.locator('[data-action="checkin.tab"][data-tab="records"]').click();await page.locator(`[data-action="checkin.openRecord"][data-record-id="${recordId}"]`).click();
 const comment='本轮真实打卡审核：视频可读取，公开说明保存验收。';await page.getByText(comment,{exact:true}).waitFor();
 const record=await page.evaluate(async id=>(await (await import('/student/js/api.js')).listMyRecords()).find(r=>r.id===id),recordId);assert.equal(record.creditedDurationSeconds,0);
 await page.reload();await page.evaluate(async()=>{window.loadingProbeApp=(await import('/student/js/app.js')).app;});await page.waitForFunction(()=>window.loadingProbeApp.state.authenticated&&!window.loadingProbeApp.state.isLoading&&window.loadingProbeApp.state.workspace.records.length>0);
 await page.locator('[data-action="dashboard.openNotifications"]').click();await page.locator('.notice-row').filter({hasText:comment}).first().waitFor();await page.getByRole('dialog').screenshot({path:'.local/basic-20260911/feedback-'+label+'.png',animations:'disabled'});
 console.log(JSON.stringify({check:'CONTINUITY_RECORD_REVIEW_STUDENT_FEEDBACK_NOTIFICATION',environment:label,result:'PASS',creditedSeconds:0}));
}finally{await browser.close();}
