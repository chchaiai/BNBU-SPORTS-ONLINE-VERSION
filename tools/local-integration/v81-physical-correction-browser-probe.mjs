import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const dir=new URL('../../.local/v81-browser-state/',import.meta.url);
const switchFixture=process.env.V81_PHYSICAL_CORRECTION_FIXTURE==='semester-switch';
const state=JSON.parse(fs.readFileSync(new URL(switchFixture?'semester-switch-browser.json':'state.json',dir)));
const fixture=switchFixture?{id:state.fixture.teacherAActiveSectionId,student:state.student}:JSON.parse(fs.readFileSync(new URL('settlement-browser.json',dir)));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let page,stage='LOGIN';
try {
 page=await browser.newPage();page.setDefaultTimeout(45000);
 await page.goto('http://localhost:3300/');await page.getByLabel('学校邮箱').fill(state.accounts.teacher.email);await page.locator('#login-password').fill(state.accounts.teacher.password);
 const login=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/password-login');await page.getByRole('button',{name:'登录',exact:true}).click();
 const token=(await (await login).json()).data.accessToken;
 const api=async path=>{const response=await fetch(`http://127.0.0.1:3199/api/v1${path}`,{headers:{authorization:`Bearer ${token}`}});assert.equal(response.status,200);return (await response.json()).data;};
 const profile=await api(`/students/${fixture.student.studentId}`),sections=await api('/class-sections?limit=100');
 const index=sections.findIndex(s=>s.id===fixture.id);assert.ok(index>=0);
 const reportPath=`/class-sections/${fixture.id}/settlement-reports`,reports=await api(reportPath);
 assert.ok(reports.items.length);const priorVersion=reports.items[0].version,prior=await api(`${reportPath}/${priorVersion}`);
 const path=`/api/v1/enrollments/${fixture.student.enrollmentId}/physical-results/corrections`;
 const open=async()=>{await page.getByRole('button',{name:'内部成绩册',exact:true}).click();await page.getByRole('combobox',{name:'当前课程',exact:true}).click();await page.getByRole('option').nth(index).click();await page.getByRole('row').filter({hasText:profile.fullName}).getByRole('button',{name:/录入成绩|查看 \/ 修改成绩/}).click();await page.locator('#physical-correction-reason').waitFor();};
 await open();const area=page.getByRole('region',{name:'原始体测资料'});
 stage='REASON_REQUIRED';await page.locator('#physical-minutes').fill('4');await page.locator('#physical-seconds').fill('31');await page.locator('#physical-tested-on').fill('2026-09-07');
 await area.getByRole('button',{name:'保存原始体测',exact:true}).click();await area.getByRole('alert').filter({hasText:'结算后的体测更正必须填写原因'}).waitFor();
 stage='LOST_RESPONSE';const reason=`Synthetic browser physical correction ${crypto.randomUUID()}`;await page.locator('#physical-correction-reason').fill(reason);let version,key;
 await page.route(`**${path}`,async route=>{const response=await route.fetch();assert.equal(response.status(),201);version=(await response.json()).data.version;key=route.request().headers()['idempotency-key'];await route.abort('failed');});
 await area.getByRole('button',{name:'保存原始体测',exact:true}).click();await area.getByRole('alert').waitFor();assert.ok(version);await page.unroute(`**${path}`);
 stage='RELOAD_REPLAY';await page.reload();await open();const replayed=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');await area.getByRole('button',{name:'重试原体测保存',exact:true}).click();const replay=await replayed;
 assert.equal(replay.status(),201);assert.equal(replay.request().headers()['idempotency-key'],key);assert.equal((await replay.json()).data.version,version);await area.getByText('原始体测资料已保存，历史版本已保留。',{exact:true}).waitFor();
 stage='REPORT_HISTORY';assert.deepEqual(await api(`${reportPath}/${priorVersion}`),prior);const latest=await api(`${reportPath}/${priorVersion+1}`);assert.equal(latest.report.correction.physicalVersion,version);assert.equal(latest.report.correction.reason,reason);assert.equal([...latest.report.rows,...latest.report.extras].find(row=>row.enrollmentId===fixture.student.enrollmentId).physical.result.elapsedSeconds,271);
 assert.equal((await api(reportPath)).items[0].version,priorVersion+1);
 await page.reload();await open();await area.locator(`[data-physical-version="${version}"]`).waitFor();
 console.log(JSON.stringify({check:'PHYSICAL_CORRECTION_BROWSER',result:'PASS',reasonRequired:true,lostResponseReplay:true,oldReportUnchanged:true,physicalVersion:version,reportVersion:priorVersion+1}));
}catch(error){console.error(JSON.stringify({check:'PHYSICAL_CORRECTION_BROWSER',result:'FAIL',stage,type:error.name,message:error.message.slice(0,700)}));await page?.screenshot({path:'.local/v81-browser-state/physical-correction-failure.png'});process.exitCode=1;}
finally{await browser.close();}
