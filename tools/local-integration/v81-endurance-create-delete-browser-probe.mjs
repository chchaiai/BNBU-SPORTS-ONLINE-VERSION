import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync('.local/v81-browser-state/state.json'));
const base='http://127.0.0.1:3199/api/v1',marker='Synthetic added band '+randomUUID();
async function authenticated(){
 const r=await fetch(base+'/auth/password-login',{method:'POST',headers:{'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({account:state.accounts.admin.email,password:state.accounts.admin.password})});
 assert.ok(r.ok);return (await r.json()).data.accessToken;
}
async function tables(token){const r=await fetch(base+'/admin/endurance-tables',{headers:{authorization:`Bearer ${token}`}});assert.ok(r.ok);return (await r.json()).data;}
const token=await authenticated(),before=await tables(token);
const original=before.find(t=>t.gender==='male'&&t.gradeGroup==='freshman_sophomore');assert.ok(original);
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN';
try{
 const page=await browser.newPage();page.setDefaultTimeout(25000);
 await page.goto('http://localhost:3300/');await page.getByLabel('学校邮箱').fill(state.accounts.admin.email);
 await page.locator('#login-password').fill(state.accounts.admin.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('button',{name:'全局规则',exact:true}).click();
 stage='CREATE';await page.getByRole('button',{name:'添加规则',exact:true}).click();
 await page.getByRole('dialog').locator('textarea').fill(marker);
 const createdPromise=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/admin/endurance-tables/rules'&&r.request().method()==='POST');
 await page.getByRole('button',{name:'保存',exact:true}).click();const created=await createdPromise;assert.equal(created.status(),201);
 await page.getByRole('dialog').waitFor({state:'hidden'});await page.locator('tbody tr').filter({hasText:marker}).waitFor();
 stage='RELOAD';await page.reload();await page.getByRole('button',{name:'全局规则',exact:true}).click();await page.locator('tbody tr').filter({hasText:marker}).waitFor();
 stage='REJECT_GAP';await page.locator('tbody tr').nth(1).getByRole('button',{name:'删除',exact:true}).click();
 const rejectedPromise=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/delete')&&r.request().method()==='POST');
 await page.getByRole('dialog').getByRole('button',{name:'删除',exact:true}).click();assert.equal((await rejectedPromise).status(),422);
 await page.locator('.user-facing-error').waitFor();
 const afterRejected=(await tables(token)).find(t=>t.id===original.id);assert.equal(afterRejected.version,original.version+1);assert.equal(afterRejected.bands.length,original.bands.length+1);
 await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();
 stage='DELETE_ADDED';await page.locator('tbody tr').filter({hasText:marker}).getByRole('button',{name:'删除',exact:true}).click();
 const deletedPromise=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/delete')&&r.request().method()==='POST');
 await page.getByRole('dialog').getByRole('button',{name:'删除',exact:true}).click();assert.equal((await deletedPromise).status(),201);
 await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.reload();await page.getByRole('button',{name:'全局规则',exact:true}).click();await page.locator('tbody tr').first().waitFor();
 assert.equal(await page.locator('tbody tr').filter({hasText:marker}).count(),0);
 const final=(await tables(token)).find(t=>t.id===original.id);assert.deepEqual(final.bands,original.bands);assert.equal(final.version,original.version+2);
 console.log(JSON.stringify({check:'ENDURANCE_BROWSER_CREATE_RELOAD_REJECT_GAP_DELETE_RELOAD',result:'PASS',originalBands:original.bands.length,finalBands:final.bands.length}));
}catch(error){console.log(JSON.stringify({stage,error:error.message}));process.exitCode=1;}
finally{
 const access=await authenticated(),current=(await tables(access)).find(t=>t.id===original.id),added=current.bands.find(b=>b.note===marker);
 if(added){const r=await fetch(base+'/admin/endurance-tables/rules/'+added.id+'/delete',{method:'POST',headers:{authorization:`Bearer ${access}`,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({gender:current.gender,gradeGroup:current.gradeGroup,runType:current.runType,expectedVersion:current.version})});assert.ok(r.ok);console.log('REMOVED_OWN_SYNTHETIC_BAND');}
 await browser.close();
}
