import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync('.local/v81-browser-state/state.json'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage();page.setDefaultTimeout(25000);let health;
 page.on('response',async r=>{if(new URL(r.url()).pathname==='/api/v1/health/admin'&&r.ok())health=await r.json().catch(()=>null);});
 await page.goto('http://localhost:3300/');await page.locator('#login-account').fill(state.accounts.admin.email);
 await page.locator('#login-password').fill(state.accounts.admin.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.locator('.admin-health-list').waitFor();assert.ok(health);
 const rows=page.locator('.admin-health-list > div');assert.equal(await rows.count(),5);
 const labels={UP:'正常',DOWN:'异常',NOT_CONFIGURED:'未配置'};
 const deps=health.data.dependencies;
 for(const [i,key] of ['database','notificationQueue','objectStorage','mediaStorage'].entries()){
  const row=rows.nth(i+1);assert.ok((await row.textContent()).includes(labels[deps[key].status]),key);
  if(key!=='notificationQueue'&&deps[key].latencyMs!==null)assert.equal(await row.locator('small').textContent(),`${deps[key].latencyMs} ms`);
 }
 assert.ok((await page.locator('body').textContent()).includes(health.meta.requestId));
 assert.equal(await page.getByText(/客户端帮助发布 API 尚未开放/).count(),0);
 const refreshed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/health/admin'&&r.ok());
 await page.getByRole('button',{name:'刷新健康检查',exact:true}).click();const fresh=await (await refreshed).json();
 await page.getByText(new RegExp(fresh.meta.requestId)).waitFor();
 console.log(JSON.stringify({check:'ADMIN_HEALTH_BROWSER_REAL_DEPENDENCIES_REFRESH',result:'PASS',dependencies:Object.fromEntries(Object.entries(deps).map(([k,v])=>[k,v.status]))}));
}catch(error){console.log(JSON.stringify({error:error.message}));process.exitCode=1;}
finally{await browser.close();}
