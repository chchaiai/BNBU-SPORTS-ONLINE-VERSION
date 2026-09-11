// Read existing accepted records through both real web clients. No review writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const cloud=process.env.BNBU_RECORD_CLOUD==='1';
const fixture=JSON.parse(fs.readFileSync(cloud?'.local/round2-cloud-long-private.json':'.local/v81-browser-state/state.json','utf8'));
const teacher=cloud?fixture.teacher:fixture.accounts.teacher;
const {recordId}=JSON.parse(fs.readFileSync(cloud?'.local/round2-cloud-long-submission.json':'.local/v81-browser-state/camera-submission-round2-positive-credit.json','utf8'));
const portal=cloud?'https://www.teacher.bnbusports.cn':'http://localhost:3300';
const studentOrigin=cloud?'https://www.student.bnbusports.cn':'http://127.0.0.1:4274';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const label=cloud?'cloud':'local';
const dateTime=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
try{
 const page=await browser.newPage({timezoneId:'Asia/Shanghai'});page.setDefaultTimeout(60000);await page.goto(portal);
 await page.locator('#login-account').fill(teacher.email);await page.locator('#login-password').fill(teacher.password);
 const loginResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/auth/password-login')&&r.request().method()==='POST');await page.getByRole('button',{name:'登录',exact:true}).click();const response=await loginResponse;assert.equal(response.status(),200);const token=(await response.json()).data.accessToken;
 const read=async path=>{const r=await page.request.get(portal+'/api/v1'+path,{headers:{authorization:`Bearer ${token}`}});assert.equal(r.status(),200);return(await r.json()).data;};
 const record=await read('/exercise-records/'+recordId),student=await read('/students/'+record.studentId),evidence=await read(`/exercise-records/${recordId}/evidence-context`);
 assert.equal(record.creditedDurationSeconds,1800);assert.ok(evidence.startedAt&&evidence.endedAt&&record.submittedAt);
 await page.getByRole('button',{name:/新建课程/}).waitFor();await page.getByRole('button',{name:'打卡审核',exact:true}).click();await page.getByRole('tab',{name:/全部记录/}).click();await page.getByRole('row').filter({hasText:student.fullName}).getByRole('button',{name:/查看记录/}).click();const row=page.locator('#checkin-record-'+recordId);await row.waitFor();await row.locator('.checkin-description').click();
 const dialog=page.getByRole('dialog');await dialog.getByText('30 分钟',{exact:true}).waitFor();
 const expectedClock=dateTime(record.submittedAt).match(/\d{2}:\d{2}/)[0].replace(/^0/,'');
 const submissionText=await dialog.locator('dt').filter({hasText:'提交时间'}).locator('..').innerText();assert.ok(submissionText.includes(expectedClock),submissionText);
 assert.equal(await dialog.getByText('异常',{exact:true}).count(),0);
 await dialog.locator('.teacher-original-media img').waitFor();await page.waitForFunction(()=>document.querySelector('.teacher-original-media img')?.naturalWidth>0);
 await dialog.screenshot({path:`.local/round2-evidence/${label}-record-teacher-corrected.png`});
 const sp=await browser.newPage({timezoneId:'Asia/Shanghai'});sp.setDefaultTimeout(60000);
 if(cloud)await sp.addInitScript(auth=>{localStorage.setItem('bnbu.student.web.apiTokens',JSON.stringify(auth));localStorage.setItem('bnbu.student.web.session',JSON.stringify({kind:'api',accountId:auth.accountId,signedInAt:new Date().toISOString()}));},{...fixture.studentSession,userId:fixture.student.userId,accountId:'SYNTH-SESSION-'+fixture.student.email.split('.')[2].toUpperCase(),schemaVersion:2});
 await sp.goto(studentOrigin+'/student/');await sp.getByRole('button',{name:'同意并继续',exact:true}).click();
 if(!cloud){
  const account=JSON.parse(fs.readFileSync('.local/v81-browser-state/student-round2-positive-credit.json','utf8'));
  await sp.getByText('直接登录',{exact:true}).click();await sp.getByText('邮箱验证码登录',{exact:true}).click();await sp.getByPlaceholder('name@bnbu.edu.cn').fill(account.email);
  const old=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=50')).json(),ids=new Set(old.messages.map(m=>m.ID));await sp.getByRole('button',{name:'获取验证码',exact:true}).click();let code;
  for(let i=0;i<30&&!code;i++){const messages=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=50')).json();const m=messages.messages.find(m=>!ids.has(m.ID)&&JSON.stringify(m.To).includes(account.email));if(m){const full=await(await fetch('http://127.0.0.1:18025/api/v1/message/'+m.ID)).json();code=full.Text.match(/\b\d{6}\b/)?.[0];}if(!code)await new Promise(r=>setTimeout(r,500));}
  assert.ok(code);await sp.getByPlaceholder('4–10 位数字').fill(code);await sp.getByRole('button',{name:'登录',exact:true}).click();
 }
 await sp.getByText('我的',{exact:true}).or(sp.getByText('运动指引',{exact:true})).first().waitFor();await sp.evaluate(async()=>{window.recordProbeApp=(await import('/student/js/app.js')).app;});await sp.waitForFunction(()=>!window.recordProbeApp.state.isLoading&&!window.recordProbeApp.state.isRestoringSession);if(await sp.getByText('运动指引',{exact:true}).isVisible())await sp.getByRole('button',{name:'跳过',exact:true}).click();
 await sp.locator('[data-action="root.tab"][data-tab="checkin"]').click();await sp.locator('[data-action="checkin.tab"][data-tab="records"]').click();await sp.locator(`[data-action="checkin.openRecord"][data-record-id="${recordId}"]`).click();
 await sp.waitForFunction(id=>window.recordProbeApp.state.workspace.records.find(r=>r.id===id)?.serverProofsLoaded,recordId);
 const times=await sp.evaluate(id=>{const r=window.recordProbeApp.state.workspace.records.find(r=>r.id===id);return{start:r.startTime,end:r.endTime};},recordId);
 assert.equal(times.start,evidence.startedAt);assert.equal(times.end,evidence.endedAt);assert.equal(await sp.getByText('未提供',{exact:true}).count(),0);
 await sp.screenshot({path:`.local/round2-evidence/${label}-record-student-corrected.png`,fullPage:true});
 assert.ok(record.currentReview?.publicComment);await sp.getByText(record.currentReview.publicComment,{exact:true}).scrollIntoViewIfNeeded();
 await sp.screenshot({path:`.local/round2-evidence/${label}-record-student-feedback-corrected.png`,fullPage:true});
 console.log(JSON.stringify({check:'REAL_RECORD_CREDIT_AND_TIMESTAMPS',environment:cloud?'TENCENT_CLOUD':'LOCAL_DOCKER',result:'PASS',recordId,creditedMinutes:30,teacherSubmittedAt:record.submittedAt,studentStartedAt:times.start,studentEndedAt:times.end}));
}finally{await browser.close();}
