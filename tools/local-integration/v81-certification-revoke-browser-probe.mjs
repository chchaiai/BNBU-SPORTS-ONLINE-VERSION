import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const run=process.env.V81_CLOSED_APPS_RUN??'replay';assert.match(run,/^[a-z0-9-]+$/);
const dir=new URL('../../.local/v81-browser-state/',import.meta.url),state=JSON.parse(fs.readFileSync(new URL('state.json',dir))),fixture=JSON.parse(fs.readFileSync(new URL(`closed-applications-${run}.json`,dir))),application=fixture.applications.find(a=>a.applicationType==='EXERCISE_CHECK_IN');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});let page,stage='LOGIN';
try{
 page=await browser.newPage();page.setDefaultTimeout(60000);await page.goto('http://localhost:3300/');await page.getByLabel('学校邮箱').fill(state.accounts.teacher.email);await page.locator('#login-password').fill(state.accounts.teacher.password);const login=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/password-login');await page.getByRole('button',{name:'登录',exact:true}).click();const token=(await(await login).json()).data.accessToken;
 const api=async path=>{const response=await fetch('http://127.0.0.1:3199/api/v1'+path,{headers:{authorization:`Bearer ${token}`}});assert.equal(response.status,200);return(await response.json()).data;};
 const profile=await api(`/students/${fixture.student.studentId}`),path=`/api/v1/activity-certification-applications/${application.id}/revoke`,historyPath=`/activity-certification-applications/${application.id}/recognition-allocation-revisions`;
 const before=await api(historyPath),current=await api(`/exemption-applications/${application.id}`);let replayVerified=false;
 const row=()=>page.getByRole('row').filter({hasText:application.reason}).filter({hasText:profile.fullName});
 if(current.status==='APPROVED'){
  stage='OPEN_REVOKE';await page.getByRole('button',{name:'免测与认证',exact:true}).click();await page.getByRole('tab',{name:/全部申请/}).click();await row().getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('menuitem',{name:'撤销抵扣',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByText(/认可历史.*课程运动 30 分钟，其他运动 15 分钟/).waitFor();
  await dialog.getByPlaceholder('请说明审核依据和处理结果').fill('Synthetic revoked participation after course closure');
  let key,saved;await page.route(`**${path}`,async route=>{const response=await route.fetch();assert.equal(response.status(),201);saved=(await response.json()).data;key=route.request().headers()['idempotency-key'];await route.abort('failed');});
  stage='LOST_RESPONSE';await dialog.getByRole('button',{name:'确认审核',exact:true}).click();await page.getByRole('alert').waitFor();assert.ok(key);await page.unroute(`**${path}`);
  stage='RELOAD_REPLAY';await page.reload();await page.getByRole('button',{name:'免测与认证',exact:true}).click();await page.getByRole('tab',{name:/全部申请/}).click();await row().getByRole('button',{name:'查看审核详情',exact:true}).click();await page.getByText('上次审核结果待确认，确认审核将重试原请求。',{exact:true}).waitFor();
  assert.equal(await page.getByRole('dialog').locator('textarea').isDisabled(),true);
  const replayed=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');await page.getByRole('button',{name:'确认审核',exact:true}).click();const replay=await replayed;assert.equal(replay.status(),201);assert.equal(replay.request().headers()['idempotency-key'],key);assert.deepEqual((await replay.json()).data,saved);replayVerified=true;
 }
 stage='READBACK';const after=await api(historyPath);assert.equal(after[0].active,false);assert.equal(after[0].courseSeconds,0);assert.equal(after[0].generalSeconds,0);assert.equal(after.length,2);assert.deepEqual(after.at(-1),before.at(-1));
 const list=await api('/exemption-application-details?limit=100');assert.equal(list.find(a=>a.id===application.id).status,'REVOKED');
 await page.reload();await page.getByRole('button',{name:'免测与认证',exact:true}).click();await page.getByRole('tab',{name:/全部申请/}).click();await row().getByRole('button',{name:'查看审核详情',exact:true}).click();await page.getByRole('dialog').getByText(/已撤销.*Synthetic revoked participation/).first().waitFor();await page.getByText(/认可历史.*课程运动 30 分钟，其他运动 15 分钟/).waitFor();assert.equal(await page.getByRole('button',{name:'确认审核',exact:true}).isDisabled(),true);
 await page.screenshot({path:'.local/v81-browser-state/certification-revoke-browser.png'});
 console.log(JSON.stringify({check:'CERTIFICATION_REVOKE_BROWSER',result:'PASS',replayVerified,historyVersions:2,oldHistoryPreserved:true,revokedNotPending:true}));
}catch(error){console.error(JSON.stringify({check:'CERTIFICATION_REVOKE_BROWSER',result:'FAIL',stage,type:error.name,message:error.message.slice(0,700)}));await page?.screenshot({path:'.local/v81-browser-state/certification-revoke-failure.png'});process.exitCode=1;}finally{await browser.close();}
