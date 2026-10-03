import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const root=process.cwd(),work=path.join(root,'.local/access-speed-20260928');
const evidence=path.join(root,'evidence/access-speed-20260928');
const manifest=JSON.parse(await readFile(path.join(work,'student-built/asset-manifest.json')));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.json':'application/json'};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/runtime-config.js')return res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end('globalThis.__BNBU_PUBLIC_CONFIG__={appEnv:"local"};');
    let rel=decodeURIComponent(url.pathname).replace(/^\/student\//,'');
    if(!rel||rel.endsWith('/'))rel+='index.html';
    if(rel.includes('..'))throw new Error('path');
    const base=rel==='index.html'||rel.startsWith('_assets/')?'student-built':'student-source';
    const bytes=await readFile(path.join(work,base,rel));
    res.writeHead(200,{'Content-Type':mime[path.extname(rel)]||'text/plain','Cache-Control':rel.startsWith('_assets/')?'public, max-age=31536000, immutable':'no-store'}).end(bytes);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(4183,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const results=[];
try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto('http://127.0.0.1:4183/student/?preview=student');
  await page.waitForSelector('.bottom-nav');
  assert.equal(requests.some(u=>/screens\/(support|services)\.js/.test(u)),false);
  const appUrl=manifest.base+'js/app.js';
  async function open(screen){await page.evaluate(async({appUrl,screen})=>{const {app}=await import(appUrl);app.openSub(screen);},{appUrl,screen});}
  for(const screen of ['about','changelog','help','feedback','endurance','exemption']){
    await open(screen);await page.waitForFunction(()=>!document.querySelector('.sub-screen-overlay [role="status"]')?.textContent.includes('正在加载'));
    await page.waitForTimeout(100);
    assert.ok((await page.locator('.sub-screen-overlay').innerText()).length>20,screen);
    await page.evaluate(async appUrl=>{const {app}=await import(appUrl);app.handleBack();},appUrl);
  }
  for(const tab of ['courses','checkin','grades','profile','dashboard']){
    await page.evaluate(async({appUrl,tab})=>{const {app}=await import(appUrl);app.closeSub();app.selectTab(tab);},{appUrl,tab});
    assert.ok(await page.locator('.tab-host').innerText());
  }
  await page.screenshot({path:path.join(evidence,'student-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  await page.reload();await page.waitForSelector('.bottom-nav');
  const cache=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('/_assets/')&&e.name.endsWith('.js')).map(e=>({name:e.name,transferSize:e.transferSize})));
  assert.ok(cache.length>30);assert.ok(cache.every(e=>e.transferSize===0));
  results.push({student:'PASS',deferredScreens:6,tabs:5,cachedModules:cache.length,errors});
  await context.close();
  // Browsers cache failed imports: offer an explicit reload, never an automatic one.
  const retryContext=await browser.newContext(),retryPage=await retryContext.newPage();
  let blocked=true;
  await retryPage.route('**/screens/support.js',route=>blocked?route.abort('failed'):route.continue());
  await retryPage.goto('http://127.0.0.1:4183/student/?preview=student');
  await retryPage.waitForSelector('.bottom-nav');
  await retryPage.evaluate(async appUrl=>{const {app}=await import(appUrl);app.openSub('about');},appUrl);
  await retryPage.waitForSelector('[data-action="root.retrySupport"]');blocked=false;
  assert.ok(await retryPage.locator('.bottom-nav').count());
  await retryPage.locator('[data-action="root.retrySupport"]').click();
  await retryPage.waitForSelector('.bottom-nav');
  await retryPage.evaluate(async appUrl=>{const {app}=await import(appUrl);app.openSub('about');},appUrl);
  await retryPage.waitForSelector('[data-action="support.openChangelog"]',{timeout:10000});
  results.push({studentNetworkRetry:'PASS'});await retryContext.close();
  for(const role of ['teacher','admin']){
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),p=await ctx.newPage();
    const errors=[],requests=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));
    await p.goto('http://localhost:4181/?mock='+role);
    await p.waitForSelector('.page-content');
    await p.waitForFunction(()=>!document.querySelector('.page-content')?.textContent.includes('正在加载…'));
    await p.waitForTimeout(800);
    assert.equal(requests.some(u=>u.includes(role==='teacher'?'/app/admin-workspace.tsx':'/app/teacher-workspace.tsx')),false);
    const buttons=await p.locator('aside button').allTextContents();
    await writeFile(path.join(work,role+'-buttons.json'),JSON.stringify(buttons));
    const navigation=role==='teacher'?['课程管理','学生管理','打卡审核','内部成绩册','免测与认证','问题反馈']:['运动数据看板','学生打卡记录','系统概览','课程目录看板','学期管理','用户与账号','分管理员设置','问题反馈','全局规则','系统模式','帮助中心','审计日志'];
    for(const title of navigation){
      await p.locator('aside').getByRole('button',{name:title,exact:true}).click();
      await p.waitForTimeout(350);
      await p.waitForFunction(()=>!document.querySelector('.page-content')?.textContent.includes('正在加载…'));
      assert.ok((await p.locator('.page-content').innerText()).length>10,title);
      assert.equal((await p.locator('.page-content').innerText()).includes('页面加载失败'),false,title);
    }
    await p.setViewportSize({width:390,height:844});
    await p.screenshot({path:path.join(evidence,role+'-mobile.png'),fullPage:true});
    await p.setViewportSize({width:1440,height:1000});
    await p.screenshot({path:path.join(evidence,role+'-desktop.png'),fullPage:true});
    await writeFile(path.join(work,role+'-body.txt'),await p.locator('body').innerText());
    assert.deepEqual(errors,[]);
    results.push({role,initialIsolation:'PASS',pages:navigation.length,errors});await ctx.close();
  }
  const prod=await browser.newContext(),prodPage=await prod.newPage();
  const prodErrors=[],prodRequests=[];prodPage.on('pageerror',e=>prodErrors.push(e.message));prodPage.on('request',r=>prodRequests.push(r.url()));
  // Mirror production Nginx static delivery; the local Windows vinext server
  // returns 404 for built assets despite successfully rendering the SSR entry.
  await prodPage.route('**/assets/**',async route=>{
    const name=new URL(route.request().url()).pathname;
    const body=await readFile(path.join(root,'BNBU-Sports-Web-new/portal-teacher-admin/dist/client',name));
    await route.fulfill({body,contentType:mime[path.extname(name)]||'application/octet-stream'});
  });
  await prodPage.route('**/api/v1/system-mode/announcement',route=>route.fulfill({json:{data:{mode:'NORMAL',policyVersion:1,updatedAt:'2026-09-28T00:00:00Z'}}}));
  await prodPage.goto('http://127.0.0.1:4182/?mock=admin');
  await prodPage.waitForSelector('#login-account');
  assert.equal(prodRequests.some(u=>/(admin|teacher)-workspace-/.test(u)),false);
  assert.equal(await prodPage.locator('.page-content').count(),0);
  assert.deepEqual(prodErrors,[]);
  await prodPage.screenshot({path:path.join(evidence,'portal-production-login.png'),fullPage:true});
  results.push({productionBuild:'PASS',previewBypassDisabled:true,roleChunksAbsentBeforeLogin:true,errors:prodErrors});
  await prod.close();
  await writeFile(path.join(evidence,'browser-verification.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
}finally{await browser.close();server.close();}
