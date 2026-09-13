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
 await page.locator('[data-action="root.tab"][data-tab="profile"]').click();
 await page.locator('[data-action="profile.openAccount"]').click();
 const text=await page.locator('body').innerText();
 for(const label of ['学院','专业','出生年月日','地域'])assert.ok(text.includes(label));
 assert.ok(!text.includes('未填写'));
 await page.screenshot({path:output+'/student-long-term-profile.png',fullPage:true});
 console.log(JSON.stringify({check:'STUDENT_LONG_TERM_PROFILE_BROWSER',result:'PASS'}));
 await page.locator('[data-action="profile.subBack"]').click();
 await page.locator('[data-action="profile.openExemption"]').click();
 await page.locator('[data-action="exemption.open"]').first().click();
 const pdf=page.getByRole('link',{name:'PDF',exact:true});await pdf.waitFor();
 const result=await page.request.get(new URL(await pdf.getAttribute('href'),page.url()).href);
 assert.equal(result.status(),200);assert.ok((await result.body()).subarray(0,5).toString()==='%PDF-');
 await page.screenshot({path:output+'/student-pdf-preview.png',fullPage:true});
 console.log(JSON.stringify({check:'STUDENT_PDF_SIGNED_DOWNLOAD_BROWSER',result:'PASS'}));
 await page.locator('[data-action="exemption.detailBack"]').click();
 await page.locator('[data-action="exemption.tab"][data-value="new"]').click();
 await page.locator('[data-action="exemption.selectType"][data-value="club"]').click();
 await page.locator('#exemption-organization').fill('Synthetic Browser Club');
 await page.locator('#exemption-reason').fill('浏览器真实 PDF 上传与提交回归。');
 await page.locator('[data-exemption-input="gallery"]').setInputFiles('.local/v81-browser-state/demand-proof.pdf');
 await page.locator('[data-action="exemption.submit"]').click();
 await waitState(async()=>{const {app}=await import('/student/js/app.js');return Boolean(app.ui.exemption.success)&&!app.ui.exemption.submitting;});
 await page.screenshot({path:output+'/student-pdf-submitted.png',fullPage:true});
 console.log(JSON.stringify({check:'STUDENT_PDF_UPLOAD_SUBMIT_BROWSER',result:'PASS'}));


} catch(error){if(page){await page.screenshot({path:output+'/profile-failure.png',fullPage:true});fs.writeFileSync(output+'/profile-failure.txt',await page.locator('body').innerText());}throw error;}finally{await browser.close();}
