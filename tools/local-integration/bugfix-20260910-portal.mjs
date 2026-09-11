import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync('.local/v81-browser-state/state.json'));
const fixture=JSON.parse(fs.readFileSync('.local/v81-browser-state/closed-applications-bugfix-20260910.json'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const checks=[];let diagnosticPage;
try{
 for(const role of ['teacher','admin']){
  const context=await browser.newContext({viewport:{width:1024,height:640}}),page=await context.newPage();page.setDefaultTimeout(30000);
  diagnosticPage=page;
  page.on('response',async r=>{if(r.status()>=400&&r.url().includes('/api/')){const body=await r.json().catch(()=>({}));console.log(JSON.stringify({status:r.status(),code:body.code,requestId:body.requestId}));}});
  await page.goto('http://localhost:3300/');await page.locator('#login-account').fill(state.accounts[role].email);await page.locator('#login-password').fill(state.accounts[role].password);await page.getByRole('button',{name:'登录',exact:true}).click();
  const bell=page.getByRole('button',{name:'通知',exact:true});await bell.waitFor();assert.equal(await bell.locator('svg.lucide-bell').count(),1);
  await bell.click();const notices=page.getByRole('dialog',{name:'我的通知'});await notices.getByRole('button',{name:'刷新通知'}).waitFor();
  await notices.screenshot({path:`.local/bugfix-evidence/${role}-notifications.png`});
  await notices.getByRole('button',{name:/关闭/}).click();checks.push(`${role}-notification-bell-and-dialog`);
  if(role==='admin'){
   await page.getByRole('button',{name:'分管理员设置',exact:true}).click();await page.getByRole('button',{name:'新增分管理员',exact:true}).click();
   const dialog=page.getByRole('dialog');await dialog.waitFor();const button=dialog.getByRole('button',{name:'创建分管理员',exact:true});await button.scrollIntoViewIfNeeded();
   const box=await button.boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=640);await dialog.screenshot({path:'.local/bugfix-evidence/admin-create-footer.png'});checks.push('subadmin-create-footer-reachable-at-640px');
  }else{
   await page.getByRole('button',{name:'免测与认证',exact:true}).click();
   const row=page.locator(`[data-exemption-id="${fixture.application.id}"]`);
   // Open the exact application using the visible teacher list search.
   await page.getByRole('tab',{name:/已通过/}).click();
   await page.screenshot({path:'.local/bugfix-evidence/teacher-application-list.png',fullPage:true});
   console.log(JSON.stringify({check:'application-row',found:await row.count(),visibleRows:await page.locator('[data-exemption-id]').count()}));
   await row.getByRole('button',{name:'更多',exact:true}).click({timeout:60000});
   await page.getByRole('menuitem',{name:'查看详情',exact:true}).click();
   const media=page.getByRole('dialog').locator('.teacher-original-media');
   await page.waitForFunction(n=>{const imgs=[...document.querySelectorAll('.teacher-original-media img')];return imgs.length===n&&imgs.every(i=>i.complete&&i.naturalWidth>0);},3,{timeout:30000});
   const ids=await media.evaluateAll(nodes=>nodes.map(n=>n.dataset.mediaId));assert.equal(new Set(ids).size,3);
   assert.ok(fixture.originalMediaIds.every(id=>ids.includes(id)));
   assert.equal(await page.getByRole('dialog').locator('img[src*="checkin-evidence-preview"]').count(),0);
   await page.getByRole('dialog').screenshot({path:'.local/bugfix-evidence/teacher-original-application-images.png'});checks.push('teacher-displays-all-three-original-application-images');
  }
  await context.close();
 }
 console.log(JSON.stringify({status:'PASS',checks}));
}catch(error){if(diagnosticPage&&!diagnosticPage.isClosed()){await diagnosticPage.screenshot({path:'.local/bugfix-evidence/portal-failure.png',fullPage:true});console.log(await diagnosticPage.locator('.teacher-api-error').allTextContents());}throw error;}finally{await browser.close();}
