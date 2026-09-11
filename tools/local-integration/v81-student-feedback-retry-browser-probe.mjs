import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
const loginEmail=process.env.V81_EMAIL_RECOVERY_FROM??state.accounts.student.email;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='PRIVACY';
let diagnosticPage;const apiResponses=[];
try {
  const page=await browser.newPage();
  diagnosticPage=page;
  page.on('response',response=>{const path=new URL(response.url()).pathname;if(path.startsWith('/api/v1/'))apiResponses.push({path,status:response.status()});});
  await page.goto('http://127.0.0.1:4274/student/');
  await page.getByRole('button',{name:'同意并继续'}).click();
  await page.getByText('直接登录',{exact:true}).click();
  await page.getByText('邮箱验证码登录',{exact:true}).click();
  await page.getByPlaceholder('name@bnbu.edu.cn').fill(loginEmail);
  stage='SEND_CODE';
  const existingMessages=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=50')).json();
  const existingIds=new Set((existingMessages.messages??[]).map(item=>item.ID));
  await page.getByRole('button',{name:'获取验证码',exact:true}).click();
  let code;
  for(let attempt=0;attempt<30&&!code;attempt++){
    const messages=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=50')).json();
    const message=messages.messages?.find(item=>!existingIds.has(item.ID)&&JSON.stringify(item.To??[]).includes(loginEmail));
    if(message){const mail=await(await fetch(`http://127.0.0.1:18025/api/v1/message/${message.ID}`)).json();code=(mail.Text??'').match(/\b\d{6}\b/)?.[0];}
    if(!code)await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(code);
  stage='VERIFY_LOGIN';
  await page.getByPlaceholder('4–10 位数字').fill(code);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByText('我的',{exact:true}).waitFor();
  console.log(JSON.stringify({check:'STUDENT_BROWSER_SMTP_LOGIN',result:'PASS'}));
  // Synthetic fixture view only; omit all account identifiers from diagnostics.
  const text=await page.locator('body').innerText();
  console.log(JSON.stringify({check:'STUDENT_HOME_CONTENT',hasCourse:text.includes('课程'),hasProgress:text.includes('进度'),hasLoginForm:await page.getByPlaceholder('4–10 位数字').count()>0}));
  stage='DISMISS_GUIDE';
  await page.reload();
  await page.getByText('运动指引',{exact:true}).waitFor();
  await page.getByRole('button',{name:'跳过',exact:true}).click();
  stage='OPEN_SETTINGS';
  await page.getByText('我的',{exact:true}).click();
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.getByText('问题反馈',{exact:true}).click();
  stage='FEEDBACK_LOST_RESPONSE';
  const content=`Synthetic feedback retry ${crypto.randomUUID()}`;
  let created,firstKey,retryKey;
  await page.route('**/api/v1/feedback',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    if(!created){
      firstKey=route.request().headers()['idempotency-key'];
      const response=await route.fetch();assert.equal(response.status(),201);created=(await response.json()).data;
      await route.abort('failed');
    }else{retryKey=route.request().headers()['idempotency-key'];await route.continue();}
  });
  await page.locator('#feedback-description').fill(content);
  await page.locator('[data-action="feedback.submit"]').click();
  await page.locator('.sub-screen-overlay [role="alert"]').waitFor();
  assert.equal(await page.locator('#feedback-description').isDisabled(),true);
  assert.equal(await page.locator('#feedback-description').inputValue(),content);
  const retry=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/feedback'&&r.request().method()==='POST');
  await page.locator('[data-action="feedback.submit"]').click();
  const response=await retry;assert.equal(response.status(),201);const replay=(await response.json()).data;
  console.log(JSON.stringify({check:'FEEDBACK_RETRY_IDENTITY',sameId:created.id===replay.id,sameKey:firstKey===retryKey}));
  assert.equal(created.id,replay.id);assert.equal(firstKey,retryKey);
  await page.waitForFunction(()=>document.querySelector('#feedback-description')?.disabled===false);
  await page.locator('[data-action="feedback.tab"][data-value="tickets"]').click();
  await page.getByText(content,{exact:true}).waitFor();assert.equal(await page.getByText(content,{exact:true}).count(),1);
  console.log(JSON.stringify({check:'STUDENT_FEEDBACK_LOST_RESPONSE_REPLAY',result:'PASS'}));
}catch(error){console.error(JSON.stringify({check:'STUDENT_FEEDBACK',result:'FAIL',stage,type:error.name,pageText:diagnosticPage?(await diagnosticPage.locator('body').innerText()).slice(0,1400):'',message:error.message.slice(0,350),emailRequests:apiResponses.filter(item=>item.path.includes('email-verification-challenges')),failedRequests:apiResponses.filter(item=>item.status>=400)}));process.exitCode=1;}
finally{await browser.close();}
