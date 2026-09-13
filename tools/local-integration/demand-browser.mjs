import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const fixture=JSON.parse(fs.readFileSync('.local/v81-browser-state/demand-fixture.json','utf8'));
const output='.local/demand-browser-evidence';fs.mkdirSync(output,{recursive:true});
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
 await page.getByRole('button',{name:'补录历史运动',exact:true}).waitFor();
 await page.screenshot({path:output+'/student-course-rules.png',fullPage:true});
 assert.ok((await page.locator('body').innerText()).includes('35'));
 await page.locator('[data-action="checkin.creditType"][data-value="general"]').click();await page.locator('[data-action="checkin.sport"][data-value="yoga"]').click();
 await page.getByRole('button',{name:'补录历史运动',exact:true}).click();await page.locator('#history-date').fill(fixture.past);
 await page.locator('#history-time').fill('14:00');await page.locator('#history-minutes').fill('40');
 await page.screenshot({path:output+'/student-backfill-date.png',fullPage:true});
 await page.getByRole('button',{name:'添加凭证',exact:true}).click();
 await page.locator('[data-change="checkin.historyFiles"]').setInputFiles('.local/v81-browser-state/demand-photo.jpg');
 await page.locator('[data-input="checkin.description"]').fill('浏览器真实历史瑜伽补录，凭证待教师审核。');
 await waitState(async()=>{const {app}=await import('/student/js/app.js');return app.ui.checkin.drafts.length===1;});
 await page.screenshot({path:output+'/student-backfill-evidence.png',fullPage:true});
 await page.locator('[data-action="checkin.submit"]').click();
 await waitState(async()=>{const {app}=await import('/student/js/app.js');const {loadSession}=await import('/student/js/session.js');return loadSession(app.state.workspace.student.id)?.phase==='submitted';});
 checks.push('STUDENT_BROWSER_BACKFILL_FILE_UPLOAD_SUBMIT');
 await page.screenshot({path:output+'/student-backfill-submitted.png',fullPage:true});
 const originals=await page.evaluate(async()=>{const {app}=await import('/student/js/app.js');const {listPhotoOriginals}=await import('/student/js/photo-originals.js');return (await listPhotoOriginals(app.state.workspace.student.localOwnerId)).map(p=>({name:p.name,size:p.blob.size}));});
 assert.equal(originals.length,1);assert.equal(originals[0].size,fs.statSync('.local/v81-browser-state/demand-photo.jpg').size);
 const owner=await page.evaluate(async()=>{const {app}=await import('/student/js/app.js');return app.state.workspace.student.localOwnerId;});
 await page.reload();
 await waitState(async id=>{const {app}=await import('/student/js/app.js');return app.state.workspace.student.localOwnerId===id&&!app.state.isRestoringSession;},owner);
 await page.locator('[data-action="root.tab"][data-tab="checkin"]').waitFor({state:'visible'});
 const retained=await page.evaluate(async id=>{return (await(await import('/student/js/photo-originals.js')).listPhotoOriginals(id)).length;},owner);assert.equal(retained,1);
 checks.push('ORIGINAL_PHOTO_RETAINS_AFTER_SUBMISSION_AND_RELOAD');
 fs.writeFileSync(output+'/results.json',JSON.stringify({result:'PASS',checks},null,2));console.log(JSON.stringify({result:'PASS',checks}));
} catch(error){if(page){await page.screenshot({path:output+'/failure.png',fullPage:true});fs.writeFileSync(output+'/failure.txt',await page.locator('body').innerText());}throw error;}finally{await browser.close();}
