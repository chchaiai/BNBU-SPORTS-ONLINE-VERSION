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
  stage='PREPARE_TWO_DRAFTS';
  const drafts=[];
  for(let index=0;index<2;index++){
    await page.getByRole('button',{name:/录入成绩|查看 \/ 修改成绩/}).nth(index).click();
    await page.getByLabel('最终成绩').fill(String(130+index));
    const saved=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/final-grades'));
    await page.getByRole('button',{name:'保存成绩',exact:true}).click();
    const response=await saved;assert.equal(response.status(),201);drafts.push((await response.json()).data);
    await page.getByRole('button',{name:'保存成绩',exact:true}).waitFor({state:'hidden'});
  }
  stage='PARTIAL_PUBLICATION';
  const attempts=[],committed=[];
  await page.route('**/enrollments/*/final-grades',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    const input=route.request().postDataJSON();
    assert.equal(input.published,true);
    attempts.push({url:route.request().url(),key:route.request().headers()['idempotency-key'],input});
    const response=await route.fetch();assert.equal(response.status(),201);
    committed.push((await response.json()).data);
    if(attempts.length===2)await route.abort('failed');else await route.fulfill({response});
  });
  await page.getByRole('button',{name:'发布成绩（2）',exact:true}).click();
  await page.getByRole('button',{name:'确认发布',exact:true}).click();
  await page.getByRole('alert').waitFor();
  assert.equal(attempts.length,2);
  assert.equal(new Set(committed.map(item=>item.enrollmentId)).size,2);
  stage='RESUME_PUBLICATION';
  await page.getByRole('button',{name:'确认发布',exact:true}).click();
  await page.getByRole('button',{name:'确认发布',exact:true}).waitFor({state:'hidden'});
  assert.equal(attempts.length,3);
  assert.equal(attempts[2].url,attempts[1].url);assert.equal(attempts[2].key,attempts[1].key);
  assert.deepEqual(attempts[2].input,attempts[1].input);
  assert.deepEqual(committed[2],committed[1]);
  for(const draft of drafts){const pub=committed.find(item=>item.enrollmentId===draft.enrollmentId);assert.equal(pub.version,draft.version+1);}
  await page.reload();await page.waitForLoadState('networkidle');
  await page.getByRole('button',{name:'内部成绩册',exact:true}).click();
  await page.getByRole('combobox',{name:'当前课程',exact:true}).click();
  await page.getByRole('option',{name:courseName,exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'查看 / 修改成绩',exact:true}).count(),2);
  console.log(JSON.stringify({check:'BATCH_GRADE_PARTIAL_PUBLICATION_RETRY',result:'PASS',students:2,requests:3,firstStudentRepeated:false,secondStudentSameKey:true}));
}catch(error){console.error(JSON.stringify({check:'TEACHER_NAVIGATION',result:'FAIL',stage,type:error.name,message:error.message.slice(0,700),buttons:diagnosticPage?await diagnosticPage.getByRole('button').allTextContents():[],enterCourseButtons:diagnosticPage?await diagnosticPage.getByRole('button',{name:/进入课程/}).count():0,failedRequests:responses.filter(item=>item.status>=400)}));process.exitCode=1;}
finally{await browser.close();}
