import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const account=JSON.parse(fs.readFileSync('.local/exercise-limits-20260912-private.json')).teacher;
const fixture=JSON.parse(fs.readFileSync('.local/course-settings-cloud-probe.json'));
assert.match(account.email,/synthetic/i);assert.match(fixture.courseName,/^Synthetic Course Settings 20260915 /);
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(30000);
 await page.goto('https://www.teacher.bnbusports.cn/');await page.locator('#login-account').fill(account.email);await page.locator('#login-password').fill(account.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 const card=page.locator(`[data-class-section-id="${fixture.sectionId}"]`),open=async()=>{await card.getByRole('button',{name:/进入课程/}).click();await page.getByText(/已发布：门槛/).waitFor();};await open();
 const dialog=page.getByRole('dialog'),window=dialog.locator('section').filter({has:page.locator('#course-window-config-title')}),times=window.locator('input[type=time]');
 for(const field of await window.locator('input[type=date]').all())assert.equal(await field.isDisabled(),true);
 const start=(await times.nth(0).inputValue())==='08:25'?'08:30':'08:25';await times.nth(0).fill(start);await times.nth(1).fill('20:35');
 const patch=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith('/class-sections/'+fixture.sectionId));
 await page.getByRole('button',{name:'保存设置',exact:true}).click();assert.equal((await patch).status(),200);await dialog.waitFor({state:'hidden'});
 await page.reload();await open();assert.equal(await times.nth(0).inputValue(),start);assert.equal(await times.nth(1).inputValue(),'20:35');
 const max=page.locator('#course-maximum-minutes'),maximum=String(Number(await max.inputValue())+1);await max.fill(maximum);await page.getByRole('button',{name:'保存设置',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.reload();await open();assert.equal(await max.inputValue(),maximum);
 await window.screenshot({path:'evidence/course-settings-20260915/cloud-window-saved.png'});
 const result={result:'PASS',sectionId:fixture.sectionId,checks:['production save button','rule-only save with unchanged window','reload persists daily start and end','published calendar controls disabled']};fs.writeFileSync('evidence/course-settings-20260915/cloud-browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
