import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
import {TEST_PASSWORD} from '../../backend/test/helpers/test-environment.ts';
const state=JSON.parse(await fs.readFile('evidence/demand-20260916/browser/state.json','utf8'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const evidence=[];
try{
  const desktop=await browser.newPage();
  const otpRequests=[];desktop.on('request',request=>{if(request.url().includes('student-sign-in-codes'))otpRequests.push(request.url());});
  await desktop.goto(state.baseUrl+'/student/');
  await desktop.getByText(/学生端仅支持手机和平板/).waitFor();
  assert.equal(otpRequests.length,0);
  await desktop.screenshot({path:'evidence/demand-20260916/browser/desktop-blocked.png',fullPage:true});
  evidence.push({requirement:19,device:'desktop',blockedBeforeOtp:true});
  const page=await browser.newPage();
  await page.goto(state.baseUrl+'/');
  await page.locator('#login-account').fill(state.fixture.teacherEmail);
  await page.locator('#login-password').fill(TEST_PASSWORD);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('button',{name:'课程管理',exact:true}).waitFor();
  await page.getByRole('button',{name:'课程管理',exact:true}).click();
  await page.getByRole('button',{name:'English',exact:true}).click();
  await page.locator('.course-enter-button').first().click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('heading',{name:'Class settings',exact:true}).waitFor();
  assert.doesNotMatch(await dialog.innerText(),/[\u3400-\u9fff]/);
  assert.equal(await dialog.getByText(/Regular submission deadline/).count(),0);
  const renamed=(await page.locator('#course-name-edit').inputValue())==='Demand Verified Course A'?'Demand Verified Course B':'Demand Verified Course A';
  await page.locator('#course-name-edit').fill(renamed);
  const saved=page.waitForResponse(response=>response.request().method()==='PATCH'&&response.url().includes('/class-sections/'));
  await dialog.getByRole('button',{name:'Save course name',exact:true}).click();
  assert.equal((await saved).status(),200);
  await dialog.getByRole('status').filter({hasText:/saved|updated/i}).first().waitFor();
  await page.screenshot({path:'evidence/demand-20260916/browser/course-settings-english.png',fullPage:true});
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.reload();
  await page.locator('.course-enter-button').first().click();
  await page.locator('#course-name-edit').waitFor();
  assert.equal(await page.locator('#course-name-edit').inputValue(),renamed);
  await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'中文',exact:true}).click();
  await page.locator('.course-enter-button').first().click();
  await page.getByRole('dialog').getByRole('heading',{name:'课程设置',exact:true}).waitFor();
  await page.screenshot({path:'evidence/demand-20260916/browser/course-settings-chinese.png',fullPage:true});
  evidence.push({requirement:24,englishDialogNoChinese:true,languageRoundtrip:true},{requirement:23,renamePersistedAfterReload:true},{requirement:16,independentDeadlineRemoved:true});
  for(const device of [{name:'phone',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',viewport:{width:390,height:844}},
    {name:'tablet',userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',viewport:{width:1024,height:1366}}]){
    const context=await browser.newContext({...device,isMobile:true,hasTouch:true});const studentPage=await context.newPage();
    studentPage.on('pageerror',error=>console.log(JSON.stringify({device:device.name,error:error.message})));
    await studentPage.goto(state.baseUrl+'/student/?org='+encodeURIComponent(state.organizationCode));
    await studentPage.locator('[data-action="consent.agree"]').click();
    await studentPage.locator('[data-action="guide.skip"]').click();
    await studentPage.locator('input').first().waitFor();
    assert.equal(await studentPage.getByText(/学生端仅支持手机和平板/).count(),0);
    evidence.push({requirement:19,device:device.name,loginAvailable:true});
    await studentPage.screenshot({path:`evidence/demand-20260916/browser/${device.name}-login.png`,fullPage:true});
    if (device.name === 'phone') {
      await studentPage.locator('[data-action="login.email"]').click();
      await studentPage.locator('#vlogin-contact').fill(state.student.email);
      const sent = studentPage.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/auth/student-sign-in-codes'));
      await studentPage.locator('[data-action="verification.sendCode"]').click();
      assert.equal((await sent).status(), 202);
      let code;
      for (let attempt=0; attempt<30&&!code; attempt++) {
        const messages=await (await fetch('http://127.0.0.1:58025/api/v1/messages?limit=50')).json();
        const message=messages.messages?.find(item=>JSON.stringify(item.To??[]).includes(state.student.email));
        if(message){const detail=await (await fetch('http://127.0.0.1:58025/api/v1/message/'+message.ID)).json();code=String(detail.Text??'').match(/(?:code is|验证码是)\s*(\d{4,10})/u)?.[1];}
        if(!code)await new Promise(resolve=>setTimeout(resolve,500));
      }
      assert.ok(code,'Real local SMTP must deliver the sign-in code');
      await studentPage.locator('#vlogin-code').fill(code);
      await studentPage.locator('[data-action="verification.submit"]').click();
      await studentPage.waitForTimeout(2000);
      if(await studentPage.locator('[data-action="guide.skip"]').count())await studentPage.locator('[data-action="guide.skip"]').click();
      await studentPage.locator('[data-action="root.tab"][data-tab="profile"]').click();
      await studentPage.locator('[data-action="profile.openAccount"]').click();
      await studentPage.locator('[data-action="profile.editDetails"]').last().click();
      await studentPage.locator('select[data-field="majorName"]').selectOption('JC');
      const confirmed=studentPage.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/me/student-profile'));
      await studentPage.locator('[data-action="profile.saveDetails"]').click();
      assert.equal((await confirmed).status(),200);
      await studentPage.getByText('JC',{exact:true}).waitFor();
      assert.equal(await studentPage.locator('[data-action="profile.editDetails"]').count(),0);
      await studentPage.screenshot({path:'evidence/demand-20260916/browser/major-confirmed.png',fullPage:true});
      evidence.push({requirement:18,undeclaredToFormalViaBrowser:true,studentEditRemovedAfterConfirmation:true},{requirement:22,jcSelectableInScc:true},{requirement:14,realMailpitSignIn:true});
    }
    await context.close();
  }
  await fs.writeFile('evidence/demand-20260916/browser/result.json',JSON.stringify({status:'PARTIAL',evidence},null,2));
}finally{await browser.close();}
