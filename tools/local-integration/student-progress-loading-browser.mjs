// Delay a real HTTP response, without replacing its data, to verify loading UI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const cloud=process.env.BNBU_PROGRESS_CLOUD==='1';
const origin=cloud?'https://www.student.bnbusports.cn':'http://127.0.0.1:4274';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let release;
try{
 const context=await browser.newContext(cloud?{storageState:'.local/round2-cloud-student-storage.json'}:{});
 const page=await context.newPage();page.setDefaultTimeout(60000);await page.goto(origin+'/student/');
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
 let signal;const intercepted=new Promise(resolve=>{signal=resolve;});const held=new Promise(resolve=>{release=resolve;});
 await page.route('**/api/v1/student-progress*',async route=>{const response=await route.fetch();assert.equal(response.status(),200);signal();await held;await route.fulfill({response});});
 await page.reload();await intercepted;await page.locator('[data-action="root.tab"][data-tab="grades"]').click();
 await page.getByText('正在同步最新打卡进度…',{exact:true}).waitFor();const loading=await page.locator('.tab-content').innerText();assert.ok(!/^0 分钟$/m.test(loading));
 await page.screenshot({path:`.local/round2-evidence/${cloud?'cloud':'local'}-progress-loading.png`,fullPage:true});release();
 await page.locator('.tab-content').getByText('30 分钟',{exact:true}).first().waitFor();assert.equal(await page.getByText('正在同步最新打卡进度…',{exact:true}).count(),0);
 await page.screenshot({path:`.local/round2-evidence/${cloud?'cloud':'local'}-progress-loaded.png`,fullPage:true});
 if(cloud)await context.storageState({path:'.local/round2-cloud-student-storage.json'});
 console.log(JSON.stringify({check:'REAL_PROGRESS_LOADING_PLACEHOLDER_THEN_30_MINUTES',environment:cloud?'TENCENT_CLOUD':'LOCAL_DOCKER',result:'PASS',responseDataUnmodified:true}));
}finally{release?.();await browser.close();}
