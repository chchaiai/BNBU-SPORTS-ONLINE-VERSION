import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
const api=async(path,token,body)=>{const r=await fetch('http://127.0.0.1:3199/api/v1'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`} : {}),'idempotency-key':randomUUID()},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,`${path}: ${r.status}`);return (await r.json()).data;};
const login=await api('/auth/password-login',null,{account:state.accounts.admin.email,password:state.accounts.admin.password});
const before=await api('/system-mode',login.accessToken);assert.equal(before.mode,'NORMAL');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN';
try{
 const page=await browser.newPage();page.setDefaultTimeout(15000);
 await page.goto('http://localhost:3300/');await page.locator('#login-account').fill(state.accounts.admin.email);await page.locator('#login-password').fill(state.accounts.admin.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('button',{name:'系统模式',exact:true}).click();stage='MAINTENANCE';
 await page.locator('.admin-mode-options').getByRole('listitem').filter({hasText:'维护模式'}).click();
 const dialog=page.getByRole('dialog');await dialog.locator('textarea').nth(0).fill('Synthetic browser maintenance check');
 const recovery=new Date(Date.now()+3600000);recovery.setMinutes(recovery.getMinutes()-recovery.getTimezoneOffset());
 await dialog.locator('input[type="datetime-local"]').fill(recovery.toISOString().slice(0,16));
 let lose=true;const keys=[];
 await page.route('**/api/v1/system-mode/changes',async route=>{keys.push(route.request().headers()['idempotency-key']);const response=await route.fetch();if(lose&&response.ok()){lose=false;return route.abort('failed');}await route.fulfill({response});});
 await dialog.getByRole('button',{name:'确认切换',exact:true}).click();await page.getByRole('alert').waitFor();
 assert.equal(await dialog.locator('textarea').nth(0).isDisabled(),true);assert.equal(await dialog.getByRole('button',{name:'取消',exact:true}).isDisabled(),true);
 stage='RETRY';await dialog.getByRole('button',{name:'确认切换',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert.equal(keys.length,2);assert.ok(keys[0]);assert.equal(keys[0],keys[1]);
 const active=await api('/system-mode',login.accessToken);assert.equal(active.mode,'MAINTENANCE');assert.equal(active.policyVersion,before.policyVersion+1);
 const notice=await api('/system-mode/announcement',null);assert.equal(notice.announcement.titleZh,'系统维护通知');assert.equal(notice.announcement.titleEn,'System maintenance notice');
 console.log(JSON.stringify({check:'ADMIN_MAINTENANCE_BROWSER_LOST_RESPONSE_SAME_KEY_NOTICE',result:'PASS'}));
 await page.reload();await page.getByRole('button',{name:'系统模式',exact:true}).click();
 await page.getByRole('heading',{name:'维护模式',exact:true}).waitFor();
 stage='RESTORE';await page.locator('.admin-mode-options').getByRole('listitem').filter({hasText:'正常模式'}).click();await dialog.locator('textarea').fill('Synthetic browser restore');await dialog.getByRole('button',{name:'确认切换',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert.equal((await api('/system-mode',login.accessToken)).mode,'NORMAL');
 await page.reload();await page.getByRole('button',{name:'系统模式',exact:true}).click();await page.getByRole('heading',{name:'正常模式',exact:true}).waitFor();
 await page.screenshot({path:'.local/v81-browser-state/system-mode-current.png',fullPage:true,animations:'disabled'});
 console.log(JSON.stringify({check:'ADMIN_SYSTEM_MODE_BROWSER_RELOAD_RESTORE_RELOAD',result:'PASS'}));
}catch(error){console.log(JSON.stringify({stage,error:error.message}));process.exitCode=1;}
finally{
 try{
  const history=await api('/system-mode/history',login.accessToken), latest=history[0];
  if(latest?.facts?.to==='MAINTENANCE'){
   await api('/system-mode/changes',login.accessToken,{mode:'NORMAL',reason:'Synthetic browser probe cleanup',expectedVersion:latest.version});
   console.log(JSON.stringify({check:'RESTORE_NORMAL_CLEANUP',result:'PASS'}));
  }
 }finally{await browser.close();}
}
