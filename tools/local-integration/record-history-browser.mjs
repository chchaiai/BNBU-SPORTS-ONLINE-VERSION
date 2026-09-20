// Uses a local synthetic student's HTTP-authenticated session; never production credentials.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(await fs.readFile('.local/demand-six-browser-state.json','utf8'));
async function post(path,body){
 const response=await fetch('http://127.0.0.1:53000/api/v1'+path,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify(body)});
 const json=await response.json();assert.ok(response.ok,JSON.stringify(json));return json.data;
}
const mail='http://127.0.0.1:58025/api/v1';
const previous=new Set((await(await fetch(mail+'/messages?limit=50')).json()).messages.map(m=>m.ID));
const challenge=await post('/auth/student-sign-in-codes',{organizationCode:state.organizationCode,account:state.student.email,channel:'EMAIL',locale:'en'});
let code;
for(let i=0;i<30&&!code;i++){
 const messages=(await(await fetch(mail+'/messages?limit=50')).json()).messages;
 const message=messages.find(m=>!previous.has(m.ID)&&JSON.stringify(m.To).includes(state.student.email));
 if(message){const detail=await(await fetch(mail+'/message/'+message.ID)).json();code=String(detail.Text??'').match(/(?:code is|验证码是)\s*(\d{4,10})/u)?.[1];}
 if(!code)await new Promise(resolve=>setTimeout(resolve,300));
}
assert.ok(code,'Local synthetic login email must arrive');
const auth=await post('/auth/student-sign-in-codes/verify',{challengeId:challenge.challengeId,code,deviceId:randomUUID()});
const candidate=process.env.RECORD_HISTORY_CANDIDATE;
const out='evidence/record-history-20260918'+(candidate?'/candidate':'');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const results=[],errors=[];
async function login(page){
  await page.waitForFunction(async()=>{const {app}=await import('/student/js/app.js');return app.state.privacyConsentChecked && !app.state.isRestoringSession;});
  return page.evaluate(async auth=>{
    const api=await import('/student/js/api.js'),{app}=await import('/student/js/app.js');
    api.storeAuthSession(auth);
    const ok=await app.completeApiLogin();
    app.state.privacyConsentChecked=true;app.state.needsPrivacyConsent=false;app.state.isRestoringSession=false;
    app.state.postEnrollmentGuideCompleted=true;app.state.preLoginGuideCompleted=true;
    const {clearSession}=await import('/student/js/session.js');clearSession(app.state.workspace.student.id);
    app.state.tab='checkin';app.render();
    return {ok,count:app.state.workspace.records.length,screen:app.screenKey(),error:app.state.lastError?.code};
  },auth);
}
try{
 for(const fault of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  if(candidate)await page.route('**/student/**',async route=>{
   const pathname=new URL(route.request().url()).pathname;
   if(!pathname.startsWith('/student/'))return route.continue();
   const file=path.resolve(candidate,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
   assert.ok(file.startsWith(path.resolve(candidate)+path.sep));
   await route.fulfill({path:file});
  });
  if(fault)await page.route('**/api/v1/activity-certification-applications?*',route=>route.fulfill({status:503,json:{code:'SYSTEM_SERVICE_UNAVAILABLE'}}));
  await page.goto('http://127.0.0.1:53000/student/');
  assert.equal(await page.evaluate(()=>localStorage.getItem('bnbu.student.web.recordProofCache')),null);
  const initial=await login(page);
  console.log(JSON.stringify({fault,initial}));
  await page.screenshot({path:`${out}/initial.png`,fullPage:true});
  await page.locator('[data-action="checkin.tab"][data-tab="records"]').click();
  await page.locator('[data-action="checkin.openRecord"]').first().waitFor();
  const ids=await page.locator('[data-action="checkin.openRecord"]').evaluateAll(nodes=>nodes.map(n=>n.dataset.recordId));
  assert.ok(ids.length>0);
  await page.screenshot({path:`${out}/${fault?'module-failure':'fresh-browser'}.png`,fullPage:true});
  // Clear this browser's site storage and restore authentication; no record cache survives.
  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await page.reload();await login(page);
  await page.locator('[data-action="checkin.tab"][data-tab="records"]').click();
  await page.locator('[data-action="checkin.openRecord"]').first().waitFor();
  assert.deepEqual(await page.locator('[data-action="checkin.openRecord"]').evaluateAll(nodes=>nodes.map(n=>n.dataset.recordId)),ids);
  await page.route('**/api/v1/exercise-records?*',route=>route.fulfill({status:503,json:{code:'SYSTEM_SERVICE_UNAVAILABLE'}}));
  await page.locator('[data-action="checkin.refreshRecords"]').click();
  await page.getByRole('button',{name:'重试读取记录',exact:true}).waitFor();
  assert.equal(await page.getByText('暂无记录',{exact:true}).count(),0);
  await page.unroute('**/api/v1/exercise-records?*');await page.locator('[data-action="checkin.refreshRecords"]').click();
  await page.getByRole('button',{name:'刷新记录',exact:true}).waitFor();
  results.push({moduleFailure:fault,initialWorkspaceLoaded:initial.ok,records:ids.length,freshBrowser:true,clearedStorage:true,failedReadRetry:true});
  await context.close();
 }
 assert.deepEqual(errors,[]);
 const result={result:'PASS',environment:'LOCAL_HTTP_POSTGRESQL_SYNTHETIC',results,browserErrors:errors};
 await fs.writeFile(out+'/browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
