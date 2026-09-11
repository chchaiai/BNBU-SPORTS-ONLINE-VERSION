import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const fixturePath = new URL('../../.local/v81-browser-state/teacher-import-current.json', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixturePath));
const account = fixture.accounts.find(a => !a.personalPassword);
assert.ok(account, 'A temporary teacher account is required; do not reset an existing account.');
const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage = 'LOGIN';
try {
  const page = await browser.newPage(); page.setDefaultTimeout(15000);
  await page.goto('http://localhost:3300/');
  await page.getByLabel('学校邮箱').fill(account.email);
  await page.locator('#login-password').fill(fixture.password);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('heading',{name:'首次登录设置密码'}).waitFor();
  stage = 'RELOAD_GATE';
  await page.reload();
  await page.getByRole('heading',{name:'首次登录设置密码'}).waitFor();
  const newPassword = `Personal7!${crypto.randomUUID()}`;
  await page.locator('#recovery-code').fill('Incorrect7!temporary');
  await page.locator('#recovery-password').fill(newPassword);
  await page.locator('#recovery-password-confirmation').fill(newPassword);
  stage = 'REJECT_WRONG_PASSWORD';
  const denied = page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/own-password');
  await page.getByRole('button',{name:'保存密码并进入工作台'}).click();
  assert.ok((await denied).status() >= 400);
  await page.getByRole('alert').waitFor();
  await page.locator('#recovery-code').fill(fixture.password);
  // Keep the synthetic credential only in the ignored local fixture, including uncertain outcomes.
  account.personalPassword = newPassword;
  fs.writeFileSync(fixturePath, JSON.stringify(fixture));
  stage = 'LOST_SUCCESS_RESPONSE';
  let committed = false;
  await page.route('**/api/v1/auth/own-password', async route => {
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    committed = true;
    await route.abort('failed');
  });
  await page.getByRole('button',{name:'保存密码并进入工作台'}).click();
  await page.getByRole('alert').waitFor();
  assert.equal(committed, true);
  await page.unroute('**/api/v1/auth/own-password');
  stage = 'RESTORE_AFTER_COMMIT';
  await page.reload();
  await page.getByRole('button',{name:'课程管理',exact:true}).waitFor();
  const fresh = await browser.newPage();
  await fresh.goto('http://localhost:3300/');
  await fresh.getByLabel('学校邮箱').fill(account.email);
  await fresh.locator('#login-password').fill(newPassword);
  await fresh.getByRole('button',{name:'登录',exact:true}).click();
  await fresh.getByRole('button',{name:'课程管理',exact:true}).waitFor();
  console.log(JSON.stringify({check:'TEACHER_FIRST_PASSWORD_BROWSER',result:'PASS',reloadGate:true,wrongPasswordRejected:true,lostSuccessRecovered:true,newPasswordLogin:true}));
} catch(error) {
  console.error(JSON.stringify({check:'TEACHER_FIRST_PASSWORD_BROWSER',result:'FAIL',stage,type:error.name,message:error.message.slice(0,300)}));
  process.exitCode=1;
} finally {await browser.close();}
