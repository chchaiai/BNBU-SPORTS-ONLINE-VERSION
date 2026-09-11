import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync('.local/v81-browser-state/state.json'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let page,stage='LOGIN',original,changed=false,ruleId;
const marker='Synthetic browser note '+randomUUID();
try{
 page=await browser.newPage();page.setDefaultTimeout(25000);
 await page.goto('http://localhost:3300/');await page.getByLabel('学校邮箱').fill(state.accounts.admin.email);
 await page.locator('#login-password').fill(state.accounts.admin.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('button',{name:'全局规则',exact:true}).click();
 const row=page.locator('tbody tr').first();await row.getByRole('button',{name:'编辑',exact:true}).click();
 original=await page.getByRole('dialog').locator('textarea').inputValue();
 let firstKey,retryKey,firstVersion,retryVersion,count=0;
 await page.route('**/api/v1/admin/endurance-tables/rules/*',async route=>{
  if(route.request().method()!=='POST')return route.continue();
  const body=route.request().postDataJSON();if(body.note!==marker)return route.continue();
  count++;const response=await route.fetch();assert.equal(response.status(),201);
  const table=(await response.json()).data;
  ruleId=new URL(route.request().url()).pathname.split('/').at(-1);changed=true;
  if(count===1){firstKey=route.request().headers()['idempotency-key'];firstVersion=table.version;await route.abort('failed');}
  else{retryKey=route.request().headers()['idempotency-key'];retryVersion=table.version;await route.fulfill({response});}
 });
 stage='SAVE_RESPONSE_LOST';await page.getByRole('dialog').locator('textarea').fill(marker);
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.getByRole('button',{name:'保存',exact:true}).waitFor({state:'visible'});
 await page.getByRole('dialog').getByRole('alert').waitFor();
 assert.equal(count,1);
 stage='RETRY';await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByText(marker,{exact:true}).waitFor();assert.equal(count,2);assert.equal(firstKey,retryKey);assert.equal(firstVersion,retryVersion);
 stage='RELOAD';await page.reload();await page.getByRole('button',{name:'全局规则',exact:true}).click();await page.getByText(marker,{exact:true}).waitFor();
 stage='RESTORE';await page.locator('tbody tr').filter({hasText:marker}).getByRole('button',{name:'编辑',exact:true}).click();
 await page.getByRole('dialog').locator('textarea').fill(original);await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByText(marker,{exact:true}).waitFor({state:'hidden'});changed=false;
 console.log(JSON.stringify({check:'ENDURANCE_REAL_BROWSER_SAVE_LOST_RESPONSE_SAME_KEY_RELOAD_RESTORE',result:'PASS',version:firstVersion}));
}catch(error){console.log(JSON.stringify({stage,error:error.message}));process.exitCode=1;}
finally{
 if(changed&&ruleId&&original!==undefined){
  const login=await fetch('http://127.0.0.1:3199/api/v1/auth/password-login',{method:'POST',headers:{'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({account:state.accounts.admin.email,password:state.accounts.admin.password})});
  const token=(await login.json()).data?.accessToken;assert.ok(token);
  const headers={authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':randomUUID()};
  const tables=(await (await fetch('http://127.0.0.1:3199/api/v1/admin/endurance-tables',{headers})).json()).data;
  const table=tables.find(t=>t.bands.some(b=>b.id===ruleId)),band=table.bands.find(b=>b.id===ruleId);
  if(band.note===marker){const {id,...fields}=band;const r=await fetch('http://127.0.0.1:3199/api/v1/admin/endurance-tables/rules/'+ruleId,{method:'POST',headers,body:JSON.stringify({...fields,note:original,gender:table.gender,gradeGroup:table.gradeGroup,runType:table.runType,expectedVersion:table.version})});assert.ok(r.ok);console.log('RESTORED_SYNTHETIC_NOTE');}
 }
 await browser.close();
}
