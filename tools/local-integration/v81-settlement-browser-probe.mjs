import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const xlsx=createRequire(new URL('../../BNBU-Sports-Web-new/portal-teacher-admin/package.json',import.meta.url))('xlsx');
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const dir=new URL('../../.local/v81-browser-state/',import.meta.url);
const state=JSON.parse(fs.readFileSync(new URL('state.json',dir)));
const fixture=JSON.parse(fs.readFileSync(new URL('settlement-browser.json',dir)));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let page;let stage='LOGIN';
try {
 page=await browser.newPage();page.setDefaultTimeout(15000);page.on('response',async r=>{if(r.status()>=400&&new URL(r.url()).pathname.startsWith('/api/v1/'))console.log(JSON.stringify({path:new URL(r.url()).pathname,status:r.status(),error:(await r.json()).error}));});
 await page.goto('http://localhost:3300/');await page.getByLabel('学校邮箱').fill(state.accounts.teacher.email);
 await page.locator('#login-password').fill(state.accounts.teacher.password);
 const logged=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/password-login');
 await page.getByRole('button',{name:'登录',exact:true}).click();
 const login=await (await logged).json();const token=login.data.accessToken;
 const api=async(path,body)=>{
  const response=await fetch(`http://127.0.0.1:3199/api/v1${path}`,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':crypto.randomUUID()},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();assert.ok(response.ok,`${path}: ${response.status} ${data.error?.code}`);return data.data;
 };
 const reports=await api(`/class-sections/${fixture.id}/settlement-reports`);
 if(!reports.items.length){
  stage='PREPARE_CONFIRMED_ROSTER';
  // Confirm pre-created synthetic source through the real service; no settlement result is seeded.
  if(!fixture.rosterConfirmed){await api(`/roster-imports/${fixture.importId}/confirmation`,{expectedVersion:fixture.importVersion});fixture.rosterConfirmed=true;fs.writeFileSync(new URL('settlement-browser.json',dir),JSON.stringify(fixture));}
 }
 const open=async()=>{await page.locator(`.teacher-course-card[data-class-section-id="${fixture.id}"]`).getByRole('button',{name:/进入课程/}).click();await page.getByRole('region',{name:'课程结算'}).waitFor();};
 await open();const area=page.getByRole('region',{name:'课程结算'});
 stage='BLOCKED_PRECHECK';
 if(!reports.items.length&&!fixture.physicalRecorded){
  await area.getByText('原始体测资料：待确认（1）',{exact:true}).waitFor();
  assert.equal(await area.getByRole('button',{name:'确认课程结算',exact:true}).isDisabled(),true);
  await api(`/enrollments/${fixture.student.enrollmentId}/physical-results`,{expectedVersion:0,runType:'1000m',elapsedSeconds:270,testedOn:'2026-09-07'});
  fixture.physicalRecorded=true;fs.writeFileSync(new URL('settlement-browser.json',dir),JSON.stringify(fixture));
  await area.getByRole('button',{name:'刷新结算预检'}).click();
 }
 stage='PREVIEW_EXPORT';
 await area.getByRole('button',{name:'导出实时综合名单'}).waitFor();
 const download=page.waitForEvent('download');await area.getByRole('button',{name:'导出实时综合名单'}).click();
 const previewFile=await download;assert.match(previewFile.suggestedFilename(),/^composite-roster-preview-.*\.xlsx$/);
 const bytes=fs.readFileSync(await previewFile.path());assert.equal(bytes.subarray(0,2).toString(),'PK');
 const validateWorkbook=(bytes,saved)=>{
  const workbook=xlsx.read(bytes,{type:'buffer'});
  const notes=xlsx.utils.sheet_to_json(workbook.Sheets['说明'],{header:1});
  assert.equal(notes.find(row=>row[0]==='课程标识')[1],fixture.id);
  assert.equal(notes.find(row=>row[0]==='报告性质')[1],saved?'已保存的结算快照':'实时预览（未结算）');
  const rows=xlsx.utils.sheet_to_json(workbook.Sheets['名单内'],{header:1});assert.equal(rows.length,2);assert.equal(rows[1][5],saved?270:currentPhysical.items[0].elapsedSeconds);
  if(saved){assert.equal(notes.find(row=>row[0]==='报告版本')[1],1);assert.ok(workbook.Sheets['结算检查']);}
 };
 const currentPhysical=await api(`/enrollments/${fixture.student.enrollmentId}/physical-results`);
 validateWorkbook(bytes,false);
 if(!reports.items.length){
  stage='CONFIRM_LOST_RESPONSE';let committed=false,originalKey;
  await area.getByRole('checkbox').check();
  await page.route(`**/api/v1/class-sections/${fixture.id}/settlement-reports`,async route=>{
   if(route.request().method()!=='POST')return route.continue();
   originalKey=route.request().headers()['idempotency-key'];const response=await route.fetch();assert.equal(response.status(),201);committed=true;await route.abort('failed');
  });
  await area.getByRole('button',{name:'确认课程结算',exact:true}).click();await area.getByRole('alert').waitFor();assert.equal(committed,true);
  await page.unroute(`**/api/v1/class-sections/${fixture.id}/settlement-reports`);
  stage='RELOAD_REPLAY';await page.reload();await open();
  const replayed=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/v1/class-sections/${fixture.id}/settlement-reports`&&r.request().method()==='POST');
  await area.getByRole('button',{name:'重试并查询结算结果'}).click();const replay=await replayed;assert.equal(replay.status(),201);assert.equal(replay.request().headers()['idempotency-key'],originalKey);
  await area.getByText('结算报告 v1 已保存。',{exact:true}).waitFor();
 }
 stage='SNAPSHOT_EXPORT';
 const savedDownload=page.waitForEvent('download');await area.getByRole('button',{name:'下载结算报告 v1',exact:true}).click();
 const savedFile=await savedDownload;assert.match(savedFile.suggestedFilename(),/-v1\.xlsx$/);assert.equal(fs.readFileSync(await savedFile.path()).subarray(0,2).toString(),'PK');
 validateWorkbook(fs.readFileSync(await savedFile.path()),true);
 await page.reload();await open();await area.getByRole('button',{name:'下载结算报告 v1',exact:true}).waitFor();
 assert.equal(await area.getByRole('button',{name:'确认课程结算',exact:true}).isDisabled(),true);
 await area.getByRole('button',{name:'下载结算报告 v1',exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:new URL('settlement-browser.png',dir).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
 console.log(JSON.stringify({check:'COURSE_SETTLEMENT_BROWSER',result:'PASS',newSettlement:!reports.items.length,previewExport:true,snapshotExport:true,workbookFactsVerified:true,reloadHistory:true}));
}catch(error){console.log(JSON.stringify({region:await page?.getByRole('region',{name:'课程结算'}).textContent().catch(()=>null)}));await page?.screenshot({path:'.local/v81-browser-state/settlement-failure.png',fullPage:true});console.error(JSON.stringify({check:'COURSE_SETTLEMENT_BROWSER',result:'FAIL',stage,type:error.name,message:error.message.slice(0,1600)}));process.exitCode=1;}
finally{await browser.close();}
