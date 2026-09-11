import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN',page;
try{
 page=await browser.newPage();page.setDefaultTimeout(45000);page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).pathname.startsWith('/api/v1/'))console.log(JSON.stringify({path:new URL(r.url()).pathname,status:r.status()}));});
 await page.goto('http://localhost:3300/');await page.getByLabel('学校邮箱').fill(state.accounts.teacher.email);await page.locator('#login-password').fill(state.accounts.teacher.password);
 const logged=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/password-login');await page.getByRole('button',{name:'登录',exact:true}).click();
 const token=(await (await logged).json()).data.accessToken;
 const api=async path=>{const r=await fetch(`http://127.0.0.1:3199/api/v1${path}`,{headers:{authorization:`Bearer ${token}`}});assert.equal(r.status,200);return (await r.json()).data;};
 const profile=await api(`/students/${state.student.studentId}`),rules=await api(`/class-sections/${state.fixture.teacherAActiveSectionId}/v81-rules`);
 const open=async()=>{await page.getByRole('button',{name:'学生管理',exact:true}).click();const row=page.getByRole('row').filter({hasText:profile.studentNumber});await row.getByRole('button').filter({hasText:profile.fullName}).click();await page.getByRole('button',{name:'授权补练'}).click();await page.locator('#makeup-starts').waitFor();};
 await open();const dialog=page.getByRole('dialog',{name:'授权学生补练'});
 const local=value=>new Date(new Date(value).getTime()+8*3600000).toISOString().slice(0,16);
 stage='BOUNDARY_REJECT';
 await page.locator('#makeup-starts').fill('2026-08-01T00:00');await page.locator('#makeup-ends').fill('2026-08-01T01:00');
 const rejected=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/makeup-windows')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'确认授权 / 重试',exact:true}).click();assert.equal((await rejected).status(),422);await dialog.getByRole('alert').waitFor();
 stage='CREATE_LOST_RESPONSE';
 const start=new Date(rules.regular_deadline).getTime()+3600000,end=start+3600000;
 assert.ok(end>Date.now(),'Fixture closing period must still be in the future.');
 await page.locator('#makeup-starts').fill(local(start));await page.locator('#makeup-ends').fill(local(end));
 const path=`/api/v1/class-sections/${state.fixture.teacherAActiveSectionId}/makeup-windows`;let id,key;
 await page.route(`**${path}`,async route=>{if(route.request().method()!=='POST')return route.continue();const response=await route.fetch();assert.equal(response.status(),201);id=(await response.json()).data.id;key=route.request().headers()['idempotency-key'];await route.abort('failed');});
 await page.getByRole('button',{name:'确认授权 / 重试',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.ok(id);
 await page.unroute(`**${path}`);await page.reload();await open();
 stage='RELOAD_REPLAY';const replayed=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');
 await page.getByRole('button',{name:'确认授权 / 重试',exact:true}).click();const replay=await replayed;assert.equal(replay.status(),201);assert.equal(replay.request().headers()['idempotency-key'],key);assert.equal((await replay.json()).data.id,id);
 await dialog.getByText('补练操作已保存，记录已刷新。',{exact:true}).waitFor();
 stage='REVOKE';await page.locator('#makeup-revocation-reason').fill('Synthetic browser cancellation');
 const revoke=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/v1/makeup-windows/${id}/revocation`);
 // Identify this exact grant by server window text among any existing synthetic authorizations.
 const card=dialog.locator(`[data-makeup-window-id="${id}"]`);
 await card.getByRole('button',{name:'撤销本次补练授权'}).click();assert.equal((await revoke).status(),201);
 await dialog.getByText('撤销原因：Synthetic browser cancellation',{exact:true}).waitFor();
 await page.reload();await open();await dialog.getByText('撤销原因：Synthetic browser cancellation',{exact:true}).waitFor();
 console.log(JSON.stringify({check:'MAKEUP_WINDOW_BROWSER',result:'PASS',outOfPeriodRejected:true,lostResponseReplay:true,reloadedRevocation:true}));
}catch(error){console.error(JSON.stringify({check:'MAKEUP_WINDOW_BROWSER',result:'FAIL',stage,type:error.name,message:error.message.slice(0,800)}));await page?.screenshot({path:'.local/v81-browser-state/makeup-window-failure.png'});process.exitCode=1;}
finally{await browser.close();}
