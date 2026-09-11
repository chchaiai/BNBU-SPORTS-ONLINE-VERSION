import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const cloud=process.env.BNBU_BASIC_CLOUD==='1';
const fixture=JSON.parse(fs.readFileSync(cloud?'.local/continuity-private.json':'.local/v81-browser-state/state.json'));
const state=cloud?{accounts:{teacher:fixture.teacher}}:fixture,purpose='';
const {recordId}=JSON.parse(fs.readFileSync('.local/basic-20260911/continuity-'+(cloud?'cloud':'local')+'-record.json'));
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN',diagnosticPage;
try{
  const page=await browser.newPage();page.setDefaultTimeout(60000);
  diagnosticPage=page;
  await page.goto((cloud?'https://www.teacher.bnbusports.cn/':'http://localhost:3300/'));
  await page.locator('#login-account').fill(state.accounts.teacher.email);
  await page.locator('#login-password').fill(state.accounts.teacher.password);
  const loginResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/auth/password-login')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'登录',exact:true}).click();
  const token=(await(await loginResponse).json()).data.accessToken;
  const read=async path=>{const response=await page.request.get((cloud?'https://www.teacher.bnbusports.cn/api/v1':'http://127.0.0.1:3199/api/v1')+path,{headers:{authorization:`Bearer ${token}`}});assert.equal(response.status(),200);return(await response.json()).data;};
  const recordDetail=await read(`/exercise-records/${recordId}`),recordStudent=await read(`/students/${recordDetail.studentId}`);
  await page.getByRole('button',{name:/新建课程/}).waitFor();
  stage='QUEUE';
  await page.getByRole('button',{name:'打卡审核',exact:true}).click();
  await page.getByRole('tab',{name:/全部记录/}).click();
  if(purpose==='maintenance-supplement'){
    const member=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/student-maintenance-supplement.json',import.meta.url)));
    const suffix=member.email.split('.')[2].toUpperCase();
    await page.getByRole('row').filter({hasText:`Synthetic Session Student ${suffix}`}).getByRole('button',{name:/查看记录/}).click();
  }else {
    const rows=page.getByRole('row').filter({hasText:recordStudent.fullName}),count=await rows.count();let found=false;
    for(let i=0;i<count;i++) {await rows.nth(i).getByRole('button',{name:/查看记录/}).click();await page.getByRole('button',{name:'返回学生名单',exact:true}).waitFor();if(await page.locator(`#checkin-record-${recordId}`).count()){found=true;break;}await page.getByRole('button',{name:'返回学生名单',exact:true}).click();}
    assert.ok(found,'Exact isolated record must be selected before reviewing');
  }
  const record=page.locator(`#checkin-record-${recordId}`);await record.waitFor();
  stage=process.env.V81_TEACHER_RETURN==='1'?'RETURN':'VALID';
  if(stage==='RETURN'){
    await record.getByRole('button',{name:'退回补证',exact:true}).click();
    await page.getByRole('radio',{name:/材料不清晰/}).click();
    if(process.env.V81_EXPECT_RETURN_DENIED==='1'){
      const readPromise=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/v1/exercise-records/${recordId}/workflow`);
      await page.getByRole('button',{name:'确认退回补证',exact:true}).click();
      const read=await readPromise,before=(await read.json()).data;
      await page.getByText('该记录已使用过一次补证，请复核现有材料后选择通过或无效。',{exact:true}).waitFor();
      const headers={authorization:(await read.request().allHeaders()).authorization};
      const rejected=await page.request.post(read.url().replace(/\/workflow$/,'/v81-reviews'),{headers:{...headers,'idempotency-key':crypto.randomUUID()},data:{action:'RETURN_FOR_SUPPLEMENT',reasonCode:'UNCLEAR_EVIDENCE',supplementHours:24,expectedVersion:before.version}});
      assert.equal(rejected.status(),422);
      const workflow=await page.request.get(read.url(),{headers});
      const data=(await workflow.json()).data;assert.equal(data.stage,'PENDING_TEACHER');assert.equal(data.supplementUsed,true);
      assert.equal(data.version,before.version);
      console.log(JSON.stringify({check:'TEACHER_SECOND_SUPPLEMENT_RETURN_DENIED',result:'PASS'}));
    }else{
      const responsePromise=page.waitForResponse(response=>new URL(response.url()).pathname.includes(recordId)&&response.request().method()==='POST');
      await page.getByRole('button',{name:'确认退回补证',exact:true}).click();
      const response=await responsePromise;
      assert.ok(response.ok());assert.equal((await response.json()).data.stage,'AWAITING_SUPPLEMENT');
      await page.getByRole('dialog').waitFor({state:'hidden'});
      console.log(JSON.stringify({check:'TEACHER_BROWSER_RETURN_REAL_CAMERA_RECORD',result:'PASS'}));
    }
  }else{
  const responsePromise=page.waitForResponse(response=>new URL(response.url()).pathname.includes(recordId)&&response.request().method()==='POST');
  await record.getByRole('radio',{name:'通过',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.locator('textarea').fill('本轮真实打卡审核：视频可读取，公开说明保存验收。');
  await dialog.getByRole('button',{name:'确认通过',exact:true}).click();
  const response=await responsePromise;assert.ok(response.ok());
  const saved=await read('/exercise-records/'+recordId+'/workflow');
  assert.equal(saved.stage,'VALID');
  assert.equal(saved.publicComment,'本轮真实打卡审核：视频可读取，公开说明保存验收。');
  await page.waitForFunction(id=>document.querySelector(`#checkin-record-${id} [role=radio][aria-checked=true]`)?.textContent.includes('通过'),recordId);
  await page.reload();
  console.log(JSON.stringify({check:'TEACHER_BROWSER_REVIEW_REAL_CAMERA_RECORD',result:'PASS'}));
  }
}catch(error){console.error(JSON.stringify({check:'TEACHER_BROWSER_REVIEW_REAL_CAMERA_RECORD',result:'FAIL',stage,type:error.name,message:error.message.slice(0,800)}));if(diagnosticPage)await diagnosticPage.screenshot({path:'.local/v81-browser-state/teacher-review-failure.png',fullPage:true});process.exitCode=1;}
finally{await browser.close();}
