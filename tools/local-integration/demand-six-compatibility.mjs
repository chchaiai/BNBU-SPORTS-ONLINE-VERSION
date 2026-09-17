import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,webkit} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
import {createAndroidInviteQrPayload} from '../../BNBU-Sports-Web-new/portal-teacher-admin/app/course-invite.ts';
import {TEST_PASSWORD} from '../../backend/test/helpers/test-environment.ts';
const state=JSON.parse(await fs.readFile('.local/demand-six-browser-state.json','utf8'));
const origin=state.baseUrl;
async function api(path,token,body){const r=await fetch(origin+'/api/v1'+path,{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID(),...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});const v=await r.json();assert.ok(r.ok,JSON.stringify(v));return v.data;}
const teacher=await api('/auth/password-login',null,{account:state.fixture.teacherEmail,password:TEST_PASSWORD});
const invite=await api(`/class-sections/${state.fixture.teacherAActiveSectionId}/course-invites`,teacher.accessToken,{expiresInMinutes:30});
const url=new URL(createAndroidInviteQrPayload(invite.inviteToken));
const results=[];
for(const [name,engine,userAgent] of [
 ['chromium-android',chromium,'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'],
 ['webkit-iphone',webkit,'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'],
 ['chromium-wechat-ua',chromium,'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 MicroMessenger/8.0.50'],
]){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},userAgent,isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+url.pathname+url.search+'&org='+encodeURIComponent(state.organizationCode));
  await page.locator('[data-action="consent.agree"]').click();
  await page.waitForFunction(async()=>{const {app}=await import('/student/js/app.js');return !!app.state.pendingInvite;});
  await page.screenshot({path:`evidence/demand-1-6-20260917/${name}-join.png`});
  await page.getByText('验证学校邮箱',{exact:true}).waitFor({timeout:5000}).catch(async e=>{console.log(await page.locator('body').innerText());throw e;});
  assert.equal(new URL(page.url()).searchParams.has('invite'),false);
  await page.screenshot({path:`evidence/demand-1-6-20260917/${name}-join.png`});
  await page.evaluate(async()=>{const {uploadProgressHtml}=await import('/student/js/upload-progress.js');document.body.insertAdjacentHTML('beforeend',uploadProgressHtml({phase:'UPLOADING',percent:42}));});
  const box=await page.locator('.evidence-upload-loader').boundingBox();assert.ok(Math.abs(box.x+box.width/2-195)<2);
  assert.equal(await page.locator('[role="progressbar"]').getAttribute('aria-valuenow'),'42');
  await page.screenshot({path:`evidence/demand-1-6-20260917/${name}-progress.png`});
  assert.deepEqual(errors,[]);results.push({name,realInviteLookup:true,privacyAndEmailFlow:true,centeredProgress:true,pageErrors:errors});
 }finally{await browser.close();}
}
await fs.writeFile('evidence/demand-1-6-20260917/compatibility.json',JSON.stringify({result:'PASS',scope:'Desktop browser engines with mobile viewports and user agents; not physical devices or the WeChat engine',results},null,2));
console.log(JSON.stringify({result:'PASS',results}));
