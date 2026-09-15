import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const privatePath='.local/bug15-cloud-private.json',state=JSON.parse(fs.readFileSync(privatePath)),out='evidence/bug-20260915/online';
const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});let p;
try{
 p=await b.newPage({viewport:{width:390,height:844}});p.setDefaultTimeout(20000);
 await p.addInitScript(s=>{if(!localStorage.getItem('bnbu.student.web.apiTokens'))localStorage.setItem('bnbu.student.web.apiTokens',JSON.stringify(s));},state.studentSession);
 await p.goto('https://www.student.bnbusports.cn/student/');await p.getByRole('button',{name:'同意并继续'}).click();
 await p.getByRole('button',{name:'跳过',exact:true}).waitFor();await p.getByRole('button',{name:'跳过',exact:true}).click();
 await p.getByRole('tab',{name:'我的',exact:true}).click();await p.getByRole('button',{name:'去完善',exact:true}).click();
 const form=p.locator('[data-profile-details-form]'),college=form.locator('[data-field="collegeName"]');assert.equal(await college.locator('option').count(),8);
 await college.selectOption('SAI');assert.equal(await form.locator('select[data-field="majorName"] option').count(),35);
 await form.locator('[data-field="majorName"]').selectOption('ACCT');await college.selectOption('FST');assert.equal(await form.locator('[data-field="majorName"]').inputValue(),'');
 assert.equal(await form.locator('[data-field="majorName"] option[value="ACCT"]').count(),0);
 await college.selectOption('GS');await form.locator('input[data-field="majorName"]').fill('invalid');await form.getByRole('button',{name:'保存资料',exact:true}).click();await form.getByRole('alert').waitFor();
 await form.screenshot({path:out+'/student-profile.png'});await form.locator('input[data-field="majorName"]').fill('CUSTOM');
 const response=p.waitForResponse(r=>r.url().endsWith('/me/student-profile')&&r.request().method()==='POST');await form.getByRole('button',{name:'保存资料',exact:true}).click();assert.equal((await response).status(),200);
 await form.waitFor({state:'detached'});
 await p.locator('[data-action="profile.subBack"]').click();await p.getByRole('tab',{name:'打卡',exact:true}).click();
 await p.getByRole('button',{name:'自主运动',exact:true}).click();await p.locator('.sport-grid .sport-btn').last().waitFor();
 await p.setViewportSize({width:390,height:2200});assert.equal(await p.locator('.sport-grid .sport-btn').count(),25);
 await p.screenshot({path:out+'/student-checkin.png',fullPage:true});
 const svgCount=await p.locator('svg').count();assert.ok(svgCount>=24);
 fs.writeFileSync(out+'/student-page-result.json',JSON.stringify({result:'PASS',profile:{colleges:7,saiMajors:34,dependentReset:true,invalidPairExcluded:true,lowercaseRejected:true,saveStatus:200},checkinSvgCount:svgCount,sportOptions:25,scope:'Production pages with isolated synthetic legacy student; session bootstrap'},null,2));console.log('STUDENT_PROFILE_AND_CHECKIN_PAGE PASS');
}catch(e){console.error(e.message);if(p)console.log((await p.locator('body').innerText()).slice(0,2500));process.exitCode=1;}
finally{if(p){const tokens=await p.evaluate(()=>JSON.parse(localStorage.getItem('bnbu.student.web.apiTokens'))).catch(()=>null);if(tokens){state.studentSession=tokens;fs.writeFileSync(privatePath,JSON.stringify(state));}}await b.close();}
