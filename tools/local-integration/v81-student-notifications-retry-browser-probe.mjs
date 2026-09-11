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
  stage='OPEN_UNREAD';
  await page.locator('[data-action="dashboard.openNotifications"]').click();
  await page.locator('[data-action="notifications.filter"][data-filter="unread"]').click();
  const row=page.locator('.notice-row').first();await row.waitFor();
  const id=await row.getAttribute('data-notice-id');
  let attempts=0;
  await page.route(`**/api/v1/notifications/${id}/read`,async route=>{attempts++;if(attempts===1)await route.abort('internetdisconnected');else await route.continue();});
  stage='FAILED_READ_VISIBLE';
  await row.click();
  await page.locator('.sheet [role="alert"]').waitFor();
  assert.equal(await page.locator(`[data-notice-id="${id}"]`).count(),1);
  stage='RETRY_READ';
  const readResponse=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/v1/notifications/${id}/read`&&r.ok());
  await page.locator(`[data-notice-id="${id}"]`).click();
  const response=await readResponse;assert.equal(response.status(),200);assert.ok((await response.json()).data.readAt);
  assert.equal(attempts,2);
  console.log(JSON.stringify({check:'STUDENT_NOTIFICATION_FAILED_READ_RECOVERY',result:'PASS'}));
  stage='BATCH_PARTIAL_FAILURE';
  if(await page.locator('[data-action="notifications.close"]').count())await page.locator('[data-action="notifications.close"]').click();
  await page.locator('[data-action="dashboard.openNotifications"]').click();
  await page.locator('[data-action="notifications.filter"][data-filter="unread"]').click();
  const pending=page.locator('.notice-row');assert.ok(await pending.count()>=2);
  const failedId=await pending.first().getAttribute('data-notice-id');
  let failedAttempts=0;const successfulIds=[];
  await page.route('**/api/v1/notifications/*/read',async route=>{
    const requestId=new URL(route.request().url()).pathname.split('/').at(-2);
    if(requestId===failedId&&++failedAttempts===1){await route.abort('internetdisconnected');return;}
    const result=await route.fetch();if(result.status()!==200){const body=await result.json();console.log(JSON.stringify({check:'BATCH_HTTP_FAILURE',status:result.status(),code:body.error?.code}));}else successfulIds.push(requestId);await route.fulfill({response:result});
  });
  await page.locator('[data-action="notifications.markAll"]').click();
  await page.locator('.sheet [role="alert"]').waitFor();
  assert.equal(await pending.count(),1);
  assert.equal(await pending.first().getAttribute('data-notice-id'),failedId);
  stage='BATCH_RETRY';
  await page.locator('[data-action="notifications.markAll"]').click();
  await page.locator('.notice-row').waitFor({state:'hidden'});
  assert.equal(failedAttempts,2);
  assert.equal(new Set(successfulIds).size,successfulIds.length);
  assert.equal(await page.locator('.sheet [role="alert"]').count(),0);
  assert.equal(await page.locator('[data-action="notifications.markAll"]').isDisabled(),true);
  console.log(JSON.stringify({check:'STUDENT_NOTIFICATION_BATCH_PARTIAL_RECOVERY',result:'PASS',successfulWrites:successfulIds.length}));
}catch(error){console.error(JSON.stringify({check:'STUDENT_NOTIFICATIONS_RETRY',result:'FAIL',stage,type:error.name,message:error.message.slice(0,350),failedRequests:apiResponses.filter(item=>item.status>=400)}));process.exitCode=1;}
finally{await browser.close();}