import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const fixture=JSON.parse(fs.readFileSync('.local/exercise-limits-20260912-private.json'));
const output='.local/exercise-limits-cloud-portal';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}});page.setDefaultTimeout(30000);
 page.on('pageerror',error=>console.log(JSON.stringify({browserError:error.message})));
 await page.goto('https://www.teacher.bnbusports.cn/');await page.locator('#login-account').fill(fixture.admin.email);await page.locator('#login-password').fill(fixture.teacher.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('button',{name:'全局规则',exact:true}).click();
 const form=page.locator('[data-admin-form="exercise-goal"]');await form.getByRole('button',{name:'保存所有课程总目标',exact:true}).waitFor();
 const input=form.locator('input[type=number]');const target=await input.inputValue()==='1800'?'1200':'1800';
 await input.fill(target);const response=page.waitForResponse(r=>r.url().endsWith('/admin/exercise-goal')&&r.request().method()==='POST');
 await form.getByRole('button',{name:'保存所有课程总目标',exact:true}).click();assert.equal((await response).status(),201);
 await form.screenshot({path:output+'/admin-target-saved.png'});
 console.log(JSON.stringify({check:'SUPER_ADMIN_GLOBAL_TARGET_BROWSER',result:'PASS',targetMinutes:Number(target)}));
 const teacher=await browser.newPage({viewport:{width:1440,height:1050}});teacher.setDefaultTimeout(30000);
 await teacher.goto('https://www.teacher.bnbusports.cn/');await teacher.locator('#login-account').fill(fixture.teacher.email);await teacher.locator('#login-password').fill(fixture.teacher.password);await teacher.getByRole('button',{name:'登录',exact:true}).click();
 await teacher.locator('article.teacher-course-card').filter({hasText:'Synthetic Active Course 1'}).getByRole('button',{name:'进入课程'}).click();
 const maximum=teacher.locator('#course-maximum-minutes');await maximum.waitFor();
 await maximum.fill('1');await teacher.locator('#course-target-course-hours').fill('10');await teacher.locator('#course-target-other-hours').fill(String(Number(target)/60-10));
 await maximum.scrollIntoViewIfNeeded();await teacher.screenshot({path:output+'/teacher-reallocate.png'});
 const saved=teacher.waitForResponse(r=>r.url().includes('/v81-rules')&&r.request().method()==='POST');
 await teacher.getByRole('button',{name:'保存设置',exact:true}).click();const result=await saved;assert.equal(result.status(),201);
 const rules=(await result.json()).data;assert.equal(rules.maximumMinutes,1);assert.equal(rules.courseTarget+rules.generalTarget,Number(target));
 console.log(JSON.stringify({check:'TEACHER_REALLOCATION_AND_SINGLE_LIMIT_BROWSER',result:'PASS'}));
}finally{await browser.close();}
