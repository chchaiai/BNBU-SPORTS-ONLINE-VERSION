import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const fixture=JSON.parse(fs.readFileSync('.local/v81-browser-state/bug-20260912-browser.json','utf8'));
const output='.local/bug-20260912-browser-evidence';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let page;const checks=[];
async function waitState(predicate,arg){for(let i=0;i<150;i++){if(await page.evaluate(predicate,arg))return;await new Promise(resolve=>setTimeout(resolve,200));}throw new Error('Browser state did not settle');}
try {
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('pageerror',error=>console.log(JSON.stringify({browserError:error.message})));
 page.on('response',async response=>{if(response.status()>=400&&response.url().includes('/api/')){const value=await response.json().catch(()=>({}));console.log(JSON.stringify({httpStatus:response.status(),code:value.code}));}});
 await page.goto('http://127.0.0.1:4274/student/?api=local&org='+encodeURIComponent(fixture.organizationCode));
 await page.getByRole('button',{name:'同意并继续',exact:true}).click();
 await page.getByText('直接登录',{exact:true}).click();await page.getByText('邮箱验证码登录',{exact:true}).click();await page.getByPlaceholder('name@bnbu.edu.cn').fill(fixture.studentEmail);
 const prior=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=100')).json(),ids=new Set(prior.messages.map(m=>m.ID));
 await page.getByRole('button',{name:'获取验证码',exact:true}).click();let code;
 for(let i=0;i<40&&!code;i++){const messages=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=100')).json();const message=messages.messages.find(m=>!ids.has(m.ID)&&JSON.stringify(m.To).includes(fixture.studentEmail));if(message){const full=await(await fetch('http://127.0.0.1:18025/api/v1/message/'+message.ID)).json();code=full.Text.match(/\b\d{6}\b/)?.[0];}if(!code)await new Promise(r=>setTimeout(r,500));}
 assert.ok(code);await page.getByPlaceholder('4–10 位数字').fill(code);await page.getByRole('button',{name:'登录',exact:true}).click();
 await waitState(async()=>{const {app}=await import('/student/js/app.js');return app.state.authenticated&&!app.state.isLoading&&!app.state.isRestoringSession&&app.state.workspace.student.id;});
 await page.getByRole('button',{name:'跳过',exact:true}).click();
 await page.locator('[data-action="root.tab"][data-tab="checkin"]').click();

 await page.evaluate(async id=>{const {app}=await import('/student/js/app.js');app.actions['checkin.openRecord'](app,{dataset:{recordId:id}});},fixture.recordId);
 await page.waitForFunction(()=>[...document.querySelectorAll('.media-thumb img')].some(img=>img.complete&&img.naturalWidth>0));
 await page.waitForFunction(()=>[...document.querySelectorAll('.media-thumb video')].some(v=>v.videoWidth>0));
 assert.equal(await page.getByText('固定公开原因',{exact:true}).count(),0);
 assert.equal(await page.getByText('Synthetic public note remains visible',{exact:true}).count(),1);
 await page.screenshot({path:output+'/real-media-detail.png',fullPage:true});
 await page.evaluate(async()=>{const {app}=await import('/student/js/app.js');app.actions['checkin.recordBack'](app);app.ui.checkin.tab='exercise';app.render();});
 await page.locator('[data-action="checkin.creditType"][data-value="general"]').click();await page.locator('[data-action="checkin.sport"][data-value="yoga"]').click();
 await page.evaluate(async()=>{const {app}=await import('/student/js/app.js');app.overlay.healthReminderAck=true;app.actions['checkin.start'](app);});
 await page.locator('[data-action="checkin.captureVideo"]').waitFor();
 const chooser=page.waitForEvent('filechooser');await page.locator('[data-action="checkin.captureVideo"]').click();
 const picker=await chooser;assert.equal(await picker.element().getAttribute('capture'),'environment');await picker.setFiles('.local/bug-20260912-video.mp4');
 await waitState(async()=>{const {app}=await import('/student/js/app.js');return app.ui.checkin.drafts.some(d=>d.type==='video'&&d.normalizationPending);});
 await page.evaluate(async()=>{const {app}=await import('/student/js/app.js');app.ui.checkin.previewDraftId=app.ui.checkin.drafts.find(d=>d.type==='video').id;app.render();});
 assert.equal(await page.locator('[data-proof-preview-video]').count(),1);
 await waitState(async()=>{const {app}=await import('/student/js/app.js');return app.ui.checkin.drafts.some(d=>d.type==='video'&&!d.normalizationPending);});
 await page.locator('[data-action="checkin.closeDraftPreview"]').click();
 await page.locator('[data-action="checkin.requestFinish"]').click();await page.locator('[data-action="checkin.confirmFinish"]').click();
 await page.getByText('本次运动已结束',{exact:true}).waitFor();assert.equal(await page.locator('[data-action="checkin.submit"]').count(),0);
 await page.screenshot({path:output+'/short-session-ended.png',fullPage:true});
 console.log(JSON.stringify({check:'REAL_DOCKER_BROWSER_MEDIA_NATIVE_PICKER_PENDING_PREVIEW_SHORT_FINISH',result:'PASS'}));
}finally{await browser.close();}
