import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync('.local/v81-browser-state/state.json','utf8'));
assert.equal(state.database,'v81_browser_test');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
 const page=await browser.newPage();page.setDefaultTimeout(30000);
 await page.goto('http://localhost:3300/');
 await page.locator('#login-account').fill(state.accounts.admin.email);
 await page.locator('#login-password').fill(state.accounts.admin.password);
 await page.getByRole('button',{name:'登录',exact:true}).click();
 const responsePromise=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/admin/course-directory');
 await page.getByRole('button',{name:'课程目录看板',exact:true}).click();
 const response=await responsePromise;assert.equal(response.status(),200);
 const data=(await response.json()).data;assert.ok(data.rows.length>0);
 const bars=page.getByRole('progressbar',{name:'课程完成率',exact:true});
 await bars.first().waitFor();
 const rendered=await bars.evaluateAll(elements=>elements.map(element=>element.getAttribute('aria-valuenow')).sort());
 assert.deepEqual(rendered,data.rows.map(row=>row.completionRate==null?null:String(row.completionRate)).sort());
 assert.ok(data.rows.some(row=>row.completionRate===0));
 await page.screenshot({path:'.local/round2-evidence/course-directory.png'});
 console.log(JSON.stringify({check:'ADMIN_DIRECTORY_BROWSER_REAL_API_PROGRESS_BARS',result:'PASS',courses:data.rows.length}));
}catch(error){console.error(JSON.stringify({check:'ADMIN_DIRECTORY_BROWSER',result:'FAIL',message:error.message.slice(0,700)}));process.exitCode=1;}
finally{await browser.close();}
