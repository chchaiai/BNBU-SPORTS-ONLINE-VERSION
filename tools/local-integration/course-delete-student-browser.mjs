// Exercise the real exemption and certification UI with isolated accounts and actual image uploads.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const cloud=process.env.BNBU_APPLICATION_CLOUD==='1';
const origin=cloud?'https://www.student.bnbusports.cn':'http://127.0.0.1:4274';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});


const f=JSON.parse(fs.readFileSync(cloud?'.local/course-delete-cloud-private.json':'.local/v81-browser-state/course-delete-private.json'));
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(auth=>{localStorage.setItem('bnbu.student.web.apiTokens',JSON.stringify(auth));localStorage.setItem('bnbu.student.web.session',JSON.stringify({kind:'api',accountId:auth.accountId,signedInAt:new Date().toISOString()}));},{...f.studentSession,userId:f.record.studentUserId,accountId:'SYNTH-SESSION-REVIEW-'+f.record.studentEmail.split('.')[2].replace('review-','').toUpperCase(),schemaVersion:2});
 const page=await context.newPage();page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)console.log('API',new URL(r.url()).pathname,r.status());});page.setDefaultTimeout(30000);await page.goto(origin+'/student/');
 await page.getByRole('button',{name:'同意并继续',exact:true}).click();
 await page.evaluate(async()=>{window.joinProbe=(await import('/student/js/app.js')).app;});
 try{await page.waitForFunction(()=>window.joinProbe.state.authenticated&&!window.joinProbe.state.isLoading&&!window.joinProbe.state.isRestoringSession);}catch(e){console.log((await page.locator('body').innerText()).slice(0,1600));throw e;}
 if(await page.getByText('运动指引',{exact:true}).isVisible())await page.getByRole('button',{name:'跳过',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.joinProbe.hasActiveEnrollment()),false);
 await page.locator('[data-action="dashboard.enterCode"]').click();await page.getByRole('textbox').first().waitFor();
 await page.waitForTimeout(500);await page.screenshot({path:'.local/course-delete-student-join-'+(cloud?'cloud':'local')+'.png'});
 console.log(JSON.stringify({check:'VERIFIED_STUDENT_WITHOUT_COURSE_JOIN',result:'PASS',environment:cloud?'cloud':'local',authenticated:true,noEnrollment:true,inviteCodeEntry:true}));
}finally{await browser.close();}
