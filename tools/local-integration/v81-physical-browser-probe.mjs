import fs from 'node:fs';import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const dir=new URL('../../.local/v81-browser-state/',import.meta.url),state=JSON.parse(fs.readFileSync(new URL('state.json',dir)));
const fixture=JSON.parse(fs.readFileSync(new URL('physical-browser.json',dir)));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});let page,stage='LOGIN';
try{
 page=await browser.newPage();page.setDefaultTimeout(45000);
 await page.goto('http://localhost:3300/');await page.getByLabel('学校邮箱').fill(state.accounts.teacher.email);await page.locator('#login-password').fill(state.accounts.teacher.password);
 const login=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/password-login');await page.getByRole('button',{name:'登录',exact:true}).click();
 const token=(await (await login).json()).data.accessToken;
 const api=async path=>{const response=await fetch(`http://127.0.0.1:3199/api/v1${path}`,{headers:{authorization:`Bearer ${token}`}});assert.equal(response.status,200);return (await response.json()).data;};
 const profile=await api(`/students/${fixture.studentId}`),sections=await api('/class-sections?limit=100');
 const index=sections.findIndex(s=>s.id===fixture.classSectionId);assert.ok(index>=0);
 const open=async()=>{await page.getByRole('button',{name:'内部成绩册',exact:true}).click();await page.getByRole('combobox',{name:'当前课程',exact:true}).click();await page.getByRole('option').nth(index).click();const row=page.getByRole('row').filter({hasText:profile.fullName});await row.getByRole('button',{name:/录入成绩|查看 \/ 修改成绩/}).click();await page.locator('#physical-tested-on').waitFor();};
 await open();const area=page.getByRole('region',{name:'原始体测资料'}),path=`/api/v1/enrollments/${fixture.enrollmentId}/physical-results`;
 const fill=async(date)=>{await page.locator('#physical-minutes').fill('4');await page.locator('#physical-seconds').fill('35');await page.locator('#physical-tested-on').fill(date);};
 stage='REJECT_FUTURE_DATE';await fill('2999-01-01');
 const bad=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');await area.getByRole('button',{name:'保存原始体测',exact:true}).click();assert.equal((await bad).status(),422);await area.getByRole('alert').waitFor();
 await area.getByRole('button',{name:'刷新体测资料'}).click();
 // Wait for the current history before editing; the refresh intentionally replaces stale form inputs.
 await page.waitForFunction(()=>!document.querySelector('#physical-tested-on')?.disabled);
 stage='LOST_RESPONSE';await fill('2026-09-07');let version,key;
 await page.route(`**${path}`,async route=>{if(route.request().method()!=='POST')return route.continue();const response=await route.fetch();assert.equal(response.status(),201);version=(await response.json()).data.version;key=route.request().headers()['idempotency-key'];await route.abort('failed');});
 await area.getByRole('button',{name:'保存原始体测',exact:true}).click();await area.getByRole('alert').waitFor();assert.ok(version);
 await page.unroute(`**${path}`);stage='REFRESH_REPLAY';await page.reload();await open();
 const replayed=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');await area.getByRole('button',{name:'重试原体测保存',exact:true}).click();const replay=await replayed;
 assert.equal(replay.status(),201);assert.equal(replay.request().headers()['idempotency-key'],key);assert.equal((await replay.json()).data.version,version);
 await area.getByText('原始体测资料已保存，历史版本已保留。',{exact:true}).waitFor();
 assert.equal(await page.locator('#physical-minutes').inputValue(),'4');assert.equal(await page.locator('#physical-seconds').inputValue(),'35');assert.equal(await page.locator('#physical-tested-on').inputValue(),'2026-09-07');
 await page.reload();await open();const history=area.locator(`[data-physical-version="${version}"]`);await history.waitFor();assert.match(await history.textContent(),/1000m.*4.*35/);
 await area.scrollIntoViewIfNeeded();await page.screenshot({path:'.local/v81-browser-state/physical-browser.png'});
 console.log(JSON.stringify({check:'PHYSICAL_RESULT_BROWSER',result:'PASS',futureDateRejected:true,lostResponseReplay:true,persistedSeconds:275,version}));
}catch(error){console.error(JSON.stringify({check:'PHYSICAL_RESULT_BROWSER',result:'FAIL',stage,type:error.name,message:error.message.slice(0,700)}));await page?.screenshot({path:'.local/v81-browser-state/physical-browser-failure.png'});process.exitCode=1;}
finally{await browser.close();}
