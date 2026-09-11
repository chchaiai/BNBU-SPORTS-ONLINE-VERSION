import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN',page;const responses=[];
try{
 page=await browser.newPage();page.setDefaultTimeout(15000);
 page.on('response',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/api/v1/'))responses.push({path,status:r.status()});});
 await page.goto('http://localhost:3300/');await page.locator('#login-account').fill(state.accounts.admin.email);
 await page.locator('#login-password').fill(state.accounts.admin.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('button',{name:'用户与账号',exact:true}).click();
 await page.getByRole('button',{name:/教师账户/}).click();await page.getByRole('button',{name:'批量建立教师',exact:true}).click();
 stage='PREVIEW';const dialog=page.getByRole('dialog');
 const suffix=crypto.randomUUID().slice(0,8),password=`Initial7!${crypto.randomUUID()}`;
 const accounts=[{employeeId:`TB${suffix}1`,name:'Synthetic Browser Teacher A',email:`teacher-${suffix}@custom-one.invalid`},{employeeId:`TB${suffix}2`,name:'Synthetic Browser Teacher B',email:`teacher-${suffix}@custom-two.invalid`}];
 const csv='employee_id,name,email,college\n'+accounts.map(a=>`${a.employeeId},${a.name},${a.email},Synthetic`).join('\n');
 await dialog.locator('input[autocomplete="new-password"]').fill(password);await dialog.locator('textarea').fill(csv);
 const previewed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/admin/teacher-imports/preview');
 await dialog.getByRole('button',{name:'校验导入内容',exact:true}).click();const preview=await previewed;assert.equal(preview.status(),201);assert.equal((await preview.json()).data.canCreate,true);
 stage='CONFIRM';const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/admin/teacher-imports/confirm');
 await dialog.getByRole('button',{name:'确认建立 2 个账号',exact:true}).click();const response=await created;assert.equal(response.status(),201);assert.equal((await response.json()).data.createdCount,2);
 fs.writeFileSync(new URL('../../.local/v81-browser-state/teacher-import-current.json',import.meta.url),JSON.stringify({accounts,password}));
 await dialog.waitFor({state:'hidden'});for(const a of accounts)await page.getByText(a.employeeId,{exact:true}).waitFor();
 await page.reload();await page.getByRole('button',{name:'用户与账号',exact:true}).click();await page.getByRole('button',{name:/教师账户/}).click();for(const a of accounts)await page.getByText(a.employeeId,{exact:true}).waitFor();
 console.log(JSON.stringify({check:'TEACHER_BATCH_CREATE_BROWSER',result:'PASS',createdCount:2}));
 stage='FIRST_LOGIN_GATE';const teacher=await browser.newPage();
 await teacher.goto('http://localhost:3300/');await teacher.locator('#login-account').fill(accounts[0].email);await teacher.locator('#login-password').fill(password);
 await teacher.getByRole('button',{name:'登录',exact:true}).click();
 await teacher.getByRole('heading',{name:'首次登录设置密码',exact:true}).waitFor();
 console.log(JSON.stringify({check:'TEACHER_FIRST_LOGIN_PASSWORD_GATE_BROWSER',result:'PASS'}));
}catch(error){console.error(JSON.stringify({check:'TEACHER_BATCH_BROWSER',result:'FAIL',stage,type:error.name,message:error.message.slice(0,350),failedRequests:responses.filter(r=>r.status>=400)}));process.exitCode=1;}
finally{await browser.close();}