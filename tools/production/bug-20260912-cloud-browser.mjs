import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const fixture=JSON.parse(fs.readFileSync('.local/bug-20260912-cloud-private.json'));
const output='.local/bug-20260912-cloud-browser';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(45000);
 await page.addInitScript(auth=>{localStorage.setItem('bnbu.student.web.apiTokens',JSON.stringify(auth));localStorage.setItem('bnbu.student.web.session',JSON.stringify({kind:'api',accountId:auth.accountId,signedInAt:new Date().toISOString()}));},{...fixture.studentSession,userId:fixture.student.userId,accountId:'SYNTH-SESSION-'+fixture.student.email.split('.')[2].toUpperCase(),schemaVersion:2});
 await page.goto('https://www.student.bnbusports.cn/student/');
 await page.getByRole('button',{name:'同意并继续',exact:true}).waitFor();
 await page.getByRole('button',{name:'同意并继续',exact:true}).click();
 for(let n=0;n<100;n++){if(await page.evaluate(async()=>{const {app}=await import('/student/js/app.js');return app.state.authenticated&&!app.state.isLoading&&app.state.workspace.records.some(r=>r.id);}))break;await page.waitForTimeout(200);}
 if(await page.getByRole('button',{name:'跳过',exact:true}).isVisible())await page.getByRole('button',{name:'跳过',exact:true}).click();
 await page.screenshot({path:output+'/restore-diagnostic.png'});
 await page.locator('[data-tab="checkin"]').click();
 await page.evaluate(async id=>{const {app}=await import('/student/js/app.js');app.actions['checkin.openRecord'](app,{dataset:{recordId:id}});},fixture.record.id);
 await page.waitForFunction(()=>[...document.querySelectorAll('.media-thumb img')].some(img=>img.complete&&img.naturalWidth>0));
 await page.waitForFunction(()=>[...document.querySelectorAll('.media-thumb video')].some(video=>video.videoWidth>0));
 assert.equal(await page.getByText('Synthetic public note remains visible',{exact:true}).count(),1);
 assert.equal(await page.getByText('固定公开原因',{exact:true}).count(),0);
 await page.locator('.media-thumb').first().screenshot({path:output+'/private-photo.png'});
 await page.locator('.media-thumb').nth(1).screenshot({path:output+'/private-video.png'});
 console.log(JSON.stringify({check:'CLOUD_STUDENT_PRIVATE_PHOTO_VIDEO_AND_PUBLIC_NOTE',result:'PASS'}));
 const teacher=await browser.newPage({viewport:{width:1400,height:1000}});teacher.setDefaultTimeout(45000);
 await teacher.goto('https://www.teacher.bnbusports.cn/');await teacher.locator('#login-account').fill(fixture.teacher.email);await teacher.locator('#login-password').fill(fixture.teacher.password);await teacher.getByRole('button',{name:'登录',exact:true}).click();
 await teacher.getByRole('button',{name:'通知',exact:true}).waitFor();
 await teacher.locator('article.teacher-course-card').filter({hasText:'Synthetic Active Course 1'}).getByRole('button',{name:'进入课程'}).click();
 const section=teacher.locator('section[aria-label="删除课程"]');
 await section.getByRole('button',{name:'删除课程',exact:true}).click();
 await section.locator('#course-delete-name').fill('Synthetic Teacher A Active Section');await section.locator('#course-delete-reason').fill('Synthetic cloud regression cleanup; retain student history');await section.locator('input[type=checkbox]').check();
 // Create the live invitation that triggered the original CHECK-constraint failure.
 const invite=await fetch('https://www.student.bnbusports.cn/api/v1/class-sections/'+fixture.fixture.teacherAActiveSectionId+'/course-invites',{method:'POST',headers:{authorization:'Bearer '+fixture.teacherToken,'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:'{}'});
 assert.equal(invite.status,201);
 const response=teacher.waitForResponse(r=>r.url().endsWith('/delete')&&r.request().method()==='POST');
 await section.getByRole('button',{name:'确认删除课程',exact:true}).click();const deleted=await response;assert.equal(deleted.status(),201);
 assert.equal(new URL(deleted.url()).pathname.split('/').at(-2),fixture.fixture.teacherAActiveSectionId);
 const original=deleted.request(),retried=await fetch(original.url(),{method:'POST',headers:original.headers(),body:original.postData()});assert.equal(retried.status,201);
 assert.deepEqual(await retried.json().then(r=>r.data),await deleted.json().then(r=>r.data));
 await teacher.waitForTimeout(500);await teacher.screenshot({path:output+'/teacher-course-retired.png'});
 const history=await fetch('https://www.student.bnbusports.cn/api/v1/exercise-records/'+fixture.record.id,{headers:{authorization:'Bearer '+fixture.studentSession.accessToken}});assert.equal(history.status,200);
 console.log(JSON.stringify({check:'CLOUD_TEACHER_BROWSER_RETIRE_WITH_ACTIVE_INVITE_IDEMPOTENCY_STUDENT_HISTORY',result:'PASS'}));
}finally{await browser.close();}
