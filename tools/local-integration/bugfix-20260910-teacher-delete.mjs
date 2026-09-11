import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync('.local/v81-browser-state/state.json'));
let token;
async function api(path,body){const response=await fetch('http://127.0.0.1:3199/api/v1'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID(),...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.ok(response.ok,`${path}: ${response.status}`);return (await response.json()).data;}
token=(await api('/auth/password-login',{account:state.accounts.admin.email,password:state.accounts.admin.password})).accessToken;
const employee='DEL'+crypto.randomUUID().replaceAll('-','').slice(0,15);
const csv=`employee_id,name,email,college\n${employee},Synthetic Deletion Browser,${employee.toLowerCase()}@bnbu.invalid,Synthetic`;
const preview=await api('/admin/teacher-imports/preview',{csv});assert.equal(preview.canCreate,true);
const created=await api('/admin/teacher-imports/confirm',{csv,previewToken:preview.previewToken,initialPassword:'Synthetic7!'+crypto.randomUUID()});assert.equal(created.createdCount,1);
const id=created.accounts[0].teacherProfileId;
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1024,height:720}});page.setDefaultTimeout(60000);
try{
 await page.goto('http://localhost:3300/');await page.locator('#login-account').fill(state.accounts.admin.email);await page.locator('#login-password').fill(state.accounts.admin.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('button',{name:'用户与账号',exact:true}).click();await page.getByRole('button',{name:/教师账户/}).click();
 const row=page.getByRole('row').filter({hasText:employee});await row.getByRole('button',{name:/管理账号/}).click();await page.getByRole('button',{name:'删除教师账号',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'删除教师账号'});await dialog.locator('textarea').fill('Synthetic isolated browser deletion regression');await dialog.locator('input').fill(employee);
 const keys=[];let drop=true;
 await page.route(`**/api/v1/admin/teachers/${id}/delete`,async route=>{keys.push(route.request().headers()['idempotency-key']);const response=await route.fetch();if(drop&&response.status()===201){drop=false;return route.abort('failed');}await route.fulfill({response});});
 await dialog.getByRole('button',{name:'确认删除账号',exact:true}).click();await dialog.getByRole('status').waitFor();
 assert.equal(await dialog.locator('textarea').isDisabled(),true);await dialog.screenshot({path:'.local/bugfix-evidence/teacher-delete-retry.png'});
 await dialog.getByRole('button',{name:'确认删除账号',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
 await page.reload();await page.getByRole('button',{name:'用户与账号',exact:true}).click();await page.getByRole('button',{name:/教师账户/}).click();await page.getByRole('button',{name:'批量建立教师',exact:true}).waitFor();
 assert.equal(await page.getByRole('row').filter({hasText:employee}).count(),0);
 const directory=await api('/admin/teacher-accounts');assert.ok(!directory.items.some(item=>item.id===id));
 console.log(JSON.stringify({check:'TEACHER_DELETE_REAL_BROWSER_LOST_RESPONSE_REPLAY_RELOAD',result:'PASS',teacherProfileId:id}));
}catch(error){await page.screenshot({path:'.local/bugfix-evidence/teacher-delete-failure.png',fullPage:true});throw error;}finally{await browser.close();}
