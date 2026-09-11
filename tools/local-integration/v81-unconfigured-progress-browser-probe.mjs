import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN';
let diagnosticPage; const responses=[];
try{
  const page=await browser.newPage(); diagnosticPage=page;
  page.on('response',response=>{const path=new URL(response.url()).pathname;if(path.startsWith('/api/v1/'))responses.push({path,status:response.status()});});
  await page.goto('http://localhost:3300/');
  await page.getByLabel('学校邮箱').fill(state.accounts.teacher.email);
  await page.locator('#login-password').fill(state.accounts.teacher.password);
  const catalogPromise=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/courses'&&response.ok());
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('button',{name:/进入课程/}).first().waitFor();
  const catalog=(await (await catalogPromise).json()).data;
  const courseName=(Array.isArray(catalog)?catalog:catalog.items).find(course=>course.id===state.fixture.activeCourseId)?.courseName;
  assert.ok(courseName);
  stage='UNPUBLISHED_COURSE';
  await page.getByRole('button',{name:/进入课程/}).first().click();
  await page.getByText('尚未发布规则',{exact:true}).waitFor();
  assert.ok(responses.some(item=>item.path.endsWith('/progress-target')&&item.status===404));
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  stage='ENGLISH_SWITCH';
  await page.getByRole('button',{name:'English',exact:true}).click();
  await page.getByRole('button',{name:/Open class/}).first().click();
  await page.getByText('Rules not published',{exact:true}).waitFor();
  console.log(JSON.stringify({check:'UNPUBLISHED_COURSE_TARGET_NOT_FABRICATED',result:'PASS',languages:['zh','en']}));
}catch(error){console.error(JSON.stringify({check:'TEACHER_NAVIGATION',result:'FAIL',stage,type:error.name,diagnostic:diagnosticPage?(await diagnosticPage.locator('[role=dialog]').allTextContents()).map(t=>t.slice(0,500)):[],enterCourseButtons:diagnosticPage?await diagnosticPage.getByRole('button',{name:/进入课程/}).count():0,failedRequests:responses.filter(item=>item.status>=400)}));process.exitCode=1;}
finally{await browser.close();}
