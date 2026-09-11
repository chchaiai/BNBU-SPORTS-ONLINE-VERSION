import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const {email}=JSON.parse(fs.readFileSync('.local/v81-browser-state/student-1000m-join.json'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(60000);
try{
 await page.goto('http://127.0.0.1:4274/student/');await page.getByRole('button',{name:'同意并继续'}).click();await page.getByText('直接登录',{exact:true}).click();await page.getByText('邮箱验证码登录',{exact:true}).click();await page.getByPlaceholder('name@bnbu.edu.cn').fill(email);
 const before=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=100')).json();const ids=new Set(before.messages.map(item=>item.ID));
 await page.getByRole('button',{name:'获取验证码',exact:true}).click();let code;
 for(let attempt=0;attempt<30&&!code;attempt++){
  const messages=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=100')).json();const message=messages.messages.find(item=>!ids.has(item.ID)&&JSON.stringify(item.To??[]).includes(email));
  if(message){const mail=await(await fetch(`http://127.0.0.1:18025/api/v1/message/${message.ID}`)).json();code=mail.Text?.match(/\b\d{6}\b/)?.[0];}
  if(!code)await new Promise(resolve=>setTimeout(resolve,500));
 }
 assert.ok(code);await page.getByPlaceholder('4–10 位数字').fill(code);await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.locator('[data-action="guide.skip"]').waitFor();await page.locator('[data-action="guide.skip"]').click();
 await page.locator('[data-action="root.tab"][data-tab="profile"]').click();await page.locator('[data-action="profile.openExemption"]').click();
 await page.locator('[data-action="exemption.tab"][data-value="new"]').click();await page.locator('[data-action="exemption.selectType"][data-value="1000m"]').click();
 const reason='Synthetic 1000m browser '+crypto.randomUUID();await page.locator('#exemption-reason').fill(reason);
 await page.locator('[data-exemption-input="gallery"]').setInputFiles('backend/test/fixtures/v81-media/sample.png');
 const submitting=page.waitForResponse(r=>/\/exemption-applications\/[^/]+\/submit$/.test(new URL(r.url()).pathname)&&r.request().method()==='POST');await page.locator('[data-action="exemption.submit"]').click();
 const submitted=await submitting;assert.equal(submitted.status(),200);const application=(await submitted.json()).data;assert.equal(application.applicationType,'PHYSICAL_TEST');assert.equal(application.status,'SUBMITTED');assert.equal(application.mediaIds.length,1);
 const state=JSON.parse(fs.readFileSync('.local/v81-browser-state/state.json'));const teacher=await browser.newPage();teacher.setDefaultTimeout(60000);
 await teacher.goto('http://localhost:3300/');await teacher.locator('#login-account').fill(state.accounts.teacher.email);await teacher.locator('#login-password').fill(state.accounts.teacher.password);await teacher.getByRole('button',{name:'登录',exact:true}).click();await teacher.getByRole('button',{name:'免测与认证',exact:true}).click();
 await teacher.getByRole('row').filter({hasText:reason}).getByRole('button',{name:'开始审核',exact:true}).click();const dialog=teacher.getByRole('dialog');
 await teacher.waitForFunction(()=>{const image=document.querySelector('.teacher-original-media img');return image?.complete&&image.naturalWidth>0;});
 await dialog.getByPlaceholder('请说明审核依据和处理结果').fill('Synthetic 1000m approval after real image review');
 const reviewed=teacher.waitForResponse(r=>new URL(r.url()).pathname===`/api/v1/exemption-applications/${application.id}/review`&&r.request().method()==='POST');await dialog.getByRole('button',{name:'确认审核',exact:true}).click();assert.equal((await reviewed).status(),200);
 await page.reload();await page.locator('[data-action="root.tab"][data-tab="profile"]').click();await page.locator('[data-action="profile.openExemption"]').click();
 const card=page.locator(`[data-action="exemption.open"][data-exemption-id="${application.id}"]`);await card.waitFor();assert.match(await card.innerText(),/已通过/);await card.click();await page.getByText('Synthetic 1000m approval after real image review',{exact:true}).first().waitFor();
 await page.screenshot({path:'.local/bugfix-evidence/1000m-exemption-approved.png',fullPage:true});
 console.log(JSON.stringify({check:'MALE_1000M_REAL_STUDENT_UPLOAD_SUBMIT_TEACHER_IMAGE_REVIEW_STUDENT_APPROVED',result:'PASS',applicationId:application.id}));
}catch(error){await page.screenshot({path:'.local/bugfix-evidence/1000m-exemption-failure.png',fullPage:true});throw error;}finally{await browser.close();}
