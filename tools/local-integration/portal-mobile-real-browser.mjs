import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
export async function portalMobileRealBrowser({baseUrl,teacherEmail,adminEmail,password}) {
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const results=[];
 try {for(const [role,email] of [['teacher',teacherEmail],['admin',adminEmail]]){
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/v1/**',async route=>{const url=new URL(route.request().url());await route.fulfill({response:await route.fetch({url:baseUrl+url.pathname+url.search})});});
  await page.goto('http://localhost:53200/');await page.locator('#login-account').fill(email);await page.locator('#login-password').fill(password);await page.getByRole('button',{name:'登录',exact:true}).click();
  const menu=page.getByRole('button',{name:'菜单',exact:true});await menu.waitFor();
  await page.waitForTimeout(500);assert.equal(await page.locator('.review-mode-banner').count(),0);
  await page.screenshot({path:`../evidence/portal-mobile-20260920/real-${role}.png`,fullPage:true});
  await fs.writeFile(`../evidence/portal-mobile-20260920/real-${role}-overflow.json`,JSON.stringify(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1}).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).slice(0,30)})),null,2));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:`../evidence/portal-mobile-20260920/real-${role}.png`,fullPage:true});
  await menu.click();await page.locator('.sidebar-bottom button').first().click();
  const modal=page.locator('.modal').last();await modal.waitFor();const bounds=await modal.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=391&&bounds.height<=844);
  assert.deepEqual(errors,[]);results.push({role,result:'PASS',realLogin:true,mobileNavigation:true,profileWithinViewport:true,errors});await page.close();
 }
 await fs.writeFile('../evidence/portal-mobile-20260920/real-browser.json',JSON.stringify({mode:'LOCAL_HTTP_POSTGRES',results},null,2));
 }finally{await browser.close();}
}
