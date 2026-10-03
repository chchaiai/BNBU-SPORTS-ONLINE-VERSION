import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const folder='evidence/access-speed-20260928';
const gate=JSON.parse(await readFile(folder+'/validation.json'));
const manifest=JSON.parse(await readFile('BNBU-Sports-Web-new/portal-teacher-admin/dist/client/.vite/manifest.json'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const results=[];
try{
 for(const kind of ['student','portal']){
  const context=await browser.newContext({viewport:kind==='student'?{width:390,height:844}:{width:1440,height:1000}});
  const page=await context.newPage(),errors=[],bad=[],resources=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)bad.push({url:r.url(),status:r.status()});if(r.url().includes('/_assets/')||r.url().includes('/assets/'))resources.push(r.url());});
  const url=kind==='student'?'https://www.student.bnbusports.cn/student/':'https://www.teacher.bnbusports.cn/';
  const response=await page.goto(url,{waitUntil:'networkidle',timeout:60000});assert.equal(response.status(),200);
  if(kind==='student'){
   assert.ok((await page.locator('#app-viewport').innerText()).length>20);
   assert.ok(resources.some(url=>url.includes(gate.student.base)));
   assert.equal(resources.some(url=>/screens\/(support|services)\.js/.test(url)),false);
   const exports=await page.evaluate(async base=>{
    const a=await import(base+'js/screens/support.js'),b=await import(base+'js/screens/services.js');
    return {help:typeof a.renderHelpCenter,exemption:typeof b.renderExemption};
   },gate.student.base);
   assert.deepEqual(exports,{help:'function',exemption:'function'});
  }else{
   await page.waitForSelector('#login-account',{timeout:20000});
   assert.equal(resources.some(url=>/(teacher|admin)-workspace-/.test(url)),false);
   const chunks=['app/teacher-workspace.tsx','app/admin-workspace.tsx',...Object.keys(manifest).filter(k=>/^app\/admin-/.test(k)&&k!=='app/admin-workspace.tsx')].map(k=>'/'+manifest[k].file);
   const loaded=await page.evaluate(async paths=>{const result=[];for(const path of paths){const module=await import(path);result.push({path,exports:Object.keys(module).length});}return result;},chunks);
   assert.ok(loaded.every(row=>row.exports>0));
  }
  await page.screenshot({path:folder+'/'+kind+'-live.png',fullPage:true});
  await page.reload({waitUntil:'networkidle'});
  const cache=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('/assets/')||e.name.includes('/_assets/')).map(e=>({url:e.name,transferSize:e.transferSize})));
  const hashed=cache.filter(e=>kind==='student'?e.url.includes(gate.student.base):e.url.includes('/assets/'));
  assert.ok(hashed.length>0);assert.ok(hashed.every(e=>e.transferSize===0),JSON.stringify(hashed));
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
  results.push({kind,status:200,checkedResources:resources.length,cachedOnReload:hashed.length,errors,bad});
  await context.close();
 }
 await writeFile(folder+'/live-browser-verification.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
