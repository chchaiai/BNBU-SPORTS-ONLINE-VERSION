import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
export async function checkinMediaBrowser({baseUrl,token,sessionId,mediaId,studentId,userId}) {
 const root=path.resolve('../.local/checkin-media-candidate');
 const out=path.resolve('../evidence/checkin-media-20260919');
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
 page.setDefaultTimeout(10000);const errors=[],uploads=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().endsWith('/media-uploads'))uploads.push(r.url());});
 try{
 await page.route('**/student/**',async route=>{const pathname=new URL(route.request().url()).pathname;if(!pathname.startsWith('/student/'))return route.continue();const p=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));assert.ok(p.startsWith(root+path.sep));await route.fulfill({path:p});});
 await page.route('**/runtime-config.js',r=>r.fulfill({contentType:'text/javascript',body:'globalThis.__BNBU_PUBLIC_CONFIG__={appEnv:"test"};'}));
 await page.goto(baseUrl+'/student/');
 await page.evaluate(async()=>{window.__mediaTest={app:(await import('/student/js/app.js')).app,session:await import('/student/js/session.js')};});await page.waitForFunction(()=>window.__mediaTest.app.state.privacyConsentChecked && !window.__mediaTest.app.state.isRestoringSession);
 const setup=await page.evaluate(async data=>{
 const api=await import('/student/js/api.js'),{app}=await import('/student/js/app.js');
 api.storeAuthSession({accessToken:data.token,refreshToken:'synthetic-unused',accessTokenExpiresAt:new Date(Date.now()+500000).toISOString(),user:{id:data.userId}});
 const {consentActions}=await import('/student/js/screens/consent.js');consentActions['consent.agree'](app);const ok=await app.completeApiLogin();
 app.state.privacyConsentChecked=true;app.state.needsPrivacyConsent=false;app.state.isRestoringSession=false;app.state.postEnrollmentGuideCompleted=true;app.state.preLoginGuideCompleted=true;
 const {localStore}=await import('/student/js/store.js');localStore.markPostEnrollmentGuideCompleted(app.state.workspace.student.id);localStore.markPreLoginCourseGuideCompleted();const {saveSession}=await import('/student/js/session.js');
 saveSession(app.state.workspace.student.id,{serverId:data.sessionId,phase:'finished',startedAt:Date.now()-3600000,endedAt:Date.now(),activeDurationMillis:3600000,accumulatedMs:3600000,details:{creditType:'course',sportType:'running',description:'Synthetic recovery browser acceptance'}});
 app.state.tab='checkin';app.render();
 app.ui.checkin.draftScope=data.sessionId;app.ui.checkin.restoringDrafts=false;
 app.ui.checkin.drafts=[{id:'local-proof',mediaId:data.mediaId,type:'image',serverOnly:true,url:'',byteCount:45}];
 app.render();
 return {ok,screen:app.screenKey(),write:app.isWriteAllowed(),owner:app.state.workspace.student.id};
 },{token,sessionId,mediaId,studentId,userId});
 console.log(JSON.stringify({setup,errors}));assert.equal(setup.ok,true,JSON.stringify(setup));
 await page.locator('[data-action="checkin.submit"]').click();
 await page.getByText('已恢复服务器保存的凭证，请核对照片和视频后再次提交。',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-action="checkin.previewDraft"]').count(),2);
 await page.screenshot({path:out+'/recovered.png',fullPage:true});
 let injected=false;
 await page.route('**/exercise-records/*/submit',async r=>{if(!injected){injected=true;await r.fulfill({status:422,json:{code:'EXERCISE_RECORD_MEDIA_INCOMPLETE',requestId:'synthetic-rejection'}});}else await r.continue();});
 await page.locator('[data-action="checkin.submit"]').click();
 await page.getByText('本次提交未完成，凭证已保留，请重试。',{exact:true}).waitFor();
 assert.equal(await page.getByText('全部凭证已验证，正在提交打卡…',{exact:true}).count(),0);
 await page.screenshot({path:out+'/failure.png',fullPage:true});
 await page.locator('[data-action="dialog.close"]').last().click();
 await page.locator('[data-action="checkin.submit"]').click();
 await page.waitForFunction(owner=>window.__mediaTest.session.loadSession(owner)?.phase==='submitted' && !window.__mediaTest.app.ui.checkin.finish.submitting,setup.owner);
 await page.screenshot({path:out+'/success.png',fullPage:true});
 assert.equal(uploads.length,0);assert.deepEqual(errors,[]);
 const result={result:'PASS',environment:'LOCAL_HTTP_POSTGRES_SYNTHETIC',productionCandidate:true,missingServerProofRestored:true,rejectedSubmissionClearsProgress:true,retrySubmitted:true,duplicateUploadRequests:uploads.length,browserErrors:errors};
 await fs.writeFile(out+'/browser.json',JSON.stringify(result,null,2));return result;
 }catch(error){console.log(JSON.stringify({errors,body:(await page.locator('body').innerText()).slice(0,2000),state:await page.evaluate(async()=>{const {app}=await import('/student/js/app.js');return {screen:app.screenKey(),tab:app.state.tab,sub:app.state.subScreen,authenticated:app.state.authenticated};})}));await page.screenshot({path:out+'/browser-failure.png',fullPage:true});throw error;}finally{await browser.close();}
}
