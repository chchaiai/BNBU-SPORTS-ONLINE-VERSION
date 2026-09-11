import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const cloud=process.env.BNBU_CLOSURE_CLOUD==='1',state=JSON.parse(fs.readFileSync(cloud?'.local/closure-cloud-private.json':'.local/v81-browser-state/state.json'));
const fixture=cloud?state:JSON.parse(fs.readFileSync('.local/v81-browser-state/closure-memberships.json'));
const account=cloud?state.teacher:state.accounts.teacher;
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const failures=[];
try{
 for(let pass=0;pass<2;pass++){
  const context=await browser.newContext({reducedMotion:"reduce"}),page=await context.newPage();page.setDefaultTimeout(60000);
  page.on('response',r=>{if(/\/api\/v1\/students\//.test(r.url())&&r.status()>=400)failures.push(r.status());});
  await page.goto(cloud?'https://www.teacher.bnbusports.cn/':'http://localhost:3300/');await page.locator('#login-account').fill(account.email);await page.locator('#login-password').fill(account.password);await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('button',{name:/新建课程/}).waitFor();
  await page.getByRole('button',{name:'学生管理',exact:true}).click();await page.getByRole('tab',{name:/^在课成员/}).waitFor();assert.equal(await page.getByRole('alert').count(),0);
  // A current roster never exposes a historical row or a remove action for it.
  assert.equal(await page.getByRole('row').filter({hasText:'历史成员'}).count(),0);
  await page.getByRole('tab',{name:/非在课成员/}).click();await page.getByRole('row').filter({hasText:'历史成员'}).first().waitFor();assert.equal(await page.getByRole('button',{name:'移出课程',exact:true}).count(),0);
  await page.reload();await page.getByRole('button',{name:'学生管理',exact:true}).click();await page.getByRole('tab',{name:/非在课成员/}).click();await page.getByRole('row').filter({hasText:'历史成员'}).first().waitFor();await page.getByRole('tab',{name:/^在课成员/}).click();assert.equal(await page.getByRole('alert').count(),0);assert.equal(await page.getByRole('row').filter({hasText:'历史成员'}).count(),0);
  await page.screenshot({animations:'disabled',path:'.local/closure-roster-'+(cloud?'cloud':'local')+'-'+pass+'.png'});await context.close();
 }
 assert.deepEqual(failures,[]);console.log(JSON.stringify({check:'COURSE_CLOSURE_ROSTER_BROWSER',environment:cloud?'cloud':'local',result:'PASS',newLogins:2,reloads:2,currentRosterExcludesRemoved:true,historicalReferences:true,noFormerProfile404:true}));
}finally{await browser.close();}
