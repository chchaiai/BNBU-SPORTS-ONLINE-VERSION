import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync('.local/v81-browser-state/state.json'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN';
try{
 const page=await browser.newPage();page.setDefaultTimeout(25000);
 await page.goto('http://localhost:3300/');await page.getByLabel('学校邮箱').fill(state.accounts.admin.email);
 await page.locator('#login-password').fill(state.accounts.admin.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 const responsePromise=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/admin/course-directory'&&r.ok());
 await page.getByRole('button',{name:'课程目录看板',exact:true}).click();const data=(await (await responsePromise).json()).data;
 stage='SUMMARY';await page.locator('.admin-course-metrics').waitFor();
 assert.deepEqual(await page.locator('.admin-course-metrics b').allTextContents(),[data.summary.courses,data.summary.students,data.summary.teachers].map(String));
 assert.equal(await page.locator('.admin-course-card').count(),data.rows.length);assert.ok(data.rows.length>0);
 stage='ROWS';
 const hours=s=>`${(s/3600).toLocaleString('zh-CN',{maximumFractionDigits:1})} 小时`;
 for(const row of data.rows){
  await page.getByPlaceholder('课程名称或教师').fill(row.courseName);
  const card=page.locator('.admin-course-card').filter({has:page.getByRole('heading',{name:row.courseName,exact:true})}).filter({hasText:row.teacherName});
  assert.equal(await card.count(),1);
  const m=row.currentMembers;
  assert.deepEqual(await card.locator('.admin-course-card-stats b').allTextContents(),[String(m.students),String(m.submittedStudents),String(m.totalRecords),`${m.validRecords} / ${m.invalidRecords}`,hours(m.creditedSeconds)]);
  await card.getByRole('button',{name:'查看详情',exact:true}).click();
  const details=await card.locator('.admin-course-detail-grid b').allTextContents();
  assert.equal(details[0],data.semester.displayName);assert.equal(details[1],row.teacherName);
  assert.equal(details[3],`${m.students} 名有效 · ${row.removedMembers.students} 名已移出`);
  assert.equal(details[4],row.courseTargetSeconds===null?'—':hours(row.courseTargetSeconds));
  assert.equal(details[5],row.generalTargetSeconds===null?'—':hours(row.generalTargetSeconds));
  assert.equal(details[6],hours(m.students?m.creditedSeconds/m.students:0));
  assert.equal(details[7],row.enrollmentOpen?'开放':'关闭');
 }
 stage='SEARCH_EMPTY';await page.getByPlaceholder('课程名称或教师').fill('nonexistent-'+Date.now());assert.equal(await page.locator('.admin-course-card').count(),0);
 await page.getByPlaceholder('课程名称或教师').fill('');
 stage='REFRESH_RECOVERY';let fail=true;
 await page.route('**/api/v1/admin/course-directory',route=>fail?route.abort('failed'):route.continue());
 await page.getByRole('button',{name:'刷新数据',exact:true}).click();await page.getByRole('alert').waitFor();
 fail=false;const refreshed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/admin/course-directory'&&r.ok());
 await page.getByRole('button',{name:'刷新数据',exact:true}).click();const fresh=(await (await refreshed).json()).data;
 await page.getByRole('alert').waitFor({state:'hidden'});await page.locator('.admin-course-metrics').waitFor();
 assert.deepEqual(await page.locator('.admin-course-metrics b').allTextContents(),[fresh.summary.courses,fresh.summary.students,fresh.summary.teachers].map(String));
 console.log(JSON.stringify({check:'COURSE_DIRECTORY_BROWSER_SERVER_SUMMARY_ROWS_DETAILS_SEARCH_NETWORK_RECOVERY',result:'PASS',courses:data.rows.length}));
}catch(error){console.log(JSON.stringify({stage,error:error.message}));process.exitCode=1;}
finally{await browser.close();}
