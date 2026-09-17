import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';

const privateState=JSON.parse(await fs.readFile('.local/demand-20260916-private.json','utf8')); const state={...privateState,baseUrl:'https://www.teacher.bnbusports.cn'}; const TEST_PASSWORD=privateState.accounts.teacher.password;
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const evidence=[];
try{
  const desktop=await browser.newPage();
  const otpRequests=[];desktop.on('request',request=>{if(request.url().includes('student-sign-in-codes'))otpRequests.push(request.url());});
  await desktop.goto('https://www.student.bnbusports.cn/student/');
  await desktop.getByText(/学生端仅支持手机和平板/).waitFor();
  assert.equal(otpRequests.length,0);
  await desktop.screenshot({path:'evidence/demand-20260916/online/desktop-blocked.png',fullPage:true});
  evidence.push({requirement:19,device:'desktop',blockedBeforeOtp:true});
  const page=await browser.newPage(); page.on('response',r=>{if(r.status()>=400)console.log(JSON.stringify({url:r.url().split('?')[0],status:r.status()}));});
  await page.goto(state.baseUrl+'/');
  await page.locator('#login-account').fill(state.fixture.teacherEmail);
  await page.locator('#login-password').fill(TEST_PASSWORD);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('button',{name:'课程管理',exact:true}).waitFor();
  await page.getByRole('button',{name:'课程管理',exact:true}).click();
  await page.getByRole('button',{name:'English',exact:true}).click();
  await page.locator('article').filter({hasText:/Synthetic Teacher A Active Section|Demand Verified Course/}).locator('.course-enter-button').first().click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('heading',{name:'Class settings',exact:true}).waitFor();
  assert.doesNotMatch(await dialog.innerText(),/[\u3400-\u9fff]/);
  assert.equal(await dialog.getByText(/Regular submission deadline/).count(),0);
  await page.waitForFunction(()=>!!document.querySelector('#course-name-edit')?.value);
  const renamed=(await page.locator('#course-name-edit').inputValue())==='Demand Verified Course A'?'Demand Verified Course B':'Demand Verified Course A';
  try{await page.locator('#course-name-edit').fill(renamed);}catch(e){console.log(await dialog.innerText());throw e;}
  const saved=page.waitForResponse(response=>response.request().method()==='PATCH'&&response.url().includes('/class-sections/'));
  await dialog.getByRole('button',{name:'Save course name',exact:true}).click();
  assert.equal((await saved).status(),200);
  await dialog.getByRole('status').filter({hasText:/saved|updated/i}).first().waitFor();
  await page.screenshot({path:'evidence/demand-20260916/online/course-settings-english.png',fullPage:true});
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.reload();
  await page.locator('article').filter({hasText:/Synthetic Teacher A Active Section|Demand Verified Course/}).locator('.course-enter-button').first().click();
  await page.locator('#course-name-edit').waitFor();
  await page.waitForFunction(value=>document.querySelector('#course-name-edit')?.value===value,renamed);
  assert.equal(await page.locator('#course-name-edit').inputValue(),renamed);
  await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'中文',exact:true}).click();
  await page.locator('article').filter({hasText:/Synthetic Teacher A Active Section|Demand Verified Course/}).locator('.course-enter-button').first().click();
  await page.getByRole('dialog').getByRole('heading',{name:'课程设置',exact:true}).waitFor();
  await page.screenshot({path:'evidence/demand-20260916/online/course-settings-chinese.png',fullPage:true});
  evidence.push({requirement:24,englishDialogNoChinese:true,languageRoundtrip:true},{requirement:23,renamePersistedAfterReload:true},{requirement:16,independentDeadlineRemoved:true});

 await fs.writeFile('evidence/demand-20260916/online/browser-result.json',JSON.stringify({status:'PASS',checks:evidence},null,2));
}finally{await browser.close();}
