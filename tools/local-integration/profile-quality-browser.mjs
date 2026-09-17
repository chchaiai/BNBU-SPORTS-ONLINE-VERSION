import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const f=JSON.parse(readFileSync('.local/profile-quality/browser.json','utf8'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4178/student/');
await page.waitForTimeout(1200);
await page.evaluate(async f=>{const api=await import('/student/js/api.js');api.storeAuthSession({accessToken:f.token,refreshToken:'synthetic-browser-refresh',accessTokenExpiresAt:new Date(Date.now()+1200000).toISOString(),userId:f.userId,sessionId:f.sessionId});const {localStore}=await import('/student/js/store.js');localStore.markPostEnrollmentGuideCompleted(f.good.studentNumber);const {app}=await import('/student/js/app.js');app.state.authenticated=true;app.state.needsPrivacyConsent=false;app.state.privacyConsentChecked=true;app.state.postEnrollmentGuideCompleted=true;await app.reloadApiWorkspace();app.state.postEnrollmentGuideCompleted=true;app.render();},f);
await page.locator('[data-profile-details-form]').waitFor();
assert.equal(await page.locator('[data-action="profile.cancelDetails"]').count(),0);
assert.equal(await page.locator('[data-field="studentNumber"]').inputValue(),f.good.studentNumber);
await page.screenshot({path:'evidence/profile-quality-20260915/required-mobile.png',fullPage:true});
await page.locator('[data-field="collegeName"]').selectOption('FST');
await page.locator('[data-field="majorName"]').selectOption('CST');
await page.locator('[data-field="studentNumber"]').fill('123');
await page.locator('[data-action="profile.saveDetails"]').click();await page.getByRole('alert').filter({hasText:'学号格式'}).waitFor();
await page.locator('[data-field="studentNumber"]').fill(f.good.studentNumber);
await page.locator('[data-field="collegeName"]').selectOption('FST');
await page.locator('[data-field="majorName"]').selectOption('CST');
await page.locator('[data-action="profile.saveDetails"]').click();
await page.waitForFunction(async()=>{const {app}=await import('/student/js/app.js');return app.state.workspace.student.profileQualityStatus==='NORMAL';});
await page.locator('[data-profile-details-form]').waitFor({state:'detached'});
assert.deepEqual(errors,[]);
await page.screenshot({path:'evidence/profile-quality-20260915/corrected-mobile.png',fullPage:true});
console.log(JSON.stringify({result:'PASS',checks:['mandatory form','prefilled fields','no cancel','invalid number rejected','college and major reselected','real HTTP save','normal restored'],pageErrors:errors}));
}finally{await browser.close();}
