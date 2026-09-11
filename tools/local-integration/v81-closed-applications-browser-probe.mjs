import fs from 'node:fs';import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const run=process.env.V81_CLOSED_APPS_RUN??'initial';assert.match(run,/^[a-z0-9-]+$/);
const dir=new URL('../../.local/v81-browser-state/',import.meta.url),state=JSON.parse(fs.readFileSync(new URL('state.json',dir))),fixture=JSON.parse(fs.readFileSync(new URL(`closed-applications-${run}.json`,dir)));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});let page,stage='LOGIN';
try{
 page=await browser.newPage();page.setDefaultTimeout(60000);await page.goto('http://localhost:3300/');await page.getByLabel('学校邮箱').fill(state.accounts.teacher.email);await page.locator('#login-password').fill(state.accounts.teacher.password);const logged=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/password-login');await page.getByRole('button',{name:'登录',exact:true}).click();const token=(await(await logged).json()).data.accessToken;
 const api=async path=>{const response=await fetch('http://127.0.0.1:3199/api/v1'+path,{headers:{authorization:`Bearer ${token}`}});assert.equal(response.status,200);return(await response.json()).data;};
 const section=await api(`/class-sections/${fixture.sectionId}`),profile=await api(`/students/${fixture.student.studentId}`);
 if(section.status!=='CLOSED'){
  stage='CLOSE_WITH_ACCEPTED_APPLICATIONS';await page.locator(`[data-class-section-id="${fixture.sectionId}"]`).getByRole('button',{name:/进入课程/}).click();
  await page.getByRole('region',{name:'课程结算'}).getByText('待处理申请：待处理（2）',{exact:true}).waitFor();
  const area=page.getByRole('region',{name:'课程关闭'});await area.locator('textarea').fill('Synthetic close with two accepted applications');await area.getByRole('checkbox').check();const closed=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/v1/class-sections/${fixture.sectionId}/close`&&r.request().method()==='POST');await area.getByRole('button',{name:'确认关闭课程',exact:true}).click();assert.equal((await closed).status(),200);
 }
 for(const application of fixture.applications){
  const current=await api(`/exemption-applications/${application.id}`);if(current.status==='APPROVED')continue;
  stage='APPROVE_'+application.applicationType;await page.reload();await page.getByRole('button',{name:'免测与认证',exact:true}).click();
  const row=page.getByRole('row').filter({hasText:application.reason}).filter({hasText:profile.fullName});await row.getByRole('button',{name:'开始审核',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByPlaceholder('请说明审核依据和处理结果').fill('Synthetic approval after course closure');
  if(application.applicationType==='EXERCISE_CHECK_IN'){
   await dialog.getByLabel('课程运动抵扣',{exact:true}).fill('0.5');await dialog.getByLabel('其他运动抵扣',{exact:true}).fill('0.25');
  }
  const path=`/api/v1/exemption-applications/${application.id}/review`;
  if(application.applicationType==='EXERCISE_CHECK_IN'){
   let key,saved;
   await page.route(`**${path}`,async route=>{const body=route.request().postDataJSON();assert.equal(body.courseMinutes,30);assert.equal(body.generalMinutes,15);const response=await route.fetch();assert.equal(response.status(),200);saved=(await response.json()).data;key=route.request().headers()['idempotency-key'];await route.abort('failed');});
   await dialog.getByRole('button',{name:'确认审核',exact:true}).click();await page.getByRole('alert').waitFor();assert.ok(key);await page.unroute(`**${path}`);
   stage='REFRESH_REPLAY';await page.reload();await page.getByRole('button',{name:'免测与认证',exact:true}).click();await page.getByRole('tab',{name:/全部申请/}).click();await page.getByRole('row').filter({hasText:application.reason}).filter({hasText:profile.fullName}).getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('menuitem',{name:'查看详情',exact:true}).click();
   await page.getByText('上次审核结果待确认，确认审核将重试原请求。',{exact:true}).waitFor();assert.equal(await page.getByLabel('课程运动抵扣',{exact:true}).inputValue(),'0.5');
   const replayed=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');await page.getByRole('button',{name:'确认审核',exact:true}).click();const replay=await replayed;assert.equal(replay.status(),200);assert.equal(replay.request().headers()['idempotency-key'],key);assert.deepEqual((await replay.json()).data,saved);
  }else{
   const reviewed=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');await dialog.getByRole('button',{name:'确认审核',exact:true}).click();const response=await reviewed;assert.equal(response.status(),200);assert.equal((await response.json()).data.status,'APPROVED');
  }
 }
 const checks=await api(`/class-sections/${fixture.sectionId}/settlement-check`);assert.equal(checks.checks.find(c=>c.code==='PENDING_APPLICATION').count,0);
 const certification=fixture.applications.find(a=>a.applicationType==='EXERCISE_CHECK_IN'),history=await api(`/activity-certification-applications/${certification.id}/recognition-allocation-revisions`);
 assert.equal(history[0].courseSeconds,1800);assert.equal(history[0].generalSeconds,900);
 await page.reload();await page.getByRole('button',{name:'免测与认证',exact:true}).click();await page.screenshot({path:'.local/v81-browser-state/closed-applications-browser.png'});
 console.log(JSON.stringify({check:'CLOSED_APPLICATIONS_BROWSER',result:'PASS',approved:2,courseMinutes:30,generalMinutes:15,pendingApplications:0,syntheticMediaMetadata:true}));
}catch(error){console.error(JSON.stringify({check:'CLOSED_APPLICATIONS_BROWSER',result:'FAIL',stage,type:error.name,message:error.message.slice(0,700)}));await page?.screenshot({path:'.local/v81-browser-state/closed-applications-failure.png'});process.exitCode=1;}finally{await browser.close();}
