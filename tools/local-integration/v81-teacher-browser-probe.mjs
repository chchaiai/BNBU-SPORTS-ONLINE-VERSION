import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const cloud=process.env.BNBU_BASIC_CLOUD==='1';
const fixture=JSON.parse(fs.readFileSync(cloud?'.local/round2-cloud-long-private.json':'.local/v81-browser-state/state.json'));
const state=cloud?{accounts:{teacher:fixture.teacher}}:fixture;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN';
let diagnosticPage; const responses=[];
try{
  const page=await browser.newPage(); diagnosticPage=page;
  page.on('response',response=>{const path=new URL(response.url()).pathname;if(path.startsWith('/api/v1/'))responses.push({path,status:response.status()});});
  await page.goto(cloud?'https://www.teacher.bnbusports.cn/':'http://localhost:3300/');
  await page.locator('#login-account').fill(state.accounts.teacher.email);
  await page.locator('#login-password').fill(state.accounts.teacher.password);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('button',{name:/进入课程/}).first().waitFor();
  for(const name of ['学生管理','打卡审核','内部成绩册','免测与认证','课程管理']){
    stage=name;
    const start=responses.length;
    await page.getByRole('button',{name,exact:true}).click();
    if(name==='免测与认证')await page.getByRole('searchbox',{name:'搜索认证申请'}).waitFor();else await page.getByRole('heading',{name,exact:true}).first().waitFor();
    console.log(JSON.stringify({check:'TEACHER_PAGE_READ',page:name,requestCount:responses.length-start,
      hasErrorPanel:await page.getByRole('alert').count()>0}));
    assert.equal(await page.getByRole('alert').count(),0);
  }
  console.log(JSON.stringify({check:'TEACHER_NAVIGATION',result:'PASS',expectedUnconfiguredTargets:responses.filter(item=>item.status===404&&item.path.endsWith('/progress-target')).length}));
}catch(error){console.error(JSON.stringify({check:'TEACHER_NAVIGATION',result:'FAIL',stage,type:error.name,enterCourseButtons:diagnosticPage?await diagnosticPage.getByRole('button',{name:/进入课程/}).count():0,expectedUnconfiguredTargets:responses.filter(item=>item.status===404&&item.path.endsWith('/progress-target')).length}));process.exitCode=1;}
finally{await browser.close();}
