import { chromium } from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const results=[];
try {
 for(const [name,url] of [['student','https://www.student.bnbusports.cn/student/'],['portal','https://www.teacher.bnbusports.cn/'],['knowledge','https://knowledge.verityai.cn/'],['verity','https://verityai.cn/']]){
  const context=await browser.newContext({viewport:{width:390,height:844}}), page=await context.newPage();
  const errors=[],bad=[]; page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)bad.push({url:r.url().split('?')[0],status:r.status()});});
  const runs=[];
  for(const phase of ['cold','warm']){
   const response=await page.goto(url,{waitUntil:'networkidle',timeout:60000});
   runs.push({phase,status:response.status(),...await page.evaluate(()=>({
    navigation:performance.getEntriesByType('navigation').map(n=>({ttfb:n.responseStart,domReady:n.domContentLoadedEventEnd,protocol:n.nextHopProtocol}))[0],
    resources:performance.getEntriesByType('resource').map(r=>({path:new URL(r.name).pathname,type:r.initiatorType,transfer:r.transferSize,decoded:r.decodedBodySize,protocol:r.nextHopProtocol})),
    images:[...document.images].map(i=>({src:i.src.startsWith('data:')?'[inline image]':new URL(i.src).pathname,naturalWidth:i.naturalWidth,displayWidth:i.clientWidth,loading:i.loading})),
    textLength:document.body.innerText.length
   }))});
  }
  await page.screenshot({path:`evidence/acceleration-20260929/${name}.png`,fullPage:true});
  await page.screenshot({path:`evidence/acceleration-20260929/${name}-viewport.png`});
  assert.ok(runs.every(r=>r.status===200 && r.textLength>20));
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
  results.push({name,runs,errors,bad});console.log(JSON.stringify({name,runs:runs.map(r=>({phase:r.phase,status:r.status,navigation:r.navigation,requests:r.resources.length,bytes:r.resources.reduce((s,x)=>s+x.transfer,0)})),errors,bad}));
  await context.close();
 }
} finally {await browser.close();await writeFile('evidence/acceleration-20260929/browser.json',JSON.stringify(results,null,2));}
