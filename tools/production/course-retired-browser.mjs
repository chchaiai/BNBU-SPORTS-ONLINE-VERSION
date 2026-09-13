import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const cloud=process.argv.includes('--cloud');
const f=JSON.parse(fs.readFileSync(cloud?'.local/bug-20260912-cloud-private.json':'.local/v81-browser-state/demand-fixture.json'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(45000);
 await page.goto(cloud?'https://www.teacher.bnbusports.cn/':'http://127.0.0.1:4275/');
 await page.locator('#login-account').fill(cloud?f.teacher.email:f.teacherEmail);await page.locator('#login-password').fill(cloud?f.teacher.password:f.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('button',{name:'通知',exact:true}).waitFor();
 if(!cloud){
  await page.locator('article.teacher-course-card').filter({hasText:'Synthetic Active Course 1'}).getByRole('button',{name:'进入课程'}).click();
  const section=page.locator('section[aria-label="删除课程"]');await section.getByRole('button',{name:'删除课程',exact:true}).click();
  await section.locator('#course-delete-name').fill('Synthetic Teacher A Active Section');await section.locator('#course-delete-reason').fill('Synthetic regression: retired course history must not break teacher workspace');await section.locator('input[type=checkbox]').check();
  const response=page.waitForResponse(r=>r.url().endsWith('/delete')&&r.request().method()==='POST');await section.getByRole('button',{name:'确认删除课程',exact:true}).click();assert.equal((await response).status(),201);
 }
 for(let i=0;i<2;i++){
  await page.reload();await page.getByRole('button',{name:'通知',exact:true}).waitFor();await page.waitForTimeout(3000);
  const body=await page.locator('body').innerText();
  if(process.argv.includes('--expect-bug')){assert.match(body,/无法关联学生身份资料/);console.log('RETIRED_COURSE_REFRESH_REPRODUCED');break;}
  assert.doesNotMatch(body,/无法关联学生身份资料|停止展示不完整数据|服务器内部错误/);
  assert.ok(await page.getByRole('button',{name:'新建课程',exact:false}).isVisible());
 }
 await page.screenshot({path:'.local/course-retired-'+(cloud?'cloud':'local')+'.png'});
 console.log(JSON.stringify({check:cloud?'CLOUD_RETIRED_COURSE_REFRESH':'LOCAL_DELETE_THEN_REFRESH',result:'PASS'}));
}finally{await browser.close();}
