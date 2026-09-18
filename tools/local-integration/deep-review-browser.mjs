import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const tokens=JSON.parse(await fs.readFile('.local/deep-review-tokens.json','utf8'));
const out='evidence/deep-review-20260918';
const state=JSON.parse(await fs.readFile('.local/demand-six-browser-state.json','utf8'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:53000/student/?org='+encodeURIComponent(state.organizationCode));
 await page.evaluate(async()=>{globalThis.reviewApp=(await import('/student/js/app.js')).app;globalThis.reviewLoadSession=(await import('/student/js/session.js')).loadSession;});
 await page.waitForFunction(()=>globalThis.reviewApp.state.privacyConsentChecked && !globalThis.reviewApp.state.isRestoringSession);
 const ready=await page.evaluate(async(session)=>{
  const api=await import('/student/js/api.js'),{app}=await import('/student/js/app.js');
  api.storeAuthSession(session);const ok=await app.completeApiLogin();
  app.state.privacyConsentChecked=true;app.state.isRestoringSession=false;app.state.needsPrivacyConsent=false;app.state.preLoginGuideCompleted=true;app.state.postEnrollmentGuideCompleted=true;
  const {localStore,BUILD}=await import('/student/js/store.js');localStore.agreePrivacyPolicy(BUILD.PRIVACY_POLICY_VERSION,new Date().toISOString());localStore.markPostEnrollmentGuideCompleted(app.state.workspace.student.id);localStore.markPreLoginCourseGuideCompleted();
  app.state.tab='checkin';app.render();return {ok,error:app.state.lastError,items:app.state.workspace.recoverableSessions?.length,screen:app.screenKey(),mode:app.state.systemModeChecked,privacy:app.state.privacyConsentChecked};
 },tokens.studentSession);
 console.log(JSON.stringify(ready));
 assert.equal(ready.ok,true,JSON.stringify(ready));
 await page.screenshot({path:out+"/recovery-before.png",fullPage:true});
 await page.locator(`[data-action="checkin.recover"][data-session="${tokens.recoverySessionId}"]`).click();
 await page.getByText('历史补录',{exact:true}).waitFor();
 const restored=await page.evaluate(async()=>{const {app}=await import('/student/js/app.js'),{loadSession}=await import('/student/js/session.js');return loadSession(app.state.workspace.student.id);});
 assert.equal(restored.serverId,tokens.recoverySessionId);assert.equal(restored.phase,'finished');assert.equal(restored.activeDurationMillis,3600000);
 assert.equal(new Date(restored.endedAt).toISOString(),'2026-09-16T05:00:00.000Z');
 await page.waitForFunction(()=>globalThis.reviewApp.ui.checkin?.drafts.some(d=>d.serverOnly && d.mediaId));
 await page.screenshot({path:out+'/recovered-mobile.png',fullPage:true});
 await page.locator('[data-action="checkin.abandon"]').click();
 const discarded=page.waitForResponse(r=>r.request().method()==='POST' && r.url().endsWith('/discard'));
 await page.locator('[data-action="checkin.abandonConfirm"]').click();assert.equal((await discarded).status(),200);
 await page.waitForFunction(()=>!globalThis.reviewLoadSession(globalThis.reviewApp.state.workspace.student.id));
 const remaining=await page.evaluate(async()=>{const {listRecoverableSessions}=await import('/student/js/api.js');return await listRecoverableSessions();});
 assert.ok(!remaining.items.some(row=>row.session.id===tokens.recoverySessionId));

 await page.route('**/api/v1/notifications?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'SYSTEM_SERVICE_UNAVAILABLE',message:'synthetic'})}));
 const partial=await page.evaluate(async()=>{const {app}=await import('/student/js/app.js');return {ok:await app.reloadApiWorkspace(),errors:app.state.workspace.moduleErrors,records:app.state.workspace.records.length};});
 assert.equal(partial.ok,true);assert.ok(partial.errors.length);assert.ok(partial.records>0);
 await page.unroute('**/api/v1/notifications?*');
 let releaseFirst,observedFirst;const waiting=new Promise(r=>observedFirst=r),gate=new Promise(r=>releaseFirst=r);let requestCount=0;
 await page.route('**/api/v1/exercise-sessions/recoverable',async route=>{
  const first=++requestCount===1;const response=await route.fetch(),body=await response.json();
  body.data.nextCursor=first?'OLD':'NEW';if(first){observedFirst();await gate;}
  await route.fulfill({response,json:body});
 });
 await page.evaluate(async()=>{const {app}=await import('/student/js/app.js');globalThis.firstReviewReload=app.reloadApiWorkspace();});
 await waiting;
 await page.evaluate(async()=>{const {app}=await import('/student/js/app.js');await app.reloadApiWorkspace();});
 releaseFirst();
 const final=await page.evaluate(async()=>{await globalThis.firstReviewReload;const {app}=await import('/student/js/app.js');return {cursor:app.state.workspace.recoveryNextCursor,loading:app.state.isLoading};});
 assert.equal(final.cursor,'NEW');assert.equal(final.loading,false);assert.deepEqual(errors,[]);
 const result={result:'PASS',mobileRecovery:true,uploadedProofRestored:true,explicitDiscardPersists:true,serverEndTime:true,notificationFailureIsolated:true,staleRefreshIgnored:true,browserErrors:errors};await fs.writeFile(out+'/browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
