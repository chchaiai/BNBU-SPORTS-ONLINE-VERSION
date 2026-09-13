import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const fixture=JSON.parse(fs.readFileSync('.local/v81-browser-state/demand-fixture.json','utf8'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1280,height:950}});
 await page.goto('http://127.0.0.1:4275/');await page.locator('#login-account').fill(fixture.teacherEmail);await page.locator('#login-password').fill(fixture.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('button',{name:'通知',exact:true}).waitFor();
 await page.getByRole('button',{name:'＋ 新建课程',exact:true}).click();
 const name='Synthetic Unconfigured '+Date.now();await page.getByPlaceholder('如 大学体育（一）').fill(name);await page.getByRole('button',{name:'创建课程',exact:true}).click();
 const card=page.locator('article.teacher-course-card').filter({hasText:name});await card.getByRole('button',{name:'邀请二维码',exact:true}).click();
 await page.getByText('请点击“进入课程”，设置课程相关信息并保存发布后，再生成邀请二维码。',{exact:true}).waitFor();
 assert.equal(await page.getByRole('dialog').count(),0);
 await page.screenshot({path:'docs/implementation/evidence/demand-followup-20260912/teacher-unconfigured-invite.png'});
 await card.getByRole('button',{name:/学生名单/}).click();await page.getByRole('dialog').getByText('本课程暂无学生').waitFor();
 console.log(JSON.stringify({check:'UNCONFIGURED_COURSE_INVITE_GUIDANCE_AND_EMPTY_STUDENT_LIST',result:'PASS'}));
} finally {await browser.close();}
