import fs from 'node:fs';import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const dir=new URL('../../.local/v81-browser-state/',import.meta.url),switchFixture=process.env.V81_GRADE_CORRECTION_FIXTURE==='semester-switch',state=JSON.parse(fs.readFileSync(new URL(switchFixture?'semester-switch-browser.json':'state.json',dir))),fixture=switchFixture?{id:state.fixture.teacherAActiveSectionId,student:state.student}:JSON.parse(fs.readFileSync(new URL('grade-settlement-browser.json',dir)));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});let page,stage='LOGIN';
try{
 page=await browser.newPage();page.setDefaultTimeout(45000);await page.goto('http://localhost:3300/');await page.getByLabel('学校邮箱').fill(state.accounts.teacher.email);await page.locator('#login-password').fill(state.accounts.teacher.password);
 const logged=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/password-login');await page.getByRole('button',{name:'登录',exact:true}).click();const token=(await(await logged).json()).data.accessToken;
 const api=async(path,body)=>{const response=await fetch(`http://127.0.0.1:3199/api/v1${path}`,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':crypto.randomUUID()},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.ok(response.ok,`${path}: ${response.status} ${data.error?.code}`);return data.data;};
 const reportPath=`/class-sections/${fixture.id}/settlement-reports`,gradePath=`/enrollments/${fixture.student.enrollmentId}/final-grades`;
 stage='PREPARE_SETTLED_ORIGINAL';let reports=await api(reportPath);
 if(!reports.items.length){
  if(!fixture.rosterConfirmed){await api(`/roster-imports/${fixture.importId}/confirmation`,{expectedVersion:fixture.importVersion});fixture.rosterConfirmed=true;fs.writeFileSync(new URL('grade-settlement-browser.json',dir),JSON.stringify(fixture));}
  const physical=await api(`/enrollments/${fixture.student.enrollmentId}/physical-results`);if(!physical.items.length)await api(`/enrollments/${fixture.student.enrollmentId}/physical-results`,{expectedVersion:0,runType:'1000m',elapsedSeconds:270,testedOn:'2026-09-07'});
  const grades=await api(gradePath);if(!grades.items.length)await api(gradePath,{expectedVersion:0,finalGrade:80,published:true});
  const preview=await api(`/class-sections/${fixture.id}/settlement-preview`);await api(reportPath,{expectedVersion:0,previewFingerprint:preview.previewFingerprint});reports=await api(reportPath);
 }
 const before=await api(`${reportPath}/${reports.items[0].version}`),oldGrades=await api(gradePath),profile=await api(`/students/${fixture.student.studentId}`),sections=await api('/class-sections?limit=100');
 const index=sections.findIndex(s=>s.id===fixture.id);assert.ok(index>=0);
 const open=async()=>{await page.getByRole('button',{name:'内部成绩册',exact:true}).click();await page.getByRole('combobox',{name:'当前课程',exact:true}).click();await page.getByRole('option').nth(index).click();await page.getByRole('row').filter({hasText:profile.fullName}).getByRole('button',{name:/录入成绩|查看 \/ 修改成绩/}).click();await page.getByLabel('结算后成绩更正原因',{exact:false}).waitFor();};
 stage='REASON_REQUIRED';await open();await page.getByLabel('最终成绩',{exact:false}).fill('91');await page.getByRole('button',{name:'保存成绩更正',exact:true}).click();await page.getByText('结算后的成绩更正必须填写原因。',{exact:true}).waitFor();
 const reason=`Synthetic final grade browser correction ${crypto.randomUUID()}`;await page.getByLabel('结算后成绩更正原因',{exact:false}).fill(reason);await page.getByRole('checkbox',{name:'将本次更正发布到内部成绩册'}).check();
 const path=`/api/v1${gradePath}/corrections`;let key,version;stage='LOST_RESPONSE';
 await page.route(`**${path}`,async route=>{const response=await route.fetch();assert.equal(response.status(),201);version=(await response.json()).data.version;key=route.request().headers()['idempotency-key'];await route.abort('failed');});
 await page.getByRole('button',{name:'保存成绩更正',exact:true}).click();await page.getByText('网络连接失败，请检查网络后重试。',{exact:true}).waitFor();assert.ok(version);await page.unroute(`**${path}`);
 stage='RELOAD_REPLAY';await page.reload();await open();assert.equal(await page.getByLabel('结算后成绩更正原因',{exact:false}).inputValue(),reason);
 const replayed=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');await page.getByRole('button',{name:'保存成绩更正',exact:true}).click();const replay=await replayed;assert.equal(replay.status(),201);assert.equal(replay.request().headers()['idempotency-key'],key);assert.equal((await replay.json()).data.version,version);
 await page.getByText('最终成绩更正已保存，已生成新版结算报告，原版保留。',{exact:true}).waitFor();
 stage='HISTORY';const newGrades=await api(gradePath);assert.deepEqual(newGrades.items.slice(1),oldGrades.items);assert.equal(newGrades.items[0].finalGrade,91);assert.equal(newGrades.items[0].published,true);assert.deepEqual(await api(`${reportPath}/${before.version}`),before);
 const latest=(await api(reportPath)).items[0];assert.equal(latest.version,before.version+1);const report=await api(`${reportPath}/${latest.version}`);assert.equal(report.report.correction.gradeVersion,version);assert.equal(report.report.correction.reason,reason);
 const row=[...report.report.rows,...report.report.extras].find(row=>row.enrollmentId===fixture.student.enrollmentId);assert.equal(row.finalGrade.latestRevision.finalGrade,91);assert.equal(row.finalGrade.publishedRevision.finalGrade,91);
 await page.reload();await open();assert.equal(await page.getByLabel('最终成绩',{exact:false}).inputValue(),'91');
 console.log(JSON.stringify({check:'FINAL_GRADE_CORRECTION_BROWSER',result:'PASS',reasonRequired:true,lostResponseReplay:true,oldReportUnchanged:true,oldGradesUnchanged:true,gradeVersion:version,reportVersion:latest.version}));
}catch(error){console.error(JSON.stringify({check:'FINAL_GRADE_CORRECTION_BROWSER',result:'FAIL',stage,type:error.name,message:error.message.slice(0,700)}));await page?.screenshot({path:'.local/v81-browser-state/final-grade-correction-failure.png'});process.exitCode=1;}finally{await browser.close();}
