import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync(process.env.BUG15_FIXTURE || '.local/v81-browser-state/bug15-teacher.json','utf8'));
const evidence=process.env.BUG15_EVIDENCE || 'evidence/bug-20260915';fs.mkdirSync(evidence,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
 const page=await browser.newPage();page.setDefaultTimeout(20000);
 await page.goto(process.env.TEACHER_ORIGIN || 'http://localhost:3300/');await page.locator('#login-account').fill(state.accounts.teacher.email);await page.locator('#login-password').fill(state.accounts.teacher.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('button',{name:'课程管理',exact:true}).click();
 const card=page.locator(`[data-class-section-id="${state.fixture.teacherAActiveSectionId}"]`);
 await card.getByRole('button',{name:/进入课程/}).click();
 const settings=page.getByRole('dialog',{name:'课程设置'});await settings.waitFor();
 const deadline=settings.getByLabel('常规提交截止日期',{exact:false});
 const maximum=await deadline.getAttribute('max');assert.ok(maximum);
 await settings.getByRole('textbox',{name:/^打卡结束日期/}).fill('2099-01-01');
 await settings.getByText(/当前打卡结束日期晚于允许的最晚截止日期/).waitFor();
 assert.equal(await deadline.isDisabled(),true);assert.equal(await deadline.getAttribute('min'),null);
 await settings.screenshot({path:evidence+'/teacher-deadline.png'});
 await settings.getByRole('button',{name:'取消',exact:true}).click();
 await card.getByRole('button',{name:'邀请二维码',exact:true}).click();
 const revoke=page.getByRole('button',{name:'撤销邀请码',exact:true});
 if(await revoke.isVisible()){await revoke.click();await page.getByRole('button',{name:'确认撤销',exact:true}).click();}
 await page.getByLabel('邀请有效期（天）',{exact:false}).fill('1');await page.getByLabel('邀请有效期（小时）',{exact:false}).fill('2');await page.getByLabel('邀请有效期（分钟）',{exact:false}).fill('3');
 await page.screenshot({path:evidence+'/teacher-invite.png',fullPage:true});
 const response=page.waitForResponse(r=>r.url().includes('/course-invites')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'生成新邀请码',exact:true}).click();const result=await response;
 assert.equal(result.request().postDataJSON().expiresInMinutes,1563);assert.equal(result.status(),201);
 console.log(JSON.stringify({check:'TEACHER_REAL_HTTP_DEADLINE_AND_COMBINED_INVITE',result:'PASS',minutes:1563,regularDeadlineMaximum:maximum}));
}catch(error){console.error(error);process.exitCode=1;}finally{await browser.close();}
