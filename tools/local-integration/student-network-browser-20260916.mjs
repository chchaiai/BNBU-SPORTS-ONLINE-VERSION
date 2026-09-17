import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const root=path.resolve('BNBU-Sports-Web-new/frontend');
const server=http.createServer(async(req,res)=>{try {let name=new URL(req.url,'http://local').pathname;if(name.endsWith('/'))name+='index.html';const file=path.join(root,name);const body=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(body);}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'});
 let mode='failure',reads=0;
 if (!process.env.STUDENT_NETWORK_URL) await context.route('**/runtime-config.js',r=>r.fulfill({contentType:'text/javascript',body:'globalThis.__BNBU_PUBLIC_CONFIG__={appEnv:"local"};'}));
 await context.route('**/api/v1/system-mode/announcement',async r=>{reads++;if(mode==='failure')return r.abort('connectionfailed');if(mode==='server')return r.fulfill({status:503,json:{code:'SYSTEM_SERVICE_UNAVAILABLE'}});return r.fulfill({json:{data:{mode}}});});
 const page=await context.newPage();await page.goto(process.env.STUDENT_NETWORK_URL || `http://127.0.0.1:${server.address().port}/student/`);
 await page.getByText('网络连接不稳定，请稍后重试',{exact:true}).waitFor();assert.equal(await page.locator('.maintenance-page').count(),0);
 await page.screenshot({path:'evidence/student-network-20260916/connection-failed.png'});
 mode='server';await page.getByRole('button',{name:'重新尝试',exact:true}).click();await page.getByText('服务暂时不可用，请稍后重试',{exact:true}).waitFor();assert.equal(await page.locator('.maintenance-page').count(),0);
 await context.setOffline(true);await page.getByText('当前无网络连接，请检查网络后重试',{exact:true}).waitFor();
 await page.screenshot({path:'evidence/student-network-20260916/offline.png'});
 mode='NORMAL';const before=reads;await context.setOffline(false);await page.waitForFunction(async()=>{const {app}=await import('/student/js/app.js');return app.state.systemModeChecked&&!app.state.connectionError;});assert.ok(reads>before);
 mode='MAINTENANCE';await page.evaluate(async()=>{const {app}=await import('/student/js/app.js');await app.refreshSystemMode();});await page.locator('.maintenance-page').waitFor();
 mode='NORMAL';await page.evaluate(async()=>{const {app}=await import('/student/js/app.js');await app.retryConnection();});assert.equal(await page.locator('.maintenance-page').count(),0);
 console.log(JSON.stringify({result:'PASS',checks:['connection failure','retry','generic 503','offline','online auto request','explicit maintenance','maintenance recovery'],reads}));
}finally{await browser.close();server.close();}
