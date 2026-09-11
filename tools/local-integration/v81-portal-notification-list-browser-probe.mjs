import fs from 'node:fs';import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync('.local/v81-browser-state/state.json'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});let stage='LOGIN',role,page;
try{
 for(role of ['teacher','admin']){
  const context=await browser.newContext();page=await context.newPage();page.setDefaultTimeout(30000);
  await page.goto('http://localhost:3300/');await page.getByLabel('学校邮箱').fill(state.accounts[role].email);await page.locator('#login-password').fill(state.accounts[role].password);await page.getByRole('button',{name:'登录',exact:true}).click();
  if(role==='teacher')await page.getByRole('button',{name:'学生管理',exact:true}).click();
  stage='OPEN_LIST';
  const listed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/notifications'&&new URL(r.url()).searchParams.get('limit')==='20');
  await page.getByRole('button',{name:'通知',exact:true}).click();const response=await listed;assert.equal(response.status(),200);
  const list=(await response.json()).data,actor=role==='teacher'?state.fixture.teacherUserId:state.fixture.adminUserId;
  assert.equal(list.length,20);assert.ok(list.every(item=>item.recipientUserId===actor));
  const dialog=page.getByRole('dialog',{name:'我的通知'});await dialog.locator('[data-notification-id]').first().waitFor();
  if(process.env.V81_NOTIFICATION_VISUAL==='1'){await dialog.screenshot({path:`.local/v81-browser-state/${role}-notifications.png`});console.log(JSON.stringify({check:'PORTAL_NOTIFICATION_VISUAL_CAPTURE',role}));await context.close();continue;}
  stage='PAGINATION';await dialog.getByRole('button',{name:'加载更多通知'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-notification-id]').length>20);
  const ids=await dialog.locator('[data-notification-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.notificationId));assert.equal(ids.length,new Set(ids).size);
  stage='READ_LOST_RESPONSE';const notice=list.find(item=>item.readAt===null);assert.ok(notice);
  const article=dialog.locator(`[data-notification-id="${notice.id}"]`),path=`/api/v1/notifications/${notice.id}/read`;let key,committed=false;
  await page.route(`**${path}`,async route=>{const result=await route.fetch();assert.equal(result.status(),200);key=route.request().headers()['idempotency-key'];committed=true;await route.abort('failed');});
  await article.getByRole('button',{name:'标记已读'}).click();await dialog.getByRole('alert').waitFor();assert.equal(committed,true);
  await page.unroute(`**${path}`);const replayed=page.waitForResponse(r=>new URL(r.url()).pathname===path);
  await article.getByRole('button',{name:'标记已读'}).click();const replay=await replayed;assert.equal(replay.status(),200);assert.equal(replay.request().headers()['idempotency-key'],key);
  await article.getByRole('button',{name:'标记已读'}).waitFor({state:'hidden'});
  stage='READ_RELOAD';await page.reload();await page.getByRole('button',{name:'通知',exact:true}).click();await article.waitFor();assert.equal(await article.getByRole('button',{name:'标记已读'}).count(),0);
  stage='UNREAD_FILTER';const unreadResult=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/notifications'&&new URL(r.url()).searchParams.get('unreadOnly')==='true'&&new URL(r.url()).searchParams.get('limit')==='20');
  await dialog.getByRole('button',{name:'未读通知',exact:true}).click();const unread=(await (await unreadResult).json()).data;assert.ok(unread.every(item=>item.readAt===null&&item.recipientUserId===actor));
  stage='NETWORK_RECOVERY';await page.route('**/api/v1/notifications?*',route=>route.abort('failed'));await dialog.getByRole('button',{name:'刷新通知'}).click();await dialog.getByRole('alert').waitFor();
  await page.unroute('**/api/v1/notifications?*');await dialog.getByRole('button',{name:'刷新通知'}).click();await dialog.getByRole('alert').waitFor({state:'hidden'});
  stage='NAVIGATE';await dialog.getByRole('button',{name:'打开相关业务'}).first().click();await dialog.waitFor({state:'hidden'});await page.getByRole('heading',{name:role==='teacher'?'课程管理':'课程目录看板',exact:true}).waitFor();
  console.log(JSON.stringify({check:'PORTAL_NOTIFICATION_LIST_BROWSER',result:'PASS',role,pagination:true,recipientScope:true,lostReadReplay:true,readReload:true,unreadFilter:true,networkRecovery:true,businessSectionNavigation:true}));
  await context.close();
 }
}catch(error){console.error(JSON.stringify({check:'PORTAL_NOTIFICATION_LIST_BROWSER',result:'FAIL',role,stage,type:error.name,message:error.message.slice(0,900)}));await page?.screenshot({path:'.local/v81-browser-state/portal-notification-failure.png'});process.exitCode=1;}
finally{await browser.close();}
