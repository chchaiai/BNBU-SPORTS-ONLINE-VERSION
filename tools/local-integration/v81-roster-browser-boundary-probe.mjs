import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN';
try{
  const page=await browser.newPage();page.setDefaultTimeout(15000);
  await page.goto('http://localhost:3300/');
  await page.getByLabel('学校邮箱').fill(state.accounts.teacher.email);
  await page.locator('#login-password').fill(state.accounts.teacher.password);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('button',{name:/新建课程/}).waitFor();
  stage='ROSTER';
  await page.getByRole('button',{name:'名单对齐',exact:true}).first().click();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button',{name:'导入官方名单',exact:true}).click();
  const file=page.getByLabel('选择学校官方课程名单文件');
  assert.equal(await file.getAttribute('accept'),'.xlsx,.csv');
  await page.getByText(/最多 500 行/).waitFor();
  const writes=[];page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('roster'))writes.push(new URL(request.url()).pathname);});
  stage='XLS_REJECTION';
  await file.setInputFiles({name:'synthetic-legacy.xls',mimeType:'application/vnd.ms-excel',buffer:Buffer.from('synthetic invalid legacy file')});
  await page.getByText(/旧版 .xls 请先另存为 .xlsx/).waitFor();
  stage='ROW_LIMIT';
  const csv=rows=>Buffer.from('学号,姓名\n'+Array.from({length:rows},(_,i)=>`${String(i+1).padStart(8,'0')},Synthetic ${i+1}`).join('\n'));
  await file.setInputFiles({name:'synthetic-501.csv',mimeType:'text/csv',buffer:csv(501)});
  await page.getByText('名单超过 500 行，请拆分或整理后重新导入。',{exact:true}).waitFor();
  stage='VALID_PREVIEW';
  await file.setInputFiles({name:'synthetic-500.csv',mimeType:'text/csv',buffer:csv(500)});
  await page.getByRole('button',{name:'本地预检',exact:true}).click();
  await page.getByRole('button',{name:'确认创建新版本',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'确认创建新版本',exact:true}).isEnabled(),true);
  assert.deepEqual(writes,[]);
  console.log(JSON.stringify({check:'ROSTER_BROWSER_500_PREVIEW_501_REJECT_XLS_REJECT_NO_WRITE',result:'PASS'}));
}catch(error){console.error(JSON.stringify({check:'ROSTER_BROWSER_BOUNDARIES',result:'FAIL',stage,type:error.name}));process.exitCode=1;}
finally{await browser.close();}
