import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { chromium } from '../../.local/browser-test/node_modules/playwright-core/index.mjs';

// Local synthetic credentials remain in ignored fixture state; never print them.
const state = JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json', import.meta.url)));
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
let stage='LOGIN';
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:3300/');
  await page.getByLabel('学校邮箱').fill(state.accounts.admin.email);
  await page.locator('#login-password').fill(state.accounts.admin.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '分管理员设置', exact: true }).click();
  stage='CREATE_FORM';
  await page.getByRole('button', { name: '新增分管理员', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const suffix = randomUUID(), account = 'browser-' + suffix, email = account + '@example.test';
  const inputs = dialog.locator('input:not([type=checkbox])');
  assert.equal(await inputs.count(), 6);
  for (const [index, value] of [account, 'Synthetic Browser Admin', email, 'Synthetic Department', 'x', 'x'].entries())
    await inputs.nth(index).fill(value);
  await dialog.getByRole('button', { name: /审计查询/ }).click();
  await dialog.getByRole('button', { name: '创建分管理员', exact: true }).click();
  stage='OTP_DIALOG';
  await page.getByRole('heading', { name: '核验管理员邮箱', exact: true }).waitFor();
  let code;
  for (let attempt = 0; attempt < 30 && !code; attempt++) {
    const messages = await (await fetch('http://127.0.0.1:18025/api/v1/messages?limit=50')).json();
    const message = messages.messages?.find(item => JSON.stringify(item.To ?? []).includes(email));
    if (message) {
      const mail = await (await fetch(`http://127.0.0.1:18025/api/v1/message/${message.ID}`)).json();
      code = (mail.Text ?? '').match(/\b\d{6}\b/)?.[0];
    }
    if (!code) await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(code, 'Synthetic OTP mail must arrive');
  stage='WRONG_OTP';
  await page.getByRole('dialog').locator('input').fill(code === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: '核验并创建', exact: true }).click();
  await page.getByRole('dialog').getByRole('alert').waitFor();
  assert.equal(await page.getByRole('row').filter({ hasText: account }).count(), 0);
  await page.getByRole('dialog').locator('input').fill(code);
  stage='VERIFY_CREATE';
  await page.getByRole('button', { name: '核验并创建', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('row').filter({ hasText: account }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: '分管理员设置', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: account });
  await row.waitFor();
  assert.match(await row.innerText(), /审计查询/);
  await row.getByRole('button', { name: '停用', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '确认', exact: true }).click();
  await row.getByRole('button', { name: '启用', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: '分管理员设置', exact: true }).click();
  await row.getByRole('button', { name: '启用', exact: true }).waitFor();
  await row.getByRole('button', { name: '启用', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '确认', exact: true }).click();
  await row.getByRole('button', { name: '停用', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: '分管理员设置', exact: true }).click();
  await row.getByRole('button', { name: '停用', exact: true }).waitFor();
  console.log(JSON.stringify({ check: 'BROWSER_WRONG_OTP_RETRY_AND_STATUS_RELOAD', result: 'PASS' }));
  await row.getByRole('button', { name: '编辑', exact: true }).click();
  const editInputs = page.getByRole('dialog').locator('input:not([type=checkbox])');
  assert.equal(await editInputs.count(), 4);
  assert.equal(await editInputs.nth(0).isDisabled(), true);
  await editInputs.nth(1).fill('Updated Browser Administrator');
  await editInputs.nth(3).fill('Updated Department');
  await page.getByRole('dialog').getByRole('button', { name: '清空', exact: true }).click();
  await page.getByRole('button', { name: '保存更改', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.reload();
  await page.getByRole('button', { name: '分管理员设置', exact: true }).click();
  assert.match(await row.innerText(), /Updated Browser Administrator/);
  assert.match(await row.innerText(), /Updated Department/);
  assert.ok(!(await row.innerText()).includes('审计查询'));
  await row.getByRole('button', { name: '编辑', exact: true }).click();
  const changedEmail = 'changed-' + email;
  await editInputs.nth(2).fill(changedEmail);
  await page.getByRole('button', { name: '保存更改', exact: true }).click();
  await page.getByRole('heading', { name: '核验管理员邮箱', exact: true }).waitFor();
  let changedCode;
  for (let attempt = 0; attempt < 30 && !changedCode; attempt++) {
    const messages = await (await fetch('http://127.0.0.1:18025/api/v1/messages?limit=50')).json();
    const message = messages.messages?.find(item => JSON.stringify(item.To ?? []).includes(changedEmail));
    if (message) {
      const mail = await (await fetch(`http://127.0.0.1:18025/api/v1/message/${message.ID}`)).json();
      changedCode = (mail.Text ?? '').match(/\b\d{6}\b/)?.[0];
    }
    if (!changedCode) await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(changedCode);
  await page.getByRole('dialog').locator('input').fill(changedCode);
  await page.getByRole('button', { name: '核验并保存', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.reload();
  await page.getByRole('button', { name: '分管理员设置', exact: true }).click();
  assert.ok((await row.innerText()).includes(changedEmail));
  console.log(JSON.stringify({ check: 'BROWSER_SUBADMIN_PROFILE_REVOKE_ALL_AND_OTP_EMAIL_CHANGE', result: 'PASS' }));
  await row.getByRole('button',{name:'删除',exact:true}).click();
  assert.ok((await page.getByRole('dialog').innerText()).includes(changedEmail));
  assert.ok((await page.getByRole('dialog').innerText()).includes('全部职责移交'));
  await page.getByRole('button',{name:'确认删除',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(await row.count(),0);
  await page.reload();
  const reloadedList=page.waitForResponse(response=>response.url().endsWith('/admin/subadmins')&&response.status()===200);
  await page.getByRole('button',{name:'分管理员设置',exact:true}).click();
  const reloadedBody=await (await reloadedList).json();
  assert.ok(!reloadedBody.data.items.some(item=>item.account===account));
  assert.equal(await row.count(),0);
  console.log(JSON.stringify({check:'BROWSER_SUBADMIN_DELETE_CONFIRM_AND_RELOAD',result:'PASS'}));
  console.log(JSON.stringify({ check: 'BROWSER_SUBADMIN_LOGIN_SMTP_OTP_CREATE_RELOAD_DISABLE_ENABLE', result: 'PASS', syntheticIdentity: true }));
} catch (error) {
  // Avoid Playwright call logs containing filled credentials or codes.
  console.error(JSON.stringify({ check: 'BROWSER_SUBADMIN_LOGIN_SMTP_OTP_CREATE_RELOAD_DISABLE_ENABLE', result: 'FAIL', type: error.name, stage }));
  process.exitCode = 1;
} finally { await browser.close(); }
