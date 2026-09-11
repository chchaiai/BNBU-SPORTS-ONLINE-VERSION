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
  await page.getByRole('combobox',{name:'当前课程',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'当前课程',exact:true}).click();
  await page.getByRole('option',{name:courseName,exact:true}).click();
  const edit=page.getByRole('button',{name:/录入成绩|查看 \/ 修改成绩/}).first();
  await edit.click();
  stage='LOST_RESPONSE';
  await page.getByLabel('最终成绩').fill('124');
  let committed, firstInput, firstKey, retryInput, retryKey, accessDenied=false;
  await page.route('**/enrollments/*/final-grades',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    const input=route.request().postDataJSON();
    const key=route.request().headers()['idempotency-key'];
    if(!committed){
      const response=await route.fetch();assert.equal(response.status(),201);
      committed=(await response.json()).data;firstInput=input;firstKey=key;
      await route.abort('failed');
    }else if(process.env.GRADE_ACCESS_DENIAL==='1'&&!accessDenied){
      accessDenied=true;
      await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'PERMISSION_DENIED',message:'Synthetic access denial',details:{},requestId:crypto.randomUUID()})});
    }else{retryInput=input;retryKey=key;await route.continue();}
  });
  await page.getByRole('button',{name:'保存成绩',exact:true}).click();
  await page.getByRole('alert').waitFor();
  assert.ok(committed);
  if(process.env.GRADE_ACCESS_DENIAL==='1'){
    const denied=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/final-grades'));
    await page.getByRole('button',{name:'保存成绩',exact:true}).click();
    assert.equal((await denied).status(),403);await page.getByRole('alert').waitFor();
    const retained=await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('bnbu-final-grade-pending-v1:')).map(k=>JSON.parse(sessionStorage.getItem(k))));
    assert.ok(retained.flat().some(([,intent])=>intent.key===firstKey));
    console.log(JSON.stringify({check:'FINAL_GRADE_UNCONFIRMED_ACCESS_DENIAL_RETAINS_INTENT',result:'PASS'}));
  }
  if(process.env.GRADE_RELOAD==='1'){
    await page.reload();await page.getByRole('button',{name:'内部成绩册',exact:true}).click();
    await page.getByRole('combobox',{name:'当前课程',exact:true}).click();await page.getByRole('option',{name:courseName,exact:true}).click();
    await page.getByRole('button',{name:/录入成绩|查看 \/ 修改成绩/}).first().click();
    assert.equal(await page.getByLabel('最终成绩').inputValue(),'124');
  }
  const retry=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/final-grades'));
  await page.getByRole('button',{name:'保存成绩',exact:true}).click();
  const response=await retry;assert.equal(response.status(),201);
  const replay=(await response.json()).data;
  console.log(JSON.stringify({check:'FINAL_GRADE_LOST_RESPONSE_REPLAY',firstVersion:committed.version,retryVersion:replay.version,sameKey:firstKey===retryKey,sameInput:JSON.stringify(firstInput)===JSON.stringify(retryInput)}));
  assert.equal(replay.version,committed.version);
  assert.equal(firstKey,retryKey);assert.deepEqual(firstInput,retryInput);
  console.log(JSON.stringify({check:'FINAL_GRADE_LOST_RESPONSE_REPLAY',result:'PASS'}));
  await page.unroute('**/enrollments/*/final-grades');
  await page.getByRole('button',{name:'查看 / 修改成绩',exact:true}).first().click();
  await page.getByLabel('最终成绩').fill('125');
  stage='VERSION_CONFLICT';
  let concurrent, overwriteRequests=0;
  await page.route('**/enrollments/*/final-grades',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    overwriteRequests++;
    if(!concurrent){
      const input=route.request().postDataJSON();
      const response=await route.fetch({postData:{...input,finalGrade:126},headers:{...route.request().headers(),'idempotency-key':crypto.randomUUID()}});
      assert.equal(response.status(),201);concurrent=(await response.json()).data;
    }
    await route.continue();
  });
  const conflict=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/final-grades'));
  await page.getByRole('button',{name:'保存成绩',exact:true}).click();
  assert.equal((await conflict).status(),409);
  await page.getByRole('alert').waitFor();
  assert.equal(overwriteRequests,1);
  assert.equal(await page.getByLabel('最终成绩').inputValue(),'125');
  const confirmed=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/final-grades'));
  await page.getByRole('button',{name:'保存成绩',exact:true}).click();
  const confirmation=await confirmed;assert.equal(confirmation.status(),201);
  const final=(await confirmation.json()).data;assert.equal(final.finalGrade,125);assert.equal(final.version,concurrent.version+1);
  console.log(JSON.stringify({check:'FINAL_GRADE_CONFLICT_REQUIRES_EXPLICIT_RETRY',result:'PASS',concurrentVersion:concurrent.version,confirmedVersion:final.version}));
  await page.unroute('**/enrollments/*/final-grades');
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
  await page.getByRole('button',{name:/发布成绩（/}).click();
  await page.getByRole('button',{name:'确认发布',exact:true}).click();
  await page.getByRole('alert').waitFor();
  assert.equal(publication.published,true);
  if(process.env.GRADE_RELOAD==='1'){
    await page.reload();await page.getByRole('button',{name:'内部成绩册',exact:true}).click();
    await page.getByRole('combobox',{name:'当前课程',exact:true}).click();await page.getByRole('option',{name:courseName,exact:true}).click();
    await page.getByRole('button',{name:/发布成绩（/}).click();
  }
  const pubRetry=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/final-grades'));
  await page.getByRole('button',{name:'确认发布',exact:true}).click();
  const pubResponse=await pubRetry;assert.equal(pubResponse.status(),201);
  const publishedAgain=(await pubResponse.json()).data;
  assert.equal(publishedAgain.version,publication.version);assert.equal(publishKey,publishRetryKey);
  console.log(JSON.stringify({check:'FINAL_GRADE_PUBLICATION_LOST_RESPONSE_REPLAY',result:'PASS',version:publication.version}));


}catch(error){console.error(JSON.stringify({check:'TEACHER_NAVIGATION',result:'FAIL',stage,type:error.name,enterCourseButtons:diagnosticPage?await diagnosticPage.getByRole('button',{name:/进入课程/}).count():0,failedRequests:responses.filter(item=>item.status>=400)}));process.exitCode=1;}
finally{await browser.close();}
