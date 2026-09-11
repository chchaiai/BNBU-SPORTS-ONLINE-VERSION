import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const xlsx=createRequire(new URL('../../backend/package.json',import.meta.url))('xlsx');
const fixtureName=process.env.V81_RECOGNITION_FIXTURE??'recognition-settlement-browser';assert.match(fixtureName,/^[a-z0-9-]+$/);
const archived=process.env.V81_RECOGNITION_ARCHIVED==='1';
const file=new URL(`../../.local/v81-browser-state/${fixtureName}.json`,import.meta.url);
const state=JSON.parse(fs.readFileSync(file)),sectionId=state.fixture.teacherAActiveSectionId,application=state.application;
const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let page,stage='LOGIN';
try{
 page=await browser.newPage();page.setDefaultTimeout(60000);await page.goto('http://localhost:3300/');
 await page.getByLabel('学校邮箱').fill(state.accounts.teacher.email);await page.locator('#login-password').fill(state.accounts.teacher.password);
 const signed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/password-login');await page.getByRole('button',{name:'登录',exact:true}).click();const token=(await(await signed).json()).data.accessToken;
 const api=async(path,body)=>{const response=await fetch('http://127.0.0.1:3199/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':crypto.randomUUID()},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();assert.ok(response.ok,`${path}: ${response.status}`);return result.data;};
 const profile=await api(`/students/${state.student.studentId}`),course=await api(`/class-sections/${sectionId}`);
 if(course.status!=='CLOSED')await api(`/class-sections/${sectionId}/close`,{expectedVersion:course.version,reason:'Synthetic course closure before settlement recognition correction'});
 const reportsPath=`/class-sections/${sectionId}/settlement-reports`,historyPath=`/activity-certification-applications/${application.id}/recognition-allocation-revisions`;
 const openCourse=async()=>{await page.reload();await page.locator(`.teacher-course-card[data-class-section-id="${sectionId}"]`).getByRole('button',{name:/进入课程/}).click();await page.getByRole('region',{name:'课程结算'}).waitFor();};
 const area=()=>page.getByRole('region',{name:'课程结算'});
 stage='SETTLEMENT';await openCourse();
 if(!(await api(reportsPath)).items.length){await area().getByRole('checkbox').check();const settled=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1'+reportsPath&&r.request().method()==='POST');await area().getByRole('button',{name:'确认课程结算',exact:true}).click();assert.equal((await settled).status(),201);await area().getByText('结算报告 v1 已保存。',{exact:true}).waitFor();}
 const download=async(version,courseSeconds,generalSeconds)=>{const pending=page.waitForEvent('download');await area().getByRole('button',{name:`下载结算报告 v${version}`,exact:true}).click();const artifact=await pending;await artifact.saveAs(`.local/v81-browser-state/${fixtureName}-report-v${version}.xlsx`);const book=xlsx.read(fs.readFileSync(await artifact.path()),{type:'buffer'});const notes=xlsx.utils.sheet_to_json(book.Sheets['说明'],{header:1}),rows=xlsx.utils.sheet_to_json(book.Sheets['名单内'],{header:1});assert.equal(notes.find(r=>r[0]==='报告版本')[1],version);assert.equal(rows.length,2);assert.equal(rows[1][rows[0].indexOf('课程相关认可（秒）')],courseSeconds);assert.equal(rows[1][rows[0].indexOf('通用认可（秒）')],generalSeconds);return notes.find(r=>r[0]==='报告摘要 SHA-256')[1];};
 stage='INITIAL_REPORT';state.originalReportSha??=await download(1,1800,900);save();
 if(archived&&!state.switched){
  stage='ARCHIVE_BEFORE_CORRECTION';const admin=await browser.newPage();admin.setDefaultTimeout(60000);await admin.goto('http://localhost:3300/');await admin.getByLabel('学校邮箱').fill(state.accounts.admin.email);await admin.locator('#login-password').fill(state.accounts.admin.password);await admin.getByRole('button',{name:'登录',exact:true}).click();await admin.getByRole('button',{name:'学期管理',exact:true}).click();
  if(!state.target){await admin.getByRole('button',{name:'新增学期',exact:true}).click();const dialog=admin.getByRole('dialog'),inputs=dialog.locator('input');await inputs.nth(0).fill('Synthetic recognition new semester');await inputs.nth(1).fill('2026-2027');await inputs.nth(2).fill('2026-09-09');await inputs.nth(3).fill('2027-01-31');const created=admin.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/admin/semesters'&&r.request().method()==='POST');await dialog.getByRole('button',{name:'保存学期',exact:true}).click();const response=await created;assert.equal(response.status(),201);state.target=(await response.json()).data;save();await dialog.waitFor({state:'hidden'});}
  await admin.locator('tbody tr').filter({hasText:state.target.displayName}).getByRole('button',{name:'设为当前学期',exact:true}).click();const confirm=admin.getByRole('dialog').getByRole('button',{name:'确认切换',exact:true});await admin.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='确认切换'&&!b.disabled));const switched=admin.waitForResponse(r=>new URL(r.url()).pathname===`/api/v1/admin/semesters/${state.target.id}/switch`&&r.request().method()==='POST');await confirm.click();const response=await switched;assert.equal(response.status(),201);state.switched=(await response.json()).data;save();await admin.close();
 }
 if(archived){await page.reload();await page.locator(`[data-class-section-id="${sectionId}"]`).getByText('已归档',{exact:true}).waitFor();}

 const openApplication=async()=>{await page.getByRole('button',{name:'免测与认证',exact:true}).click();await page.getByRole('tab',{name:/全部申请/}).click();const row=page.getByRole('row').filter({hasText:application.reason}).filter({hasText:profile.fullName});const current=await api(`/exemption-applications/${application.id}`);if(current.status==='REVOKED')await row.getByRole('button',{name:'查看审核详情',exact:true}).click();else{await row.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('menuitem',{name:'查看详情',exact:true}).click();}await page.getByRole('dialog').getByText(/认可历史 v/).first().waitFor();};
 const mutateWithRecovery=async(kind)=>{
  stage=kind.toUpperCase();await page.reload();await openApplication();
  const path='/api/v1'+(kind==='adjust'?historyPath:`/activity-certification-applications/${application.id}/revoke`);
  state.receipts??={};let receipt=state.receipts[kind];
  if(!receipt){
   await page.getByRole('combobox',{name:/审核结果/}).click();await page.getByRole('option',{name:kind==='adjust'?'调整认可分钟':'撤销抵扣',exact:true}).click();
   if(kind==='adjust'){await page.getByLabel('课程运动抵扣',{exact:true}).fill('0.25');await page.getByLabel('其他运动抵扣',{exact:true}).fill('0.5');}
   await page.getByRole('dialog').locator('textarea').fill(`Synthetic settled recognition ${kind}`);
   let routeError;await page.route(`**${path}`,async route=>{if(route.request().method()!=='POST')return route.continue();try{const response=await route.fetch();assert.equal(response.status(),201);receipt={key:route.request().headers()['idempotency-key'],data:(await response.json()).data};state.receipts[kind]=receipt;save();}catch(error){routeError=error;}await route.abort('failed');});
   await page.getByRole('button',{name:'确认审核',exact:true}).click();await page.getByRole('alert').waitFor();await page.unroute(`**${path}`);if(routeError)throw routeError;assert.ok(receipt);
   await page.reload();await openApplication();
  }
  if(!receipt.replayed){await page.getByText('上次审核结果待确认，确认审核将重试原请求。',{exact:true}).waitFor();assert.equal(await page.getByRole('dialog').locator('textarea').isDisabled(),true);const replayed=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');await page.getByRole('button',{name:'确认审核',exact:true}).click();const replay=await replayed;assert.equal(replay.status(),201);assert.equal(replay.request().headers()['idempotency-key'],receipt.key);assert.deepEqual((await replay.json()).data,receipt.data);receipt.replayed=true;save();}
 };
 if((await api(historyPath)).length<2||!state.receipts?.adjust?.replayed)await mutateWithRecovery('adjust');
 stage='ADJUSTED_REPORT';await openCourse();await download(2,900,1800);assert.equal(await download(1,1800,900),state.originalReportSha);
 if((await api(`/exemption-applications/${application.id}`)).status!=='REVOKED'||!state.receipts?.revoke?.replayed)await mutateWithRecovery('revoke');
 stage='REVOKED_REPORT';await openCourse();await download(3,0,0);await download(2,900,1800);assert.equal(await download(1,1800,900),state.originalReportSha);
 assert.equal((await api(reportsPath)).items.length,3);const history=await api(historyPath);assert.equal(history.length,3);assert.equal(history[0].active,false);assert.equal(history.at(-1).courseSeconds,1800);
 await page.screenshot({path:`.local/v81-browser-state/${fixtureName}.png`});
 console.log(JSON.stringify({check:'RECOGNITION_SETTLEMENT_BROWSER',result:'PASS',adjustReplay:state.receipts.adjust.replayed,revokeReplay:state.receipts.revoke.replayed,archived,reportVersions:3,downloadedValues:[[1800,900],[900,1800],[0,0]],originalShaPreserved:true}));
}catch(error){console.error(JSON.stringify({check:'RECOGNITION_SETTLEMENT_BROWSER',result:'FAIL',stage,message:error.message.slice(0,700)}));await page?.screenshot({path:'.local/v81-browser-state/recognition-settlement-failure.png'});process.exitCode=1;}finally{await browser.close();}
