import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN',page;
try{
 page=await browser.newPage();page.setDefaultTimeout(20000);
 await page.goto('http://localhost:3300/');await page.getByLabel('学校邮箱').fill(state.accounts.admin.email);
 await page.locator('#login-password').fill(state.accounts.admin.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 const isList=r=>new URL(r.url()).pathname==='/api/v1/admin/audit-events';
 const firstPromise=page.waitForResponse(isList);await page.getByRole('button',{name:'审计日志',exact:true}).click();
 const first=await firstPromise;assert.equal(first.status(),200);const initial=(await first.json()).data;
 await page.locator('.admin-audit-detail-button').first().waitFor();
 assert.equal(await page.locator('.admin-audit-detail-button').count(),initial.items.length);
 const headers={authorization:(await first.request().allHeaders()).authorization};
 stage='PAGINATION';assert.ok(initial.nextCursor);
 const secondPromise=page.waitForResponse(isList);await page.locator('.admin-audit-pagination').getByRole('button').last().click();
 const second=(await(await secondPromise).json()).data;
 assert.ok(second.items.length);assert.ok(second.items.every(row=>!initial.items.some(old=>old.id===row.id&&old.source===row.source)));
 const candidatesResponse=await page.request.get('http://localhost:3300/api/v1/admin/audit-events?limit=50'+(process.env.AUDIT_SOURCE_V81==='1'?'&source=V81':'')+'&actorUserId='+state.fixture.teacherUserId,{headers});
 assert.equal(candidatesResponse.status(),200);const candidates=(await candidatesResponse.json()).data.items;
 const candidate=candidates.find(row=>row.targetId&&!initial.items.some(old=>old.id===row.id&&old.source===row.source));assert.ok(candidate);
 stage='SERVER_FILTERS';await page.getByLabel('操作人',{exact:true}).fill(candidate.actorUserId);
 await page.getByLabel('资源 ID',{exact:true}).fill(candidate.targetId);
 const filteredPromise=page.waitForResponse(isList);await page.getByRole('button',{name:'查询审计日志',exact:true}).click();
 const filteredResponse=await filteredPromise;assert.equal(filteredResponse.status(),200);
 const query=new URL(filteredResponse.url()).searchParams;assert.equal(query.get('actorUserId'),candidate.actorUserId);assert.equal(query.get('targetId'),candidate.targetId);
 const filtered=(await filteredResponse.json()).data;assert.ok(filtered.items.some(row=>row.id===candidate.id&&row.source===candidate.source));
 assert.ok(filtered.items.every(row=>row.actorUserId===candidate.actorUserId&&row.targetId===candidate.targetId));
 await page.locator('.admin-audit-detail-button').first().waitFor();assert.equal(await page.locator('.admin-audit-detail-button').count(),filtered.items.length);
 stage='DATE_OUTCOME';
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(candidate.occurredAt));
 await page.getByLabel('开始日期',{exact:true}).fill(date);await page.getByLabel('结束日期',{exact:true}).fill(date);
 if(candidate.outcome!==null){await page.getByRole('combobox',{name:'结果',exact:true}).click();await page.getByRole('option',{name:candidate.outcome,exact:true}).click();}
 const datedPromise=page.waitForResponse(isList);await page.getByRole('button',{name:'查询审计日志',exact:true}).click();
 const datedResponse=await datedPromise;assert.equal(datedResponse.status(),200);
 const datedQuery=new URL(datedResponse.url()).searchParams;assert.equal(datedQuery.get('startDate'),date);assert.equal(datedQuery.get('endDate'),date);assert.equal(datedQuery.get('outcome'),candidate.outcome);
 const dated=(await datedResponse.json()).data;assert.ok(dated.items.length);if(candidate.outcome!==null)assert.ok(dated.items.every(row=>row.outcome===candidate.outcome));
 stage='DETAIL';const detailPromise=page.waitForResponse(r=>new URL(r.url()).pathname.startsWith('/api/v1/admin/audit-events/'));
 await page.locator('.admin-audit-detail-button').first().click();const detailResponse=await detailPromise;assert.equal(detailResponse.status(),200);
 const detail=(await detailResponse.json()).data;assert.equal(detail.id,dated.items[0].id);assert.equal(detail.source,dated.items[0].source);
 await page.getByRole('heading',{name:'审计日志详情',exact:true}).waitFor();
 if(detail.outcome===null)await page.getByText('未记录结果',{exact:true}).first().waitFor();
 await page.screenshot({path:'.local/v81-browser-state/audit-unified-current.png',fullPage:true});
 console.log(JSON.stringify({check:'UNIFIED_AUDIT_REAL_PAGINATION_SERVER_ACTOR_TARGET_DATE_OUTCOME_FILTER_SOURCE_DETAIL',result:'PASS',initialRows:initial.items.length,filteredRows:filtered.items.length,detailSource:detail.source}));
}catch(error){console.log(JSON.stringify({stage,error:error.message}));if(page)await page.screenshot({path:'.local/v81-browser-state/audit-unified-failure.png',fullPage:true});process.exitCode=1;}
finally{await browser.close();}
