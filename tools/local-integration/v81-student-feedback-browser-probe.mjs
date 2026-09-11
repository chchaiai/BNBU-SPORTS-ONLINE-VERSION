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
  const fixturePath=new URL('../../.local/v81-browser-state/student-feedback-current.json',import.meta.url);
  if(process.env.V81_FEEDBACK_READ_REPLY==='1'){
    stage='READ_ADMIN_REPLY';
    const fixture=JSON.parse(fs.readFileSync(fixturePath));
    const historyResponse=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/v1/student/feedback/${fixture.id}/history`&&r.ok());
    await page.locator('[data-action="feedback.tab"][data-value="tickets"]').click();
    await page.getByText(fixture.content,{exact:true}).waitFor();
    const card=page.locator('.swiss-panel').filter({has:page.getByText(fixture.content,{exact:true})});
    await card.getByText('公开回复：Synthetic public reply from admin browser',{exact:true}).waitFor();
    await card.getByText('受理中',{exact:true}).waitFor();
    const history=(await (await historyResponse).json()).data;
    for(const reply of history.items)assert.deepEqual(Object.keys(reply).sort(),['id','occurredAt','publicReply','status','version']);
    if(process.env.V81_FEEDBACK_HISTORY_REPLY==='1'){
      await card.getByText('公开回复：Synthetic second public reply for history',{exact:true}).waitFor();
      assert.ok(history.items.length>=2);
      assert.ok(apiResponses.some(item=>item.path.endsWith(`/student/feedback/${fixture.id}/history`)&&item.status===200));
    }
    console.log(JSON.stringify({check:'STUDENT_FEEDBACK_ADMIN_REPLY_READBACK',result:'PASS'}));
  }else{
    stage='SUBMIT_FEEDBACK';
    const content=`Synthetic student browser feedback ${crypto.randomUUID()}`;
    await page.locator('#feedback-description').fill(content);
    const submitted=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/feedback'&&r.request().method()==='POST');
    await page.locator('[data-action="feedback.submit"]').click();
    const response=await submitted;assert.equal(response.status(),201);
    const ticket=(await response.json()).data;assert.equal(ticket.status,'OPEN');assert.equal(ticket.content,content);
    fs.writeFileSync(fixturePath,JSON.stringify({id:ticket.id,content}));
    await page.locator('[data-action="feedback.tab"][data-value="tickets"]').click();
    await page.getByText(content,{exact:true}).waitFor();
    console.log(JSON.stringify({check:'STUDENT_FEEDBACK_SUBMIT_AND_LIST',result:'PASS',status:ticket.status}));
  }
}catch(error){console.error(JSON.stringify({check:'STUDENT_FEEDBACK',result:'FAIL',stage,type:error.name,pageText:diagnosticPage?(await diagnosticPage.locator('body').innerText()).slice(0,1400):'',message:error.message.slice(0,350),emailRequests:apiResponses.filter(item=>item.path.includes('email-verification-challenges')),failedRequests:apiResponses.filter(item=>item.status>=400)}));process.exitCode=1;}
finally{await browser.close();}
