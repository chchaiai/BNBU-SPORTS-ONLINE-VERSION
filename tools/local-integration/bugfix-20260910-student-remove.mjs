import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync('.local/v81-browser-state/state.json'));
const joined=JSON.parse(fs.readFileSync('.local/v81-browser-state/new-student-join.json'));
const id=joined.membership.enrollment.id;
const login=await fetch('http://127.0.0.1:3199/api/v1/auth/password-login',{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({account:state.accounts.teacher.email,password:state.accounts.teacher.password})});
assert.equal(login.status,200);const token=(await login.json()).data.accessToken;
const read=async path=>{const response=await fetch('http://127.0.0.1:3199/api/v1'+path,{headers:{authorization:`Bearer ${token}`}});assert.equal(response.status,200);return (await response.json()).data;};
let before=await read(`/enrollments/${id}`);
if(before.status==='REMOVED'){
 const response=await fetch(`http://127.0.0.1:3199/api/v1/enrollments/${id}/restore`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({expectedVersion:before.version,reason:'Restore this isolated fixture after an interrupted browser probe'})});assert.equal(response.status,200);before=await read(`/enrollments/${id}`);
}
assert.equal(before.status,'ACTIVE');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage();page.setDefaultTimeout(60000);
try{
 await page.goto('http://localhost:3300/');await page.locator('#login-account').fill(state.accounts.teacher.email);await page.locator('#login-password').fill(state.accounts.teacher.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('button',{name:'学生管理',exact:true}).click();await page.getByRole('searchbox',{name:'搜索姓名、学号或邮箱'}).fill(joined.studentNumber);
 const row=page.getByRole('row').filter({hasText:joined.studentNumber});await row.getByRole('button',{name:'移出课程',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'移出课程'});await dialog.locator('textarea').fill('Synthetic browser enrollment removal regression');await dialog.getByRole('button',{name:'确认移出课程',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const removed=await read(`/enrollments/${id}`);assert.equal(removed.status,'REMOVED');assert.equal(removed.studentId,before.studentId);assert.equal(removed.version,before.version+1);
 await page.screenshot({path:'.local/bugfix-evidence/student-enrollment-removed.png',fullPage:true});
 // Restore only this isolated test membership after confirming removal, keeping the event history.
 const restored=await fetch(`http://127.0.0.1:3199/api/v1/enrollments/${id}/restore`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({expectedVersion:removed.version,reason:'Restore isolated browser fixture after removal regression'})});assert.equal(restored.status,200);
 assert.equal((await read(`/enrollments/${id}`)).status,'ACTIVE');
 assert.ok(await read(`/students/${before.studentId}`));
 console.log(JSON.stringify({check:'TEACHER_BROWSER_REMOVE_OWN_MEMBERSHIP_RETAIN_STUDENT_AND_RESTORE',result:'PASS',enrollmentId:id}));
}catch(error){await page.screenshot({path:'.local/bugfix-evidence/student-remove-failure.png',fullPage:true});throw error;}finally{await browser.close();}
