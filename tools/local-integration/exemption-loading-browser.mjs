// Verify the three student UI changes with real backend workspace data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const cloud=process.env.BNBU_APPLICATION_CLOUD==='1';
const origin=cloud?'https://www.student.bnbusports.cn':'http://127.0.0.1:4274';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});

let releaseResponse;
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
 let signal;const intercepted=new Promise(r=>{signal=r;});const hold=new Promise(r=>{releaseResponse=r;});let writes=0;
 page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/v1/exemption-applications')writes++;});
 await page.route('**/api/v1/class-sections*',async route=>{const response=await route.fetch();assert.equal(response.status(),200);signal();await hold;await route.fulfill({response});});
 await page.reload();await intercepted;await page.locator('[data-action="root.tab"][data-tab="profile"]').click();await page.locator('[data-action="profile.openExemption"]').click();
 if(process.env.BNBU_EXPECT_LOADING_FIX==='1'){
  await page.getByText('正在加载课程与申请信息…',{exact:true}).waitFor();assert.equal(await page.locator('[data-action="exemption.submit"]').count(),0);await page.screenshot({path:'.local/round2-evidence/exemption-loading-fixed.png',fullPage:true});
 }else{
  await page.locator('[data-action="exemption.tab"][data-value="new"]').click();await page.locator('[data-action="exemption.selectType"][data-value="team"]').click();await page.locator('#exemption-organization').fill('Synthetic loading race');await page.locator('#exemption-reason').fill('Synthetic loading race proof');const {syntheticPng}=await import('./synthetic-png.mjs');await page.locator('[data-exemption-input="gallery"]').setInputFiles({name:'proof.png',mimeType:'image/png',buffer:syntheticPng()});await page.locator('[data-action="exemption.submit"]').click();await page.getByText('你的选课状态不是在读，无法执行该操作。',{exact:true}).waitFor();await page.screenshot({path:'.local/round2-evidence/exemption-loading-before.png',fullPage:true});
 }
 await page.evaluate(async()=>{window.raceApp=(await import('/student/js/app.js')).app;});const pending=await page.evaluate(()=>({isLoading:window.raceApp.state.isLoading,courses:window.raceApp.state.workspace.courses.length}));assert.equal(pending.isLoading,true);assert.equal(writes,0);releaseResponse();await page.waitForFunction(()=>!window.raceApp.state.isLoading);const enrolled=await page.evaluate(()=>window.raceApp.state.workspace.courses.filter(c=>c.isCurrent&&c.enrollmentStatus==='enrolled').length);assert.equal(enrolled,1);
 console.log(JSON.stringify({check:'EXEMPTION_WORKSPACE_LOADING_RACE',environment:cloud?'TENCENT_CLOUD':'LOCAL_DOCKER',result:process.env.BNBU_EXPECT_LOADING_FIX==='1'?'PASS':'REPRODUCED',pending,enrolledAfterResponse:enrolled,applicationPosts:writes,responseDataUnmodified:true}));
}finally{releaseResponse?.();await browser.close();}
