import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN';
try {
  const page=await browser.newPage();page.setDefaultTimeout(20000);
  await page.goto('http://localhost:3300/');
  await page.getByLabel('学校邮箱').fill(state.accounts.admin.email);
  await page.locator('#login-password').fill(state.accounts.admin.password);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('button',{name:'学期管理',exact:true}).click();
  stage='CREATE';await page.getByRole('button',{name:'新增学期',exact:true}).click();
  const dialog=page.getByRole('dialog'),inputs=dialog.locator('input'),name='Synthetic Semester '+randomUUID();
  const year=process.env.SEMESTER_TEST_YEAR??'2034';
  await inputs.nth(0).fill(name);await inputs.nth(1).fill(`${year}-${Number(year)+1}`);
  await inputs.nth(2).fill(`${year}-09-01`);await inputs.nth(3).fill(`${Number(year)+1}-01-31`);
  let lose=true;const keys=[];
  await page.route('**/api/v1/admin/semesters',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    keys.push(route.request().headers()['idempotency-key']);
    const response=await route.fetch();
    if(lose&&response.ok()){lose=false;return route.abort('failed');}
    await route.fulfill({response});
  });
  await page.getByRole('button',{name:'保存学期',exact:true}).click();
  await dialog.getByRole('alert').waitFor();stage='RETRY';
  assert.equal(await inputs.nth(0).isDisabled(),true);
  assert.equal(await dialog.getByRole('button',{name:'取消',exact:true}).isDisabled(),true);
  await dialog.getByRole('button',{name:/关闭|Close/}).click();
  assert.equal(await dialog.isVisible(),true);
  if(process.env.SEMESTER_REFRESH_RECOVERY==='1') {
    await page.reload();
    await page.getByRole('button',{name:'学期管理',exact:true}).click();
    await dialog.getByText(/已恢复未确认的提交/).waitFor();
    assert.equal(await dialog.locator('input').nth(0).inputValue(),name);
    assert.equal(await dialog.locator('input').nth(0).isDisabled(),true);
  }
  await page.getByRole('button',{name:'保存学期',exact:true}).click();
  await dialog.waitFor({state:'hidden'});assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
  assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('bnbu-semester-pending-v1:')).length),0);
  const row=page.locator('tbody tr').filter({hasText:name});await row.waitFor();
  stage='EDIT';await row.getByRole('button',{name:'编辑配置',exact:true}).click();
  await dialog.locator('input').nth(0).fill(name+' updated');
  await page.getByRole('button',{name:'保存学期',exact:true}).click();await dialog.waitFor({state:'hidden'});
  stage='PREFLIGHT';await row.getByRole('button',{name:'设为当前学期',exact:true}).click();
  await dialog.getByText(/尚未到开始日期/).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'确认切换',exact:true}).isDisabled(),true);
  await page.screenshot({path:process.env.SEMESTER_SCREENSHOT_PATH??'docs/implementation/semester-dialog-guard-20260908.png',fullPage:true});
  console.log(JSON.stringify({check:'ADMIN_SEMESTER_EXISTING_PAGE_CREATE_LOST_RESPONSE_SAME_KEY_EDIT_SERVER_BLOCKED_SWITCH',result:'PASS'}));
} catch(error) {console.log(JSON.stringify({stage,error:error.message}));process.exitCode=1;}
finally {await browser.close();}
