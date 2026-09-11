import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
const id=process.env.V81_ROSTER_COURSE_ID;assert.match(id??'',/^[0-9a-f-]{36}$/);
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN',page;
try {
  page=await browser.newPage();page.setDefaultTimeout(15000);
  page.on('response',response=>{if(/roster-alignment-results\/[^/]+\/confirm/.test(response.url()))console.log(JSON.stringify({check:'CONFIRM_RESPONSE',status:response.status()}));});
  page.on('console',message=>{if(message.text().startsWith('ROSTER_DEBUG'))console.log(message.text());});
  await page.exposeFunction('recordRosterClick',event=>console.log(JSON.stringify({check:'ROSTER_CLICK',...event})));
  await page.addInitScript(()=>document.addEventListener('mousedown',event=>{if(document.querySelector('[role="dialog"]'))window.recordRosterClick({tag:event.target.tagName,className:event.target.className,text:event.target.tagName==='BUTTON'?event.target.textContent:null});},true));
  await page.goto('http://localhost:3300/');
  await page.getByLabel('学校邮箱').fill(state.accounts.teacher.email);
  await page.locator('#login-password').fill(state.accounts.teacher.password);
  const loginPromise=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/auth/password-login'&&response.request().method()==='POST');
  await page.getByRole('button',{name:'登录',exact:true}).click();
  const login=(await (await loginPromise).json()).data;
  const response=await page.request.get(`http://localhost:3300/api/v1/class-sections/${id}`,{headers:{authorization:`Bearer ${login.accessToken}`}});
  assert.equal(response.status(),200);const section=(await response.json()).data;assert.ok(section.displayName.startsWith('Synthetic Roster'));
  await page.locator('.teacher-course-card').filter({hasText:section.displayName}).getByRole('button',{name:'名单对齐',exact:true}).click();
  stage='READ_ROWS';await page.getByText('当前名单版本',{exact:true}).waitFor();
  if(process.env.V81_RERUN_ALIGNMENT==='1'){
    const run=page.waitForResponse(response=>/\/roster-imports\/[^/]+\/align$/.test(new URL(response.url()).pathname)&&response.request().method()==='POST');
    await page.getByRole('button',{name:'重新核对',exact:true}).click();assert.equal((await run).status(),202);
  }
  console.log(JSON.stringify({check:'EXISTING_SYNTHETIC_ROSTER_RENDER',text:await page.locator('.roster-results-card').innerText()}));
  const row=page.locator('tbody tr').filter({hasText:'000001'});
  stage='ROW_STATUS';await row.getByText('未加入课程',{exact:true}).waitFor();
  stage='OPEN_DETAIL';await row.getByRole('button',{name:'Synthetic Roster One',exact:true}).click();
  const drawer=page.getByRole('dialog');
  stage='REASON';await drawer.locator('textarea').fill('Synthetic teacher confirms the registration discrepancy');
  console.log(JSON.stringify({check:'REASON_AFTER_FILL',value:await drawer.locator('textarea').inputValue(),hint:await drawer.locator('.roster-note-field').innerText()}));
  stage='CONFIRM';
  const saved=page.waitForResponse(response=>/\/roster-alignment-results\/[^/]+\/confirm$/.test(new URL(response.url()).pathname)&&response.request().method()==='POST');
  await drawer.getByRole('button',{name:'确认该异常',exact:true}).click();
  const confirmed=await saved;assert.equal(confirmed.status(),200);assert.equal((await confirmed.json()).data.resolutionStatus,'CONFIRMED');
  stage='CLOSE';await drawer.getByRole('button',{name:'关闭',exact:true}).click();
  stage='READ_CONFIRMED';await row.getByText('已确认',{exact:true}).waitFor();await row.getByText('未加入课程',{exact:true}).waitFor();
  console.log(JSON.stringify({check:'TEACHER_BROWSER_CONFIRMS_EXISTING_ROSTER_DISCREPANCY',result:'PASS'}));
}catch(error){console.error(JSON.stringify({check:'EXISTING_ROSTER_BROWSER',result:'FAIL',stage,type:error.name,message:error.message,dialogs:await page.getByRole('dialog').allTextContents(),reason:await page.locator('#roster-resolution-reason').count()?await page.locator('#roster-resolution-reason').inputValue():null}));process.exitCode=1;}
finally{await browser.close();}
