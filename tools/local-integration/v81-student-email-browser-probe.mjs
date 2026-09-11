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
  await page.getByText('绑定或更换登录邮箱',{exact:true}).click();
  const original=state.accounts.student.email;
  const alternate=`synthetic.email-change.${crypto.randomUUID()}@bnbu.invalid`;
  const change=async(current,next)=>{
    await page.locator('#binding-email').fill(next);
    const existing=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=100')).json();
    const ids=new Set((existing.messages??[]).map(item=>item.ID));
    await page.getByRole('button',{name:'发送验证码',exact:true}).click();
    const codes=new Map();
    for(let attempt=0;attempt<30&&codes.size<2;attempt++){
      const listing=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=100')).json();
      for(const email of [current,next]){
        const message=listing.messages?.find(item=>!ids.has(item.ID)&&JSON.stringify(item.To??[]).includes(email));
        if(message){const mail=await(await fetch(`http://127.0.0.1:18025/api/v1/message/${message.ID}`)).json();const value=(mail.Text??'').match(/\b\d{6}\b/)?.[0];if(value)codes.set(email,value);}
      }
      if(codes.size<2)await new Promise(resolve=>setTimeout(resolve,500));
    }
    assert.equal(codes.size,2);
    await page.locator('#binding-currentEmailCode').fill(codes.get(current));
    await page.locator('#binding-newEmailCode').fill(codes.get(next));
    const verified=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/email-verification-challenges/')&&r.url().endsWith('/verify'));
    const refreshed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/me'&&r.request().method()==='GET'&&r.ok());
    await page.getByRole('button',{name:'验证并继续',exact:true}).click();
    const response=await verified;assert.equal(response.status(),200);
    console.log(JSON.stringify({check:'EMAIL_CHANGE_COMMITTED',stage,status:response.status()}));
    const me=(await (await refreshed).json()).data;
    assert.equal(me.user.emailVerified,true);
    await page.getByText(`当前邮箱：${me.user.primaryEmailMasked}`,{exact:true}).waitFor();
  };
  stage='CHANGE_EMAIL';
  if(!process.env.V81_EMAIL_RECOVERY_FROM)await change(original,alternate);
  stage='RESTORE_EMAIL';
  await change(process.env.V81_EMAIL_RECOVERY_FROM??alternate,original);
  await page.reload();
  if(await page.getByRole('button',{name:'跳过',exact:true}).count())await page.getByRole('button',{name:'跳过',exact:true}).click();
  await page.getByText('我的',{exact:true}).waitFor();
  console.log(JSON.stringify({check:'STUDENT_EMAIL_DOUBLE_OTP_CHANGE_AND_RESTORE',result:'PASS',restored:true}));
}catch(error){console.error(JSON.stringify({check:'STUDENT_EMAIL_CHANGE',result:'FAIL',stage,type:error.name,message:error.message.slice(0,350),emailRequests:apiResponses.filter(item=>item.path.includes('email-verification-challenges')),failedRequests:apiResponses.filter(item=>item.status>=400)}));process.exitCode=1;}
finally{await browser.close();}
