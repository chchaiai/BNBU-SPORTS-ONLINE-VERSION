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
  stage='STUDENT_REPORT';
  const receipt=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/audit-logs/client-errors');
  await page.evaluate(async()=>{const api=await import('/student/js/api.js');api.toUserFacingError(new api.ClientTransportError(new Error('synthetic private diagnostic'),{method:'GET',route:'/notifications?private=omitted'}));});
  const response=await receipt;assert.equal(response.status(),200);assert.ok((await response.json()).data.auditLogId);
  console.log(JSON.stringify({check:'STUDENT_AUTOMATIC_CLIENT_DIAGNOSTICS',result:'PASS'}));
  for(const role of ['teacher','admin']){
    stage=`${role.toUpperCase()}_REPORT`;
    const portal=await browser.newPage();
    await portal.goto('http://localhost:3300/');
    await portal.getByLabel('学校邮箱').fill(state.accounts[role].email);
    await portal.locator('#login-password').fill(state.accounts[role].password);
    const logged=portal.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/password-login'&&r.ok());
    await portal.getByRole('button',{name:'登录',exact:true}).click();await logged;
    await portal.waitForLoadState('networkidle');
    const reported=portal.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/audit-logs/client-errors');
    await portal.evaluate(async()=>{const api=await import('/app/api-client.ts');api.toUserFacingError(new api.ClientTransportError(new Error('synthetic private diagnostic'),{method:'GET',route:'/notifications?private=omitted'}));});
    const saved=await reported;assert.equal(saved.status(),200);assert.ok((await saved.json()).data.auditLogId);
    console.log(JSON.stringify({check:`${role.toUpperCase()}_AUTOMATIC_CLIENT_DIAGNOSTICS`,result:'PASS'}));
    await portal.close();
  }
}catch(error){console.error(JSON.stringify({check:'CLIENT_DIAGNOSTICS_BROWSER',result:'FAIL',stage,type:error.name,message:error.message.slice(0,350),failedRequests:apiResponses.filter(item=>item.status>=400)}));process.exitCode=1;}
finally{await browser.close();}