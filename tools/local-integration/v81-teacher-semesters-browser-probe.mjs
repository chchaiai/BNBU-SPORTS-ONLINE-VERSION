import fs from 'node:fs';import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});let page,stage='LOGIN';
try{
 page=await browser.newPage();page.setDefaultTimeout(60000);await page.goto('http://localhost:3300/');await page.getByLabel('学校邮箱').fill(state.accounts.teacher.email);await page.locator('#login-password').fill(state.accounts.teacher.password);
 const semestersResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/teacher/semesters');const sectionsResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/class-sections');await page.getByRole('button',{name:'登录',exact:true}).click();
 const response=await semestersResponse;assert.equal(response.status(),200);const result=(await response.json()).data;assert.equal(result.nextCursor,null);
 const sections=(await(await sectionsResponse).json()).data;assert.ok(Array.isArray(sections));stage='ACTUAL_SEMESTER_LABELS';let archivedCourses=0;
 for(const semester of result.items){
  assert.deepEqual(Object.keys(semester).sort(),['id','academicYear','termCode','displayName','status','startDate','endDate','version'].sort());
  const own=sections.filter(section=>section.semesterId===semester.id);assert.ok(own.length);
  for(const section of own){const card=page.locator(`[data-class-section-id="${section.id}"]`);await card.waitFor();await card.getByText(semester.displayName,{exact:true}).waitFor();if(semester.status==='ARCHIVED'){archivedCourses++;await card.getByText('已归档',{exact:true}).waitFor();}}
 }
 assert.equal(await page.getByText('其他学期',{exact:true}).count(),0);
 const fixturePath=new URL('../../.local/v81-browser-state/teacher-semesters-fixture.json',import.meta.url);
 if(fs.existsSync(fixturePath)){const fixture=JSON.parse(fs.readFileSync(fixturePath));assert.ok(result.items.some(item=>item.id===fixture.ownedId));assert.ok(!result.items.some(item=>item.id===fixture.unownedId));assert.ok(archivedCourses>0);
  await page.locator(`[data-class-section-id="${fixture.sectionId}"]`).getByRole('button',{name:/进入课程/}).click();const area=page.getByRole('region',{name:'课程关闭'});await area.getByText('课程已归档，仅保留历史查询和旧事实更正。',{exact:true}).waitFor();assert.equal(await area.getByRole('button',{name:'确认关闭课程',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'保存设置',exact:true}).isDisabled(),true);
 }
 console.log(JSON.stringify({check:'TEACHER_SEMESTERS_BROWSER',result:'PASS',semesters:result.items.length,courseLabelsVerified:sections.length,archivedCourses,projectionKeys:8}));
}catch(error){console.error(JSON.stringify({check:'TEACHER_SEMESTERS_BROWSER',result:'FAIL',stage,type:error.name,message:error.message.slice(0,700)}));process.exitCode=1;}finally{await browser.close();}
