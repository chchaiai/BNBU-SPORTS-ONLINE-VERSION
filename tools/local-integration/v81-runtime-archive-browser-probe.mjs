import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const {CFB}=createRequire(new URL('../../backend/package.json',import.meta.url))('xlsx');
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN',page;
try{
 page=await browser.newPage();page.setDefaultTimeout(25000);
 await page.goto('http://localhost:3300/');await page.locator('#login-account').fill(state.accounts.admin.email);
 await page.locator('#login-password').fill(state.accounts.admin.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('button',{name:'审计日志',exact:true}).click();await page.getByRole('button',{name:'下载运行日志 ZIP',exact:true}).waitFor();
 stage='DATES_REQUIRED';await page.getByRole('button',{name:'下载运行日志 ZIP',exact:true}).click();await page.getByText('请先选择开始日期和结束日期。',{exact:true}).waitFor();
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 await page.getByLabel('开始日期',{exact:true}).fill(date);await page.getByLabel('结束日期',{exact:true}).fill(date);
 let first,firstKey,retryKey,createdCount=0,finalJob;
 page.on('response',async r=>{if(/^\/api\/v1\/admin\/runtime-archives\/[0-9a-f-]+$/.test(new URL(r.url()).pathname)&&r.ok()){
  const body=await r.json().catch(()=>null);if(body?.data?.status==='SUCCEEDED')finalJob=body.data;
 }});
 await page.route('**/api/v1/admin/runtime-archives',async route=>{
  if(route.request().method()!=='POST')return route.continue();createdCount++;
  const response=await route.fetch();assert.equal(response.status(),202);
  const data=(await response.json()).data;
  if(!first){first=data;firstKey=route.request().headers()['idempotency-key'];await route.abort('failed');}
  else{retryKey=route.request().headers()['idempotency-key'];assert.equal(data.id,first.id);await route.fulfill({response});}
 });
 stage='LOST_CREATE_RESPONSE';await page.getByRole('button',{name:'下载运行日志 ZIP',exact:true}).click();
 await page.getByText('本次下载未完成，请重试检查原请求。',{exact:true}).waitFor();assert.ok(first);
 if(process.env.ARCHIVE_RELOAD==='1'){
  await page.reload();await page.getByRole('button',{name:'审计日志',exact:true}).click();
  await page.getByRole('button',{name:'下载运行日志 ZIP',exact:true}).waitFor();
  assert.equal(await page.getByLabel('开始日期',{exact:true}).inputValue(),'');
 }
 if(process.env.ARCHIVE_DOWNLOAD_RELOAD==='1'){
  stage='LOST_CONTENT_RESPONSE';let dropped=false;
  await page.route('**/api/v1/admin/runtime-archives/*/content?*',async route=>{
   if(dropped)return route.continue();dropped=true;
   const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed');
  });
  await page.getByRole('button',{name:'下载运行日志 ZIP',exact:true}).click();
  await page.getByText('本次下载未完成，请重试检查原请求。',{exact:true}).waitFor();assert.ok(dropped);
  await page.reload();await page.getByRole('button',{name:'审计日志',exact:true}).click();
  await page.getByRole('button',{name:'下载运行日志 ZIP',exact:true}).waitFor();
 }
 stage='REPLAY_AND_DOWNLOAD';const downloadPromise=page.waitForEvent('download',{timeout:30000});
 await page.getByRole('button',{name:'下载运行日志 ZIP',exact:true}).click();
 const download=await downloadPromise;assert.equal(await download.failure(),null);
 const path='.local/v81-browser-state/runtime-archive-browser.zip';await download.saveAs(path);
 assert.equal(firstKey,retryKey);assert.equal(createdCount,process.env.ARCHIVE_DOWNLOAD_RELOAD==='1'?3:2);assert.ok(finalJob);
 const bytes=fs.readFileSync(path);assert.equal(bytes.length,finalJob.byteLength);assert.equal(createHash('sha256').update(bytes).digest('hex'),finalJob.sha256);
 const zip=CFB.read(bytes,{type:'buffer'}),entry=CFB.find(zip,'manifest.json');assert.ok(entry);
 const manifest=JSON.parse(Buffer.from(entry.content).toString('utf8'));assert.equal(manifest.archiveId,first.id);
 await page.getByText(/压缩包已校验并下载/).waitFor();
 assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('bnbu-runtime-archive-pending-v1:')).length),0);
 await page.screenshot({path:'.local/v81-browser-state/runtime-archive-browser.png',fullPage:true});
 console.log(JSON.stringify({check:'RUNTIME_ARCHIVE_BROWSER_REAL_WORKER_SAME_KEY_AUTHENTICATED_ZIP_HASH',result:'PASS',reload:process.env.ARCHIVE_RELOAD==='1',downloadReload:process.env.ARCHIVE_DOWNLOAD_RELOAD==='1',bytes:bytes.length,coverage:finalJob.coverage}));
}catch(error){console.log(JSON.stringify({stage,error:error.message}));if(page)await page.screenshot({path:'.local/v81-browser-state/runtime-archive-browser-failure.png',fullPage:true});process.exitCode=1;}
finally{await browser.close();}
