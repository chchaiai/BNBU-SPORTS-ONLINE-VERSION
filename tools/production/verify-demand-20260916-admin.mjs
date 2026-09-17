import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';

const state={...JSON.parse(await fs.readFile('.local/demand-20260916-private.json','utf8')),baseUrl:'https://www.teacher.bnbusports.cn'}; const TEST_PASSWORD=state.accounts.admin.password;
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
 const page=await browser.newPage();await page.goto(state.baseUrl+'/');
 await page.locator('#login-account').fill(state.fixture.adminEmail);await page.locator('#login-password').fill(TEST_PASSWORD);
 await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByText('系统健康',{exact:true}).waitFor();
 const responsePromise=page.waitForResponse(response=>response.url().includes('/health/admin/outbox?'));
 await page.getByRole('button',{name:'业务事件待处理记录 · 查看详情',exact:true}).click();
 const response=await responsePromise;assert.equal(response.status(),200);
 const result=await response.json();const data=result.data;
 const details=page.getByRole('region',{name:'业务事件详情'});
 await details.getByText(`当前组织积压 ${data.backlog} 条；筛选结果 ${data.total} 条。`,{exact:true}).waitFor();
 assert.ok(data.items.length>0);
 const eventType=data.items[0].eventType;
 const filtered=page.waitForResponse(response=>response.url().includes('/health/admin/outbox?')&&new URL(response.url()).searchParams.get('eventType')===eventType);
 await details.getByLabel('事件类型',{exact:true}).fill(eventType);
 assert.equal((await filtered).status(),200);
 await details.locator('tbody tr').filter({hasText:eventType}).first().waitFor();
 await fs.writeFile('evidence/demand-20260916/online/admin-outbox-result.json',JSON.stringify({requirement:21,realOverviewEntry:true,backlog:data.backlog,eventTypeFilter:eventType,apiStatus:200},null,2));
 await page.screenshot({path:'evidence/demand-20260916/online/admin-overview.png',fullPage:true});
}finally{await browser.close();}
