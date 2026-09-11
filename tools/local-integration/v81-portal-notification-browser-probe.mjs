import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync('.local/v81-browser-state/state.json'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 for(const role of ['teacher','admin']){
  const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(25000);
  await page.goto('http://localhost:3300/');await page.getByLabel('学校邮箱').fill(state.accounts[role].email);
  await page.locator('#login-password').fill(state.accounts[role].password);await page.getByRole('button',{name:'登录',exact:true}).click();
  if(role==='teacher')await page.getByRole('button',{name:'学生管理',exact:true}).click();
  await page.getByRole('button',{name:'通知',exact:true}).waitFor();
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/notifications'&&r.ok());
  await page.getByRole('button',{name:'通知',exact:true}).click();const response=await pending;
  const data=await response.json();assert.equal(new URL(response.url()).searchParams.get('unreadOnly'),'true');
  assert.ok(Array.isArray(data.data));assert.ok(data.data.every(n=>n.readAt===null));
  const count=data.data.length;
  const expected=count===0?'目前没有未读通知。':`${data.meta.pagination?.hasMore?'至少':'共有'} ${count} 条未读通知。最新：${data.data[0].title}`;
  await page.getByText(expected,{exact:true}).waitFor();
  let marked=false;page.on('request',r=>{if(r.method()==='POST'&&/\/notifications\/.*\/read$/.test(new URL(r.url()).pathname))marked=true;});
  await page.route('**/api/v1/notifications?*',route=>route.abort('failed'));
  await page.getByRole('button',{name:'通知',exact:true}).click();
  await page.getByText(expected,{exact:true}).waitFor({state:'hidden'});
  assert.equal(marked,false);
  console.log(JSON.stringify({check:'PORTAL_NOTIFICATION_REAL_UNREAD_SUMMARY',result:'PASS',role,count,hasMore:data.meta.pagination?.hasMore??false}));
  await context.close();
 }
}catch(error){console.log(JSON.stringify({error:error.message}));process.exitCode=1;}
finally{await browser.close();}
