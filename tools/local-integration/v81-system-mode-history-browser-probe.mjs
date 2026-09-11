import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN';
try{
 const page=await browser.newPage();page.setDefaultTimeout(20000);
 await page.goto('http://localhost:3300/');await page.getByLabel('学校邮箱').fill(state.accounts.admin.email);await page.locator('#login-password').fill(state.accounts.admin.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 const responses=[];page.on('response',response=>{if(new URL(response.url()).pathname==='/api/v1/system-mode/history')responses.push(response);});
 await page.getByRole('button',{name:'系统模式',exact:true}).click();stage='HISTORY';
 const section=page.locator('.admin-system-change-history');await section.getByRole('heading',{name:'系统模式全部变更记录',exact:true}).waitFor();
 const data=[];for(const response of responses){assert.equal(response.status(),200);data.push(...(await response.json()).data);}
 assert.ok(data.length>0);assert.equal(await section.locator('li').count(),data.length);
 for(let index=0;index<data.length;index++){
  const entry=data[index],row=section.locator('li').nth(index);
  await row.getByText(entry.facts.reason,{exact:true}).waitFor();await row.getByText(entry.actor_id,{exact:true}).waitFor();
  assert.equal(await row.locator('dl dd').nth(2).innerText(),entry.facts.announcementPublished?'已发布':'未发布');
  assert.ok((await row.locator('dl dd').nth(1).innerText()).includes(String(new Date(entry.occurred_at).getFullYear())));
 }
 assert.equal(await section.locator('button,input,textarea').count(),0);
 const before=data.map(row=>row.id);responses.length=0;
 await page.reload();await page.getByRole('button',{name:'系统模式',exact:true}).click();await section.getByRole('heading',{name:'系统模式全部变更记录',exact:true}).waitFor();
 const after=[];for(const response of responses)after.push(...(await response.json()).data);
 assert.deepEqual(after.map(row=>row.id),before);
 await page.screenshot({path:'.local/v81-browser-state/mode-history-current.png',fullPage:true,animations:'disabled'});
 console.log(JSON.stringify({check:'SYSTEM_MODE_HISTORY_REAL_HTTP_ACTOR_REASON_TIME_ANNOUNCEMENT_READ_ONLY_REFRESH',result:'PASS',rows:data.length,syntheticHistory:true}));
}catch(error){console.log(JSON.stringify({stage,error:error.message}));process.exitCode=1;}
finally{await browser.close();}
