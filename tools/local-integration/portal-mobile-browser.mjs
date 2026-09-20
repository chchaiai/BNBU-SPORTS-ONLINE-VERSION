import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const out='evidence/portal-mobile-20260920';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const checks=[],errors=[];
try {
 for(const width of [320,390,768,1280])for(const role of ['teacher','admin']){
  const page=await browser.newPage({viewport:{width,height:844}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://localhost:53200/?mock=${role}`);
  await page.locator('.app-shell').waitFor();
  const mobile=width<=860;
  const menu=page.getByRole('button',{name:'菜单',exact:true});
  if(mobile){await menu.click();await page.getByRole('button',{name:'收起菜单',exact:true}).press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');await menu.click();}
  else assert.equal(await menu.isVisible(),false);
  const labels=await page.locator('.sidebar nav button').allTextContents();
  for(let i=0;i<labels.length;i++){
   if(mobile && await menu.isVisible())await menu.click();
   await page.locator('.sidebar nav').getByRole('button',{name:labels[i].trim(),exact:true}).click();
   await page.waitForTimeout(500);
   if(mobile)assert.equal(await menu.getAttribute('aria-expanded'),'false');
   const dimensions=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
   assert.ok(dimensions.scroll<=width+1,`${role} ${labels[i]} ${width}: ${dimensions.scroll}`);
   checks.push({role,page:labels[i].trim(),width,...dimensions});
   if(width===390 && (i===0 || labels[i].includes('课程目录')))
    await page.screenshot({path:`${out}/${role}-${i}-390.png`,fullPage:true});
  }
  if(mobile){
   await menu.click();await page.screenshot({path:`${out}/${role}-menu-${width}.png`,fullPage:true});
   const profile=page.locator('.sidebar-bottom button').first();await profile.click();
   const modal=page.locator('.modal').last();await modal.waitFor();
   const box=await modal.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.height<=844);
   await page.screenshot({path:`${out}/${role}-profile-${width}.png`,fullPage:true});
  }else{
   await page.getByRole('button',{name:'折叠侧边栏',exact:true}).click();await page.waitForTimeout(350);
   await page.setViewportSize({width:390,height:844});await menu.click();
   for(const label of labels)assert.ok(await page.locator('.sidebar nav').getByText(label.trim(),{exact:true}).isVisible());
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${out}/browser.json`,JSON.stringify({result:'PASS',mode:'local synthetic preview',checks,keyboardAndProfile:true,desktopCollapsedThenMobile:true,errors},null,2));
 console.log(JSON.stringify({result:'PASS',pages:checks.length,widths:[320,390,768,1280],errors}));
}finally{await browser.close();}
