import fs from 'node:fs';import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const dir=new URL('../../.local/v81-browser-state/',import.meta.url),state=JSON.parse(fs.readFileSync(new URL('state.json',dir))),fixture=JSON.parse(fs.readFileSync(new URL('grade-settlement-browser.json',dir)));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});let page,stage='LOGIN';
try{
 page=await browser.newPage();page.setDefaultTimeout(60000);await page.goto('http://localhost:3300/');await page.getByLabel('学校邮箱').fill(state.accounts.teacher.email);await page.locator('#login-password').fill(state.accounts.teacher.password);
 const login=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/password-login');await page.getByRole('button',{name:'登录',exact:true}).click();const token=(await(await login).json()).data.accessToken;
 const api=async path=>{const response=await fetch(`http://127.0.0.1:3199/api/v1${path}`,{headers:{authorization:`Bearer ${token}`}});assert.equal(response.status,200);return(await response.json()).data;};
 const original=await api(`/class-sections/${fixture.id}`),sections=await api('/class-sections?limit=100');
 stage='HISTORY_LIST';for(const section of sections.filter(section=>['CLOSED','ARCHIVED'].includes(section.status))){await page.locator(`[data-class-section-id="${section.id}"]`).waitFor();}
 const open=async()=>{await page.getByRole('button',{name:'课程管理',exact:true}).click();await page.locator(`[data-class-section-id="${fixture.id}"]`).getByRole('button',{name:/进入课程/}).click();await page.getByRole('region',{name:'课程关闭',exact:true}).waitFor();};
 await open();const area=page.getByRole('region',{name:'课程关闭',exact:true});let version=original.version;
 if(original.status!=='CLOSED'){
  stage='CONFIRM_REQUIRED';assert.equal(await area.getByRole('button',{name:'确认关闭课程',exact:true}).isDisabled(),true);
  await page.locator('#course-close-reason').fill('Synthetic browser course close after settlement');await area.getByRole('checkbox').check();
  stage='LOST_RESPONSE';const path=`/api/v1/class-sections/${fixture.id}/close`;let key;
  await page.route(`**${path}`,async route=>{const response=await route.fetch();assert.equal(response.status(),200);version=(await response.json()).data.version;key=route.request().headers()['idempotency-key'];await route.abort('failed');});
  await area.getByRole('button',{name:'确认关闭课程',exact:true}).click();await area.getByRole('alert').waitFor();assert.ok(key);await page.unroute(`**${path}`);
  stage='RELOAD_REPLAY';await page.reload();await open();const replayed=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');await area.getByRole('button',{name:'重试原关闭请求',exact:true}).click();const replay=await replayed;assert.equal(replay.status(),200);assert.equal(replay.request().headers()['idempotency-key'],key);assert.equal((await replay.json()).data.version,version);
 }
 stage='CLOSED_PERSISTS';await page.reload();const card=page.locator(`[data-class-section-id="${fixture.id}"]`);await card.getByText('已关闭',{exact:true}).waitFor();await open();await area.getByText('课程已关闭，仍可处理原有待办和结算。',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'保存设置',exact:true}).isDisabled(),true);
 await page.getByRole('region',{name:'课程结算'}).getByRole('button',{name:'下载结算报告 v1',exact:true}).waitFor();
 assert.equal((await api(`/class-sections/${fixture.id}`)).version,version);
 await area.scrollIntoViewIfNeeded();await page.screenshot({path:'.local/v81-browser-state/course-close-browser.png'});
 console.log(JSON.stringify({check:'COURSE_CLOSE_BROWSER',result:'PASS',newClosure:original.status!=='CLOSED',historyVisible:true,version,savedSettlementAccessible:true}));
}catch(error){console.error(JSON.stringify({check:'COURSE_CLOSE_BROWSER',result:'FAIL',stage,type:error.name,message:error.message.slice(0,700)}));await page?.screenshot({path:'.local/v81-browser-state/course-close-failure.png'});process.exitCode=1;}finally{await browser.close();}
