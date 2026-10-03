import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[];
try {
 for(const url of ['https://www.teacher.bnbusports.cn/','https://www.student.bnbusports.cn/student/']) {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(url,{waitUntil:'networkidle'});assert.equal(response.status(),200);
  assert.ok((await page.locator('body').innerText()).length>30);assert.deepEqual(errors,[]);
  results.push({url,status:response.status(),pageErrors:errors});await page.close();
 }
 await writeFile('evidence/dual-class-20260922/public-browser.json',JSON.stringify({result:'PASS',browser:'Edge',authenticated:false,results},null,2));
 console.log('PASS production public pages in Edge');
}finally{await browser.close()}
