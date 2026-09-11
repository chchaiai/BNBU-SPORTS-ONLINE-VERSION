import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
const {id}=JSON.parse(fs.readFileSync(new URL(process.env.V81_FEEDBACK_CURRENT==='1'?'../../.local/v81-browser-state/student-feedback-current.json':'../../.local/v81-browser-state/feedback-submission.json',import.meta.url)));
const replyText=process.env.V81_FEEDBACK_HISTORY_REPLY==='1'?'Synthetic second public reply for history':'Synthetic public reply from admin browser';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN';
try {
  const page=await browser.newPage();page.setDefaultTimeout(15000);
  await page.goto('http://localhost:3300/');
  await page.getByLabel('学校邮箱').fill(state.accounts.admin.email);
  await page.locator('#login-password').fill(state.accounts.admin.password);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('button',{name:'学生问题反馈',exact:true}).click();
  stage='OPEN';
  const initialPromise=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/v1/admin/feedback/${id}`);
  await page.getByRole('button',{name:id,exact:true}).click();
  const initial=(await (await initialPromise).json()).data;
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  await dialog.locator('textarea').fill(replyText);
  stage='SAVE';
  let lostResult,releaseLost;
  const lostDelivered=new Promise(resolve=>{releaseLost=resolve;});
  const writeKeys=[];
  if(process.env.V81_FEEDBACK_LOST_RESPONSE==='1'){
    let first=true;
    await page.route(`**/api/v1/admin/feedback/${id}/handling`,async route=>{
      writeKeys.push(route.request().headers()['idempotency-key']);
      if(first){first=false;const committed=await route.fetch();assert.equal(committed.status(),201);lostResult=(await committed.json()).data;await route.abort('failed');releaseLost();}
      else await route.continue();
    });
  }
  const savedPromise=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/v1/admin/feedback/${id}/handling`&&response.request().method()==='POST');
  await dialog.getByRole('button',{name:'保存处理结果',exact:true}).click();
  if(process.env.V81_FEEDBACK_LOST_RESPONSE==='1'){
    await lostDelivered;
    await dialog.getByRole('button',{name:'保存处理结果',exact:true}).click();
  }
  const response=await savedPromise;assert.equal(response.status(),201);
  const result=(await response.json()).data;assert.equal(result.status,'IN_PROGRESS');
  assert.equal(result.version,initial.version+1);
  if(lostResult){assert.deepEqual(result,lostResult);assert.equal(writeKeys.length,2);assert.ok(writeKeys[0]);assert.equal(writeKeys[0],writeKeys[1]);}
  await dialog.waitFor({state:'hidden'});
  const replay=await page.request.post(response.url(),{headers:await response.request().allHeaders(),data:response.request().postData()});
  assert.equal(replay.status(),201);assert.deepEqual((await replay.json()).data,result);
  stage='RELOAD';await page.reload();
  await page.getByRole('button',{name:'学生问题反馈',exact:true}).click();
  const detailPromise=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/v1/admin/feedback/${id}`);
  await page.getByRole('button',{name:id,exact:true}).click();
  const detail=(await (await detailPromise).json()).data;
  assert.equal(detail.history.length,initial.history.length+1);assert.equal(detail.version,result.version);
  await page.getByRole('dialog').getByText(replyText,{exact:true}).first().waitFor();
  console.log(JSON.stringify({check:'ADMIN_BROWSER_FEEDBACK_REPLY_REPLAY_RELOAD_HISTORY',result:'PASS',lostResponseReplay:Boolean(lostResult)}));
}catch(error){console.error(JSON.stringify({check:'ADMIN_BROWSER_FEEDBACK_REPLY_REPLAY_RELOAD_HISTORY',result:'FAIL',stage,type:error.name}));process.exitCode=1;}
finally{await browser.close();}
