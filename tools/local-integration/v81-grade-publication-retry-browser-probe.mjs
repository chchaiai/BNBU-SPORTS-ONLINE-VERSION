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
  await page.getByRole('button',{name:'内部成绩册',exact:true}).click();
  await page.waitForLoadState('networkidle');
  await page.getByRole('combobox',{name:'当前课程',exact:true}).click();
  await page.getByRole('option',{name:courseName,exact:true}).click();
  const edit=page.getByRole('button',{name:/录入成绩|查看 \/ 修改成绩/}).first();
  await edit.click();
  await page.getByLabel('最终成绩').fill('127');
  const saved=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/final-grades'));
  await page.getByRole('button',{name:'保存成绩',exact:true}).click();
  assert.equal((await saved).status(),201);
  stage='PUBLISH_LOST_RESPONSE';
  let publication, publishKey, publishRetryKey;
  await page.route('**/enrollments/*/final-grades',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    if(!publication){
      publishKey=route.request().headers()['idempotency-key'];
      const response=await route.fetch();assert.equal(response.status(),201);
      publication=(await response.json()).data;await route.abort('failed');
    }else{publishRetryKey=route.request().headers()['idempotency-key'];await route.continue();}
  });
  stage='OPEN_PUBLICATION';
  await page.getByRole('button',{name:/发布成绩（/}).click();
  await page.getByRole('button',{name:'确认发布',exact:true}).click();
  stage='WAIT_PUBLICATION_ERROR';
  await page.getByRole('alert').waitFor();
  assert.equal(publication.published,true);
  stage='RETRY_PUBLICATION';
  const pubRetry=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/final-grades'));
  await page.getByRole('button',{name:'确认发布',exact:true}).click();
  const pubResponse=await pubRetry;assert.equal(pubResponse.status(),201);
  const publishedAgain=(await pubResponse.json()).data;
  assert.equal(publishedAgain.version,publication.version);assert.equal(publishKey,publishRetryKey);
  console.log(JSON.stringify({check:'FINAL_GRADE_PUBLICATION_LOST_RESPONSE_REPLAY',result:'PASS',version:publication.version}));


}catch(error){console.error(JSON.stringify({check:'TEACHER_NAVIGATION',result:'FAIL',stage,type:error.name,message:error.message.slice(0,700),buttons:diagnosticPage?await diagnosticPage.getByRole('button').allTextContents():[],enterCourseButtons:diagnosticPage?await diagnosticPage.getByRole('button',{name:/进入课程/}).count():0,failedRequests:responses.filter(item=>item.status>=400)}));process.exitCode=1;}
finally{await browser.close();}
